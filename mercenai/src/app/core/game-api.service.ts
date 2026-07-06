import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
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

  private onError(err: unknown): StateResponse {
    if (err instanceof HttpErrorResponse && err.error?.error) {
      return { error: err.error.error };
    }
    return { error: 'Erreur serveur' };
  }

  getState(): Promise<GameSnapshot> {
    return firstValueFrom(this.http.get<GameSnapshot>(`${this.base}/state`));
  }

  sync(): Promise<GameSnapshot> {
    return firstValueFrom(this.http.post<GameSnapshot>(`${this.base}/sync`, {}));
  }

  hireCandidate(id: string): Promise<StateResponse> {
    return firstValueFrom(this.http.post<StateResponse>(`${this.base}/candidates/${id}/hire`, {}).pipe(catchError(err => of(this.onError(err)))));
  }

  refreshCandidates(count = 5): Promise<StateResponse> {
    return firstValueFrom(this.http.post<StateResponse>(`${this.base}/candidates/refresh`, { count }).pipe(catchError(err => of(this.onError(err)))));
  }

  renameRecruit(id: string, name: string): Promise<StateResponse> {
    return firstValueFrom(this.http.patch<StateResponse>(`${this.base}/recruits/${id}`, { name }).pipe(catchError(err => of(this.onError(err)))));
  }

  startMission(templateId: number, shipId: number): Promise<StateResponse> {
    return firstValueFrom(this.http.post<StateResponse>(`${this.base}/missions/${templateId}/start`, { shipId }).pipe(catchError(err => of(this.onError(err)))));
  }

  stopMission(templateId: number): Promise<StateResponse> {
    return firstValueFrom(this.http.post<StateResponse>(`${this.base}/missions/${templateId}/stop`, {}).pipe(catchError(err => of(this.onError(err)))));
  }

  forceReturnMission(templateId: number): Promise<StateResponse> {
    return firstValueFrom(this.http.post<StateResponse>(`${this.base}/missions/${templateId}/force-return`, {}).pipe(catchError(err => of(this.onError(err)))));
  }

  getMissionLogs(templateId: number): Promise<{ logs: { tag: string; message: string }[] }> {
    return firstValueFrom(this.http.get<{ logs: { tag: string; message: string }[] }>(`${this.base}/missions/${templateId}/logs`));
  }
}
