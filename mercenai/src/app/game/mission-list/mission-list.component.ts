import { Component, inject } from '@angular/core';
import { CommonModule, NgFor } from '@angular/common';
import { MissionService } from '../../core/mission.service';
import { LayoutService } from '../../core/layout.service';
import { PanelModule } from '../../models/panel';
import { Mission } from '../../models/mission';

@Component({
  selector: 'app-mission-list',
  standalone: true,
  imports: [CommonModule, NgFor],
  templateUrl: './mission-list.component.html',
  styleUrl: './mission-list.component.scss'
})
export class MissionListComponent {
  missionService = inject(MissionService);
  layout = inject(LayoutService);

  get missions(): Mission[] {
    return this.missionService.missions;
  }

  registerCommands() {
    return {
      'detail': (id: string) => {
        if (!id) {
          console.warn('Usage: detail <id>');
          return;
        }
        this.layout.addPanel(PanelModule.MissionDetail, { id: Number(id) });
      }
    };
  }
}
