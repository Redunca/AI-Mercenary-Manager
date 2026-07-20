import { inject, Injectable, Injector } from '@angular/core';
import { Recruit, RecruitStatus } from '../models/recruit';
import { BehaviorSubject, Subject } from 'rxjs';
import { GameSnapshot } from '../models/game-state';
import { GameApiService } from './game-api.service';
import { GameSyncService } from './game-sync.service';
import { Player } from '../models/player';

@Injectable({ providedIn: 'root' })
export class GameService {
  private api = inject(GameApiService);
  private injector = inject(Injector);

  recruitHired$ = new Subject<Recruit>();
  recruits: Recruit[] = [];
  player$ = new BehaviorSubject<Player>({
      credits: 0,
      tokens: 0,
      dockingStations: [],
      maxAvailableMissions: 5,
      maxNumberOfRecruits: 5,
      missionRefreshIntervalMs: 900000,
      shopRefreshIntervalMs: 900000,
    });



  applyState(state: GameSnapshot): void {
    this.recruits = state.recruits;
    this.player$.next({
      credits: state.player.credits,
      tokens: state.player.tokens,
      dockingStations: [],
      maxNumberOfRecruits: state.player.maxNumberOfRecruits,
      maxAvailableMissions: state.player.maxAvailableMissions,
      missionRefreshIntervalMs: state.player.missionRefreshIntervalMs,
      shopRefreshIntervalMs: state.player.shopRefreshIntervalMs,
    });
  }

  getRecruit(id: string): Recruit | null {
    return this.recruits.find(r => r.id === id) ?? null;
  }

  async renameRecruit(id: string, newName: string): Promise<void> {
    const result = await this.api.renameRecruit(id, newName);
    if (result.state) {
      this.injector.get(GameSyncService).applyState(result.state);
    }
  }

  setRecruitStatus(_id: string, _status: RecruitStatus): void {
    // Status is owned by the server; refreshed via sync.
  }
}
