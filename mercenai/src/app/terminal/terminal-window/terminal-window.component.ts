import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutService } from '../../core/layout.service';
import { TerminalPanelComponent } from '../terminal-panel/terminal-panel.component';

@Component({
  selector: 'app-terminal-window',
  standalone: true,
  imports: [CommonModule, TerminalPanelComponent],
  templateUrl: './terminal-window.component.html',
  styleUrl: './terminal-window.component.scss',
})
export class TerminalWindowComponent {
  layout = inject(LayoutService);

  constructor() {
    this.layout.addPanel('none');
  }
}
