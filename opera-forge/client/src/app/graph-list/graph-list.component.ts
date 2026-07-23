import { Component, OnInit, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GraphApiService } from '../core/graph-api.service';
import { GraphSummary } from '../models/graph';

@Component({
  selector: 'app-graph-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './graph-list.component.html',
  styleUrl: './graph-list.component.scss',
})
export class GraphListComponent implements OnInit {
  private api = inject(GraphApiService);

  readonly graphs = signal<GraphSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly showCreateForm = signal(false);
  readonly newId = signal('');
  readonly newTitle = signal('');
  readonly newDescription = signal('');
  readonly createError = signal<string | null>(null);

  readonly openGraph = output<string>();

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.graphs.set(await this.api.listGraphs());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load graphs');
    } finally {
      this.loading.set(false);
    }
  }

  slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  onTitleInput(title: string): void {
    this.newTitle.set(title);
    this.newId.set(this.slugify(title));
  }

  async createGraph(): Promise<void> {
    const id = this.newId().trim();
    const title = this.newTitle().trim();
    if (!id || !title) {
      this.createError.set('Id and title are required.');
      return;
    }
    this.createError.set(null);
    try {
      await this.api.createGraph(id, title, this.newDescription().trim());
      this.showCreateForm.set(false);
      this.newId.set('');
      this.newTitle.set('');
      this.newDescription.set('');
      await this.refresh();
      this.openGraph.emit(id);
    } catch (err) {
      this.createError.set(err instanceof Error ? err.message : 'Failed to create graph');
    }
  }

  async deleteGraph(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(`Delete "${id}"? This cannot be undone.`)) return;
    try {
      await this.api.deleteGraph(id);
      await this.refresh();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to delete graph');
    }
  }
}
