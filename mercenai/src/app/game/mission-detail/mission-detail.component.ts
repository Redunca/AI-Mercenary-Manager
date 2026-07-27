import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MissionService } from '../../core/mission.service';
import { ShipService } from '../../core/ship.service';
import { GameSyncService } from '../../core/game-sync.service';
import { GameService } from '../../core/game.service';
import { Mission, MissionState } from '../../models/mission';
import { FACTION_REWARD_MULTIPLIER } from '../../models/faction';

@Component({
  selector: 'app-mission-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mission-detail.component.html',
  styleUrl: './mission-detail.component.scss',
})
export class MissionDetailComponent implements OnInit, OnDestroy {
  @Input() id!: number;

  missionService = inject(MissionService);
  shipService = inject(ShipService);
  private game = inject(GameService);
  private sync = inject(GameSyncService);

  ngOnInit(): void {
    this.sync.watchMissionProgress();
  }

  ngOnDestroy(): void {
    this.sync.unwatchMissionProgress();
  }

  get mission(): Mission | null {
    return this.missionService.missions.find((m) => m.id === this.id) ?? null;
  }

  get state(): MissionState | undefined {
    return this.missionService.getState(this.id);
  }

  get shipName(): string {
    const shipId = this.state?.shipId ?? this.mission?.assignedShipId;
    if (shipId == null) return '—';
    return this.shipService.getShipById(shipId)?.name ?? String(shipId);
  }

  // A mission's host and antagonist are frequently both present at once --
  // see mission-list's identical helper for why both are shown.
  get orgLabel(): string {
    if (!this.mission) return '—';
    const parts: string[] = [];
    if (this.mission.forFaction) parts.push(`for ${this.mission.forFaction}`);
    if (this.mission.againstFaction) parts.push(`against ${this.mission.againstFaction}`);
    return parts.length > 0 ? parts.join(' / ') : '—';
  }

  // Live reward multiplier a "for" mission's credits will be scaled by,
  // based on current standing (see mission-list's identical helper).
  get rewardMultiplierLabel(): string {
    const forFaction = this.mission?.forFaction;
    if (!forFaction) return '';
    const tier = this.game.getFactionReputation(forFaction).tier;
    const pct = Math.round(FACTION_REWARD_MULTIPLIER[tier] * 100);
    if (pct === 0) return '';
    return pct > 0 ? `+${pct}%` : `${pct}%`;
  }

  get progressBar(): string {
    const progress = this.state?.progress ?? 0;
    const filled = Math.round(progress / 5); // bar over 20 characters
    return '[' + '█'.repeat(filled) + '░'.repeat(20 - filled) + ']';
  }

  registerCommands() {
    return {
      stop: () => {
        void this.missionService.forceReturn(this.id);
      },
    };
  }
}
