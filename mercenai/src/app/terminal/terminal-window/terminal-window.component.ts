import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutService } from '../../core/layout.service';
import { TerminalPanelComponent } from '../terminal-panel/terminal-panel.component';
import { LayoutNodeComponent } from '../layout-node/layout-node.component';

@Component({
  selector: 'app-terminal-window',
  standalone: true,
  imports: [CommonModule, TerminalPanelComponent, LayoutNodeComponent],
  templateUrl: './terminal-window.component.html',
  styleUrl: './terminal-window.component.scss',
})
export class TerminalWindowComponent implements OnInit {
  layout = inject(LayoutService);

  ngOnInit(): void {
    this.layout.addPanel('none');
  }
}
