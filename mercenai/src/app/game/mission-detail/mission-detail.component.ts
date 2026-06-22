import { Component, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MissionService } from '../../core/mission.service';
import { GameService } from '../../core/game.service';
import { Mission, MissionState } from '../../models/mission';

@Component({
  selector: 'app-mission-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mission-detail.component.html',
  styleUrl: './mission-detail.component.scss'
})
export class MissionDetailComponent {
  @Input() id!: number;

  missionService = inject(MissionService);
  game = inject(GameService);

  get mission(): Mission | null {
    return this.missionService.missions[this.id] ?? null;
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
      'stop': () => this.missionService.forceReturn(this.id)
    };
  }
}
