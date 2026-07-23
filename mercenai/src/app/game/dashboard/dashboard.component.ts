import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../core/game.service';
import { MissionService } from '../../core/mission.service';
import { ShipService } from '../../core/ship.service';
import { GameSyncService } from '../../core/game-sync.service';
import { OperaService } from '../../core/opera.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  game = inject(GameService);
  missionService = inject(MissionService);
  shipService = inject(ShipService);
  operaService = inject(OperaService);
  private sync = inject(GameSyncService);

  ngOnInit(): void {
    this.sync.watchMissionProgress();
  }

  ngOnDestroy(): void {
    this.sync.unwatchMissionProgress();
  }

  get activeMissions() {
    return Object.values(this.missionService.missionStates).filter((s) => s.phase !== 'COMPLETED');
  }

  get availableRecruits() {
    return this.game.recruits.filter((r) => r.status === 'available');
  }

  get totalMissions() {
    return this.game.player$.value.maxAvailableMissions;
  }
  get totalRecruits() {
    return this.game.recruits.length;
  }
  get tokens() {
    return this.game.player$.value.tokens;
  }

  // Surfaced here (rather than making the player already know to type
  // "opera detail <id>") since the tutorial is the one opera every new
  // player has running before they've discovered the opera commands at all.
  get tutorial() {
    return this.operaService.operas.find((o) => o.templateId === 'tutorial');
  }

  getMissionName(missionId: number): string {
    return this.missionService.missions.find((m) => m.id === missionId)?.name ?? String(missionId);
  }

  getShipName(shipId: number): string {
    return this.shipService.getShipById(shipId)?.name ?? String(shipId);
  }

  progressBar(progress: number): string {
    const filled = Math.round(progress / 10);
    return '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + ']';
  }

  pad(str: string, len: number): string {
    return str.length >= len ? str : str + ' '.repeat(len - str.length);
  }

  registerCommands() {
    return {};
  }
}
