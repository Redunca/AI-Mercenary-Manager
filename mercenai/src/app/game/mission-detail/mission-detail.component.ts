import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MissionService } from '../../core/mission.service';
import { GameService } from '../../core/game.service';
import { GameSyncService } from '../../core/game-sync.service';
import { Mission, MissionState } from '../../models/mission';

@Component({
  selector: 'app-mission-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mission-detail.component.html',
  styleUrl: './mission-detail.component.scss'
})
export class MissionDetailComponent implements OnInit, OnDestroy {
  @Input() id!: number;

  missionService = inject(MissionService);
  game = inject(GameService);
  private sync = inject(GameSyncService);

  ngOnInit(): void {
    this.sync.watchMissionProgress();
  }

  ngOnDestroy(): void {
    this.sync.unwatchMissionProgress();
  }

  get mission(): Mission | null {
    return this.missionService.missions.find(m => m.id === this.id) ?? null;
  }

  get state(): MissionState | undefined {
    return this.missionService.getState(this.id);
  }

  get recruitName(): string {
    const recruitId = this.state?.recruitId ?? this.mission?.assignedRecruitId;
    if (recruitId == null) return '—';
    return this.game.getRecruit(String(recruitId))?.name ?? String(recruitId);
  }

  get progressBar(): string {
    const progress = this.state?.progress ?? 0;
    const filled = Math.round(progress / 5); // barre sur 20 caractères
    return '[' + '█'.repeat(filled) + '░'.repeat(20 - filled) + ']';
  }

  registerCommands() {
    return {
      'stop': () => { void this.missionService.forceReturn(this.id); }
    };
  }
}
