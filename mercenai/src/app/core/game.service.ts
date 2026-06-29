import { inject, Injectable, Injector } from '@angular/core';
import { Recruit, RecruitStatus } from '../models/recruit';
import { Subject } from 'rxjs';
import { GameSnapshot } from '../models/game-state';
import { GameApiService } from './game-api.service';
import { GameSyncService } from './game-sync.service';

@Injectable({ providedIn: 'root' })
export class GameService {
  private api = inject(GameApiService);
  private injector = inject(Injector);

  recruitHired$ = new Subject<Recruit>();
  recruits: Recruit[] = [];
  maxRecruits = 5;

  applyState(state: GameSnapshot): void {
    this.recruits = state.recruits;
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
