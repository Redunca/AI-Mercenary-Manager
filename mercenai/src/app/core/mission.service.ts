import { inject, Injectable, Injector } from '@angular/core';
import { Mission, MissionState } from '../models/mission';
import { GameApiService } from './game-api.service';
import { GameSyncService } from './game-sync.service';
import { GameSnapshot } from '../models/game-state';

@Injectable({ providedIn: 'root' })
export class MissionService {
  private api = inject(GameApiService);
  private injector = inject(Injector);

  missions: Mission[] = [];
  missionStates: Record<number, MissionState> = {};

  applyState(state: GameSnapshot): void {
    this.missions = state.missions;
    this.missionStates = state.missionStates;
  }

  async startMission(missionId: number, shipId: number): Promise<string | null> {
    const result = await this.api.startMission(missionId, shipId);
    if (result.error) return result.error;
    if (result.state) this.injector.get(GameSyncService).applyState(result.state);
    return null;
  }

  async stopMission(missionId: number): Promise<string | null> {
    const result = await this.api.stopMission(missionId);
    if (result.error) return result.error;
    if (result.state) this.injector.get(GameSyncService).applyState(result.state);
    return null;
  }

  async forceReturn(missionId: number): Promise<string | null> {
    const result = await this.api.forceReturnMission(missionId);
    if (result.error) return result.error;
    if (result.state) this.injector.get(GameSyncService).applyState(result.state);
    return null;
  }

  getState(missionId: number): MissionState | undefined {
    return this.missionStates[missionId];
  }

  // Fetched on demand (not part of the periodic sync payload) since the
  // full history can grow unbounded, unlike the live batch. Always hits the
  // API fresh rather than caching, so a re-opened completed view reflects
  // missions finished since the last fetch.
  async getMissionHistory(): Promise<Mission[]> {
    const result = await this.api.getMissionHistory();
    return result.missions;
  }
}
