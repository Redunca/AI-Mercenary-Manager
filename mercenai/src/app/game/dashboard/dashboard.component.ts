import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../core/game.service';
import { MissionService } from '../../core/mission.service';
import { GameSyncService } from '../../core/game-sync.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  game = inject(GameService);
  missionService = inject(MissionService);
  private sync = inject(GameSyncService);

  ngOnInit(): void {
    this.sync.watchMissionProgress();
  }

  ngOnDestroy(): void {
    this.sync.unwatchMissionProgress();
  }

  get activeMissions() {
    return Object.values(this.missionService.missionStates)
      .filter(s => s.phase !== 'TERMINEE');
  }

  get availableRecruits() {
    const busyIds = new Set(this.activeMissions.map(s => s.recruitId));
    return this.game.recruits.filter(r => !busyIds.has(Number(r.id)));
  }

  get totalMissions() { return this.missionService.missions.length; }
  get totalRecruits()  { return this.game.recruits.length; }

  getMissionName(missionId: number): string {
    return this.missionService.missions.find(m => m.id === missionId)?.name ?? String(missionId);
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
