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

  async generateCandidates(count: number): Promise<void> {
    const result = await this.api.refreshCandidates(count);
    if (result.state) {
      this.injector.get(GameSyncService).applyState(result.state);
    }
  }

  async hireCandidate(candidateId: string): Promise<Recruit | null> {
    const result = await this.api.hireCandidate(candidateId);
    if (result.error || !result.recruit) {
      console.warn(result.error ?? `Candidat ${candidateId} introuvable`);
      return null;
    }
    if (result.state) {
      this.injector.get(GameSyncService).applyState(result.state);
    }
    return result.recruit;
  }
}
