import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../core/game.service';
import { MissionService } from '../../core/mission.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  game = inject(GameService);
  missionService = inject(MissionService);

  get activeMissions() {
    return Object.values(this.missionService.missionStates)
      .filter(s => s.phase !== 'TERMINEE');
  }

  get availableRecruits() {
    const busyIds = new Set(this.activeMissions.map(s => s.recruitId));
    return this.game.recruits.filter(r => !busyIds.has(Number(r.id)));
  }

  get totalMissions() { return Object.keys(this.missionService.missions).length; }
  get totalRecruits()  { return this.game.recruits.length; }

  getMissionName(missionId: number): string {
    return this.missionService.missions[missionId]?.name ?? String(missionId);
  }

  getRecruitName(recruitId: number): string {
    return this.game.getRecruit(String(recruitId))?.name ?? String(recruitId);
  }

  progressBar(progress: number): string {
    const filled = Math.round(progress / 10);
    return '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + ']';
  }

  pad(str: string, len: number): string {
    return str.length >= len ? str : str + ' '.repeat(len - str.length);
  }

  registerCommands() { return {}; }
}
