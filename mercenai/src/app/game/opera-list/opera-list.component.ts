import { Component, inject } from '@angular/core';
import { CommonModule, NgFor } from '@angular/common';
import { OperaService } from '../../core/opera.service';
import { LayoutService } from '../../core/layout.service';
import { PanelModule } from '../../models/panel';
import { OperaSummary } from '../../models/opera';

@Component({
  selector: 'app-opera-list',
  standalone: true,
  imports: [CommonModule, NgFor],
  templateUrl: './opera-list.component.html',
  styleUrl: './opera-list.component.scss'
})
export class OperaListComponent {
  operaService = inject(OperaService);
  layout = inject(LayoutService);

  get operas(): OperaSummary[] {
    return this.operaService.operas;
  }

  completedStepCount(opera: OperaSummary): number {
    return opera.steps.filter(s => s.completed).length;
  }

  registerCommands() {
    return {
      'detail': (id: string) => {
        if (!id) {
          console.warn('Usage: detail <id>');
          return;
        }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.OperaDetail, { id });
      },
      'start': (id: string) => {
        if (!id) {
          console.warn('Usage: start <id>');
          return;
        }
        void this.operaService.startOpera(id).then(err => {
          if (err) console.error(`[opera start] ${err}`);
        });
      },
    };
  }
}
