import { Component, forwardRef, inject, Input } from '@angular/core';
import { LayoutNode, LayoutService } from '../../core/layout.service';
import { CommonModule } from '@angular/common';
import { TerminalPanelComponent } from '../terminal-panel/terminal-panel.component';

@Component({
  selector: 'app-layout-node',
  standalone: true,
  imports: [CommonModule, TerminalPanelComponent, forwardRef(() => LayoutNodeComponent)],
  templateUrl: './layout-node.component.html',
  styleUrl: './layout-node.component.scss'
})
export class LayoutNodeComponent {
  @Input() node!: LayoutNode;
  layout = inject(LayoutService);

  getPanel(){
    if(this.node){
      return this.layout.panels[this.node.panelId];
    }
    else
      {
        return null;
      }
  }
}
