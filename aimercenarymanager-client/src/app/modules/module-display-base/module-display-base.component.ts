import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { SanitizePipe } from '../../shared/sanitize.pipe';

@Component({
  selector: 'app-module-display-base',
  standalone: true,
  imports: [CommonModule, SanitizePipe],
  templateUrl: './module-display-base.component.html',
  styleUrl: './module-display-base.component.sass'
})

export class ModuleDisplayBaseComponent {
  @Input() userName = '';
  @Input() moduleTitle = '';
  @Input() isSelected = false;
  @Input() hasRightNeighbor = false;
  @Input() hasLeftNeighbor = false;
  @Input() hasTopNeighbor = false;
  @Input() hasBottomNeighbor = false;
}
