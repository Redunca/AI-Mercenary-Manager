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

  async startMission(missionId: number, recruitId: number): Promise<void> {
    const result = await this.api.startMission(missionId, recruitId);
    if (result.error) {
      console.warn(result.error);
      return;
    }
    if (result.state) {
      this.injector.get(GameSyncService).applyState(result.state);
    }
  }

  async stopMission(missionId: number): Promise<void> {
    const result = await this.api.stopMission(missionId);
    if (result.error) {
      console.warn(result.error);
      return;
    }
    if (result.state) {
      this.injector.get(GameSyncService).applyState(result.state);
    }
  }

  async forceReturn(missionId: number): Promise<void> {
    const result = await this.api.forceReturnMission(missionId);
    if (result.error) {
      console.warn(result.error);
      return;
    }
    if (result.state) {
      this.injector.get(GameSyncService).applyState(result.state);
    }
  }

  getState(missionId: number): MissionState | undefined {
    return this.missionStates[missionId];
  }
}
