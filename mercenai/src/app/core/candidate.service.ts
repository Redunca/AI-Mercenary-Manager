import { inject, Injectable, Injector } from '@angular/core';
import { Candidate } from '../models/candidate';
import { Recruit } from '../models/recruit';
import { GameApiService } from './game-api.service';
import { GameSyncService } from './game-sync.service';
import { GameSnapshot } from '../models/game-state';

@Injectable({ providedIn: 'root' })
export class CandidateService {
  private api = inject(GameApiService);
  private injector = inject(Injector);

  candidates: Candidate[] = [];

  applyState(state: GameSnapshot): void {
    this.candidates = state.candidates;
  }

  async hireCandidate(candidateId: string): Promise<{ recruit: Recruit | null; error: string | null }> {
    const result = await this.api.hireCandidate(candidateId);
    if (result.error || !result.recruit) {
      return { recruit: null, error: result.error ?? `Candidate ${candidateId} not found` };
    }
    if (result.state) {
      this.injector.get(GameSyncService).applyState(result.state);
    }
    return { recruit: result.recruit, error: null };
  }
}
