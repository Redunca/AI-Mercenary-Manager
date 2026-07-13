import { inject, Injectable, OnDestroy } from '@angular/core';
import { GameApiService } from './game-api.service';
import { GameService } from './game.service';
import { CandidateService } from './candidate.service';
import { MissionService } from './mission.service';
import { LogService } from './log.service';
import { ShipService } from './ship.service';
import { GameSnapshot } from '../models/game-state';

const POLL_INTERVAL_MS = 2000;
const MISSION_WATCH_INTERVAL_MS = 1000;

@Injectable({ providedIn: 'root' })
export class GameSyncService implements OnDestroy {
  private api = inject(GameApiService);
  private game = inject(GameService);
  private candidates = inject(CandidateService);
  private missions = inject(MissionService);
  private logs = inject(LogService);
  private ships = inject(ShipService);

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private watchCount = 0;
  private lastState: GameSnapshot | null = null;
  ready = false;

  async init(): Promise<void> {
    const state = await this.api.sync();
    this.applyState(state);
    this.ready = true;
    this.updatePolling(state);
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  watchMissionProgress(): void {
    this.watchCount++;
    this.reconcilePolling();
  }

  unwatchMissionProgress(): void {
    this.watchCount = Math.max(0, this.watchCount - 1);
    this.reconcilePolling();
  }

  async sync(): Promise<GameSnapshot> {
    const state = await this.api.sync();
    this.applyState(state);
    this.updatePolling(state);
    return state;
  }

  applyState(state: GameSnapshot): void {
    this.game.applyState(state);
    this.candidates.applyState(state);
    this.missions.applyState(state);
    this.logs.applyState(state);
    this.ships.applyState(state);
    this.lastState = state;
    this.reconcilePolling();
  }

  private updatePolling(state: GameSnapshot): void {
    this.lastState = state;
    this.reconcilePolling();
  }

  private hasActiveMissions(): boolean {
    if (!this.lastState) return false;
    return Object.values(this.lastState.missionStates)
      .some(s => s.phase !== 'COMPLETED');
  }

  private pollIntervalMs(): number | null {
    if (!this.hasActiveMissions()) return null;
    return this.watchCount > 0 ? MISSION_WATCH_INTERVAL_MS : POLL_INTERVAL_MS;
  }

  private reconcilePolling(): void {
    this.stopPolling();
    const interval = this.pollIntervalMs();
    if (interval === null) return;

    this.pollTimer = setInterval(() => {
      this.sync().catch(err => console.error('Game sync failed', err));
    }, interval);
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }
}
