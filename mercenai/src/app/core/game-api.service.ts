import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { GameSnapshot } from '../models/game-state';
import { Recruit } from '../models/recruit';
import { Mission } from '../models/mission';
import { OperaSummary } from '../models/opera';
import { LogEntry } from '../models/log';

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

  fireRecruit(id: string): Promise<StateResponse> {
    return firstValueFrom(this.http.post<StateResponse>(`${this.base}/recruits/${id}/fire`, {}).pipe(catchError(err => of(this.onError(err)))));
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

  getMissionHistory(): Promise<{ missions: Mission[] }> {
    return firstValueFrom(this.http.get<{ missions: Mission[] }>(`${this.base}/missions/history`));
  }

  chooseOpera(id: string, optionId: string): Promise<{ success?: boolean; error?: string }> {
    return firstValueFrom(
      this.http.post<{ success?: boolean; error?: string }>(`/api/opera/${id}/choose`, { optionId })
        .pipe(catchError(err => of(this.onError(err))))
    );
  }

  // Fire-and-forget telemetry hook, not a player-facing action: the caller
  // (command.service.ts's routeCommand()) never awaits this, so command
  // responsiveness never depends on Opera tracking. It still returns the
  // response (rather than subscribing and discarding it) so OperaService can
  // apply the fresh opera state once it lands — see opera.service.ts's
  // recordCommand() for why that matters for local, UI-only commands.
  recordOperaCommand(command: string, args: string[]): Promise<{ operas: OperaSummary[]; operaLogs: Record<string, LogEntry[]> } | null> {
    return firstValueFrom(
      this.http.post<{ operas: OperaSummary[]; operaLogs: Record<string, LogEntry[]> }>('/api/opera/command', { command, args })
        .pipe(catchError(() => of(null))),
    );
  }

  devRefresh(): Promise<{ error?: string }> {
    return firstValueFrom(this.http.post<{ error?: string }>(`${this.base}/dev/refresh`, {}).pipe(catchError(err => of(this.onError(err)))));
  }

  devSetCredits(amount: number): Promise<{ error?: string }> {
    return firstValueFrom(this.http.post<{ error?: string }>(`${this.base}/dev/credits`, { amount }).pipe(catchError(err => of(this.onError(err)))));
  }

  devSetTokens(amount: number): Promise<{ error?: string }> {
    return firstValueFrom(this.http.post<{ error?: string }>(`${this.base}/dev/tokens`, { amount }).pipe(catchError(err => of(this.onError(err)))));
  }

  devReboot(): Promise<{ error?: string }> {
    return firstValueFrom(this.http.post<{ error?: string }>(`${this.base}/dev/reboot`, {}).pipe(catchError(err => of(this.onError(err)))));
  }
}
