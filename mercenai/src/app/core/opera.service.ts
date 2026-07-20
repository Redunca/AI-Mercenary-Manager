import { inject, Injectable, Injector } from '@angular/core';
import { OperaSummary } from '../models/opera';
import { LogEntry } from '../models/log';
import { GameApiService } from './game-api.service';
import { GameSyncService } from './game-sync.service';
import { GameSnapshot } from '../models/game-state';

@Injectable({ providedIn: 'root' })
export class OperaService {
  private api = inject(GameApiService);
  private injector = inject(Injector);

  operas: OperaSummary[] = [];
  operaLogs: Record<string, LogEntry[]> = {};

  applyState(state: GameSnapshot): void {
    this.operas = state.operas;
    this.operaLogs = state.operaLogs;
  }

  async startOpera(id: string): Promise<string | null> {
    const result = await this.api.startOpera(id);
    if (result.error) return result.error;
    await this.injector.get(GameSyncService).sync();
    return null;
  }

  // Fire-and-forget: reports every command the player types so
  // execute_command Opera steps can be detected, including panel-local
  // commands (split-h, split-v, ...) with no other backend correlate.
  recordCommand(command: string, args: string[]): void {
    this.api.recordOperaCommand(command, args);
  }

  getState(id: string): OperaSummary | undefined {
    return this.operas.find(o => o.id === id);
  }

  get logs(): Record<string, LogEntry[]> {
    return this.operaLogs;
  }
}
