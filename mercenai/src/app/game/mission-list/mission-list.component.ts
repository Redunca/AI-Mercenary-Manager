import {
  Component,
  inject,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { CommonModule, NgFor } from '@angular/common';
import { MissionService } from '../../core/mission.service';
import { LayoutService } from '../../core/layout.service';
import { GameSyncService } from '../../core/game-sync.service';
import { GameService } from '../../core/game.service';
import { PanelModule } from '../../models/panel';
import { Mission } from '../../models/mission';
import { msUntilNextRefresh, formatCountdown } from '../../core/refresh-countdown';

@Component({
  selector: 'app-mission-list',
  standalone: true,
  imports: [CommonModule, NgFor],
  templateUrl: './mission-list.component.html',
  styleUrl: './mission-list.component.scss',
})
export class MissionListComponent implements OnInit, OnChanges, OnDestroy {
  // Whether this panel shows the live batch (default) or full mission
  // history (success/failed missions from every batch, fetched on demand
  // via `mission list --completed`). See terminal-panel.component.html's
  // [completed]="panel.data?.completed" binding.
  @Input() completed = false;

  missionService = inject(MissionService);
  layout = inject(LayoutService);
  private sync = inject(GameSyncService);
  private game = inject(GameService);
  private ngZone = inject(NgZone);

  completedMissions: Mission[] = [];
  historyLoading = false;
  historyError: string | null = null;
  nextRefreshLabel = '—';

  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.sync.watchMissionProgress();
    this.tickCountdown();
    // Runs outside Angular's zone: a ticking display clock has no business
    // being a testability/stability signal (fixture.whenStable() would
    // otherwise never resolve while this panel is open), and it would
    // trigger an app-wide change detection pass every second for no reason.
    this.ngZone.runOutsideAngular(() => {
      this.countdownTimer = setInterval(() => this.ngZone.run(() => this.tickCountdown()), 1000);
    });
  }

  // Since switching between live and completed mode reuses the same panel
  // (and therefore the same component instance — see terminal-panel's
  // ngSwitchCase), ngOnInit alone wouldn't catch a later flip of the
  // `completed` input. ngOnChanges fires on both the initial binding and any
  // subsequent one, so it's the one place that needs to trigger the fetch.
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['completed'] && this.completed) {
      void this.loadHistory();
    }
  }

  ngOnDestroy(): void {
    this.sync.unwatchMissionProgress();
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  get missions(): Mission[] {
    return this.completed ? this.completedMissions : this.missionService.missions;
  }

  private tickCountdown(): void {
    const intervalMs = this.game.player$.value.missionRefreshIntervalMs;
    this.nextRefreshLabel = formatCountdown(msUntilNextRefresh(intervalMs));
  }

  private async loadHistory(): Promise<void> {
    this.historyLoading = true;
    this.historyError = null;
    try {
      this.completedMissions = await this.missionService.getMissionHistory();
    } catch {
      this.historyError = 'Failed to load mission history';
    } finally {
      this.historyLoading = false;
    }
  }

  registerCommands() {
    return {
      detail: (id: string) => {
        if (!id) {
          console.warn('Usage: detail <id>');
          return;
        }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionDetail, {
          id: Number(id),
        });
      },
      // Local equivalent of the global "mission list --completed" / "mission -c"
      // command, shortcut-able from within the mission-list panel itself.
      completed: () => {
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionList, {
          completed: true,
        });
      },
    };
  }
}
