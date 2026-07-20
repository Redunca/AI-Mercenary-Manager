import { Component, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GraphApiService } from '../core/graph-api.service';
import { ATTRIBUTES, Attribute, GenerationResult, InitialMockState } from '../models/graph';

function parseList(text: string): string[] {
  return text.split(',').map(s => s.trim()).filter(Boolean);
}

@Component({
  selector: 'app-quick-generation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quick-generation.component.html',
  styleUrl: './quick-generation.component.scss',
})
export class QuickGenerationComponent {
  readonly graphId = input.required<string>();

  private api = inject(GraphApiService);

  readonly attributes = ATTRIBUTES;

  readonly itemsText = signal('');
  readonly attributeValues = signal<Partial<Record<Attribute, number>>>({});
  readonly seed = signal(String(Math.floor(Math.random() * 1e9)));

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<GenerationResult | null>(null);

  setAttribute(attr: Attribute, value: number): void {
    this.attributeValues.update(v => ({ ...v, [attr]: value }));
  }

  randomizeSeed(): void {
    this.seed.set(String(Math.floor(Math.random() * 1e9)));
  }

  async generate(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const initialState: InitialMockState = {
      items: parseList(this.itemsText()),
      attributes: this.attributeValues(),
    };
    try {
      this.result.set(await this.api.generate(this.graphId(), initialState, this.seed()));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      this.loading.set(false);
    }
  }
}
