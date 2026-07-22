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

  async chooseOpera(id: string, optionId: string): Promise<string | null> {
    const result = await this.api.chooseOpera(id, optionId);
    if (result.error) return result.error;
    await this.injector.get(GameSyncService).sync();
    return null;
  }

  // Fire-and-forget: reports every command the player types so
  // execute_command Opera steps can be detected, including panel-local
  // commands (split-h, split-v, ...) with no other backend correlate.
  // Applies the returned opera state once it resolves -- these local
  // commands have no other REST call whose response would otherwise pick up
  // a step it just completed, and GameSyncService's polling only runs while
  // a mission is active or a recruit is regenerating, so without this a
  // completed step could sit unrevealed until an unrelated sync happened.
  recordCommand(command: string, args: string[]): void {
    void this.api.recordOperaCommand(command, args).then(result => {
      if (!result) return;
      this.operas = result.operas;
      this.operaLogs = result.operaLogs;
    });
  }

  getState(id: string): OperaSummary | undefined {
    return this.operas.find(o => o.id === id);
  }

  get logs(): Record<string, LogEntry[]> {
    return this.operaLogs;
  }
}
