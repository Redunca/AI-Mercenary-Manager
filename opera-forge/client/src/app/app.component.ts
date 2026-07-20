import { Component, signal } from '@angular/core';
import { GraphListComponent } from './graph-list/graph-list.component';
import { GraphEditorComponent } from './graph-editor/graph-editor.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GraphListComponent, GraphEditorComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly openGraphId = signal<string | null>(null);

  open(id: string): void {
    this.openGraphId.set(id);
  }

  closeEditor(): void {
    this.openGraphId.set(null);
  }
}
