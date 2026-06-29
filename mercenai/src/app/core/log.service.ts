import { Injectable } from '@angular/core';
import { LogEntry } from '../models/log';
import { GameSnapshot } from '../models/game-state';

@Injectable({ providedIn: 'root' })
export class LogService {
  globalLogs: LogEntry[] = [];
  missionLogs: Record<number, LogEntry[]> = {};

  applyState(state: GameSnapshot): void {
    this.globalLogs = state.globalLogs;
    this.missionLogs = state.missionLogs;
  }
}
