import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Candidate } from '../../models/candidate';
import { CandidateService } from '../../core/candidate.service';
import { LayoutService } from '../../core/layout.service';
import { GameService } from '../../core/game.service';
import { PanelModule } from '../../models/panel';
import { msUntilNextRefresh, formatCountdown } from '../../core/refresh-countdown';

@Component({
  selector: 'app-candidate-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './candidate-list.component.html',
  styleUrl: './candidate-list.component.scss',
})
export class CandidateListComponent implements OnInit, OnDestroy {
  candidateService = inject(CandidateService);
  layout = inject(LayoutService);
  private game = inject(GameService);
  private ngZone = inject(NgZone);

  nextRefreshLabel = '—';

  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.tickCountdown();
    // Runs outside Angular's zone: a ticking display clock has no business
    // being a testability/stability signal, and it would trigger an
    // app-wide change detection pass every second for no reason.
    this.ngZone.runOutsideAngular(() => {
      this.countdownTimer = setInterval(() => this.ngZone.run(() => this.tickCountdown()), 1000);
    });
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  get candidates(): Candidate[] {
    return this.candidateService.candidates;
  }

  archetypeLabel(c: Candidate): string {
    switch (c.archetype) {
      case 'specialized':
        return 'Specialist';
      case 'well-rounded':
        return 'Versatile';
      case 'jack-of-all-trades':
        return 'Jack-of-all-trades';
    }
  }

  perkNames(c: Candidate): string {
    return c.perks.map((p) => p.name).join(', ');
  }

  flawNames(c: Candidate): string {
    return c.flaws.map((f) => f.name).join(', ');
  }

  private tickCountdown(): void {
    const intervalMs = this.game.player$.value.candidateRefreshIntervalMs;
    this.nextRefreshLabel = formatCountdown(msUntilNextRefresh(intervalMs));
  }

  registerCommands() {
    return {
      detail: (id: string) => {
        if (!id) {
          console.warn('Usage: detail <id>');
          return;
        }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.CandidateDetail, { id });
      },
    };
  }
}
