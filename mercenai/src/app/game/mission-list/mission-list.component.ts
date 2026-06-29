import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, NgFor } from '@angular/common';
import { MissionService } from '../../core/mission.service';
import { LayoutService } from '../../core/layout.service';
import { GameSyncService } from '../../core/game-sync.service';
import { PanelModule } from '../../models/panel';
import { Mission } from '../../models/mission';

@Component({
  selector: 'app-mission-list',
  standalone: true,
  imports: [CommonModule, NgFor],
  templateUrl: './mission-list.component.html',
  styleUrl: './mission-list.component.scss'
})
export class MissionListComponent implements OnInit, OnDestroy {
  missionService = inject(MissionService);
  layout = inject(LayoutService);
  private sync = inject(GameSyncService);

  ngOnInit(): void {
    this.sync.watchMissionProgress();
  }

  ngOnDestroy(): void {
    this.sync.unwatchMissionProgress();
  }

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
