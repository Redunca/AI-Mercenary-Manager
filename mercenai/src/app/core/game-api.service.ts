import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GameSnapshot } from '../models/game-state';
import { Recruit } from '../models/recruit';

interface StateResponse {
  state?: GameSnapshot;
  recruit?: Recruit;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class GameApiService {
  private http = inject(HttpClient);
  private base = '/api/game';

  getState(): Promise<GameSnapshot> {
    return firstValueFrom(this.http.get<GameSnapshot>(`${this.base}/state`));
  }

  sync(): Promise<GameSnapshot> {
    return firstValueFrom(this.http.post<GameSnapshot>(`${this.base}/sync`, {}));
  }

  hireCandidate(id: string): Promise<StateResponse> {
    return firstValueFrom(this.http.post<StateResponse>(`${this.base}/candidates/${id}/hire`, {}));
  }

  refreshCandidates(count = 5): Promise<StateResponse> {
    return firstValueFrom(this.http.post<StateResponse>(`${this.base}/candidates/refresh`, { count }));
  }

  renameRecruit(id: string, name: string): Promise<StateResponse> {
    return firstValueFrom(this.http.patch<StateResponse>(`${this.base}/recruits/${id}`, { name }));
  }

  startMission(templateId: number, recruitId: number): Promise<StateResponse> {
    return firstValueFrom(this.http.post<StateResponse>(`${this.base}/missions/${templateId}/start`, { recruitId }));
  }

  stopMission(templateId: number): Promise<StateResponse> {
    return firstValueFrom(this.http.post<StateResponse>(`${this.base}/missions/${templateId}/stop`, {}));
  }

  forceReturnMission(templateId: number): Promise<StateResponse> {
    return firstValueFrom(this.http.post<StateResponse>(`${this.base}/missions/${templateId}/force-return`, {}));
  }
}
