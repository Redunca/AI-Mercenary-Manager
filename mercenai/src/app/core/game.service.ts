import { inject, Injectable, Injector } from '@angular/core';
import { Recruit, RecruitStatus } from '../models/recruit';
import { BehaviorSubject, Subject } from 'rxjs';
import { GameSnapshot } from '../models/game-state';
import { GameApiService } from './game-api.service';
import { GameSyncService } from './game-sync.service';
import { Player } from '../models/player';
import { Relationship, RelationshipTier } from '../models/relationship';

@Injectable({ providedIn: 'root' })
export class GameService {
  private api = inject(GameApiService);
  private injector = inject(Injector);

  recruitHired$ = new Subject<Recruit>();
  recruits: Recruit[] = [];
  relationships: Relationship[] = [];
  player$ = new BehaviorSubject<Player>({
    credits: 0,
    tokens: 0,
    dockingStations: [],
    maxAvailableMissions: 5,
    maxNumberOfRecruits: 5,
    missionRefreshIntervalMs: 900000,
    shopRefreshIntervalMs: 900000,
    candidateRefreshIntervalMs: 300000,
    hospitalSlots: 1,
    hospitalHealIntervalMs: 60000,
  });

  applyState(state: GameSnapshot): void {
    this.recruits = state.recruits;
    this.relationships = state.relationships;
    this.player$.next({
      credits: state.player.credits,
      tokens: state.player.tokens,
      dockingStations: [],
      maxNumberOfRecruits: state.player.maxNumberOfRecruits,
      maxAvailableMissions: state.player.maxAvailableMissions,
      missionRefreshIntervalMs: state.player.missionRefreshIntervalMs,
      shopRefreshIntervalMs: state.player.shopRefreshIntervalMs,
      candidateRefreshIntervalMs: state.player.candidateRefreshIntervalMs,
      hospitalSlots: state.player.hospitalSlots,
      hospitalHealIntervalMs: state.player.hospitalHealIntervalMs,
    });
  }

  getRecruit(id: string): Recruit | null {
    return this.recruits.find((r) => r.id === id) ?? null;
  }

  // The other side of every relationship pair involving `recruitId`, for
  // the recruit-detail view's relationships section.
  getRelationshipsFor(
    recruitId: string,
  ): { recruit: Recruit | null; score: number; tier: RelationshipTier }[] {
    return this.relationships
      .filter((r) => r.recruitAId === recruitId || r.recruitBId === recruitId)
      .map((r) => {
        const otherId = r.recruitAId === recruitId ? r.recruitBId : r.recruitAId;
        return { recruit: this.getRecruit(otherId), score: r.score, tier: r.tier };
      });
  }

  async renameRecruit(id: string, newName: string): Promise<void> {
    const result = await this.api.renameRecruit(id, newName);
    if (result.state) {
      this.injector.get(GameSyncService).applyState(result.state);
    }
  }

  async fireRecruit(id: string): Promise<string | null> {
    const result = await this.api.fireRecruit(id);
    if (result.error) return result.error;
    if (result.state) {
      this.injector.get(GameSyncService).applyState(result.state);
    }
    return null;
  }

  setRecruitStatus(_id: string, _status: RecruitStatus): void {
    // Status is owned by the server; refreshed via sync.
  }
}
