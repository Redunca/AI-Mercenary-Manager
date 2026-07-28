import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MissionService } from '../../core/mission.service';
import { ShipService } from '../../core/ship.service';
import { GameSyncService } from '../../core/game-sync.service';
import { GameService } from '../../core/game.service';
import { Mission, MissionEvent, MissionState } from '../../models/mission';
import { FACTION_REWARD_MULTIPLIER } from '../../models/faction';
import { PERK_ATTRIBUTE_MODIFIERS, Recruit } from '../../models/recruit';
import { formatCountdown } from '../../core/refresh-countdown';

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

  assignError: string | null = null;

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

  // The four pre-commitment fields below are only real if the matching
  // self-shop scanner has been bought (see self.service.js/upgrades.json
  // ids 12-15) -- otherwise show a masked placeholder (see mission-list's
  // identical helpers).
  get difficultyLabel(): string {
    if (!this.mission) return '—';
    return this.game.player$.value.hasDifficultyScanner ? this.mission.difficulty : '???';
  }

  get difficultyClass(): string {
    if (!this.mission || !this.game.player$.value.hasDifficultyScanner) return 'masked';
    return `difficulty-${this.mission.difficulty.toLowerCase()}`;
  }

  get durationLabel(): string {
    if (!this.mission) return '—';
    return this.game.player$.value.hasDurationScanner
      ? '~' + formatCountdown(this.mission.estimatedDurationMs)
      : '~???';
  }

  get combatLabel(): string {
    if (!this.mission) return '—';
    return this.game.player$.value.hasCombatScanner ? (this.mission.hasCombat ? 'yes' : 'no') : '???';
  }

  get skillChecksLabel(): string {
    if (!this.mission) return '—';
    if (!this.game.player$.value.hasSkillCheckScanner) return '???';
    return this.mission.skillChecks.length > 0 ? this.mission.skillChecks.join(', ') : '—';
  }

  get progressBar(): string {
    const progress = this.state?.progress ?? 0;
    const filled = Math.round(progress / 5); // bar over 20 characters
    return '[' + '█'.repeat(filled) + '░'.repeat(20 - filled) + ']';
  }

  // The next unresolved event, if any -- see resolveEvents' one-shot
  // manual-assignment fallback in game.service.js. null once every event
  // has resolved (mission is in RETURN or COMPLETED).
  get nextEvent(): MissionEvent | null {
    if (!this.state) return null;
    const { events, currentEventIndex } = this.state;
    return currentEventIndex < events.length ? events[currentEventIndex] : null;
  }

  // Crew eligible to be assigned to nextEvent, sorted by effective value
  // (raw stat + any matching perk/flaw modifier) descending -- the point is
  // showing real odds, not just the raw stat. Empty for COMBAT events
  // (full-crew auto-battle, no recruit choice) or once there's no next
  // event at all.
  get assignableCrew(): { id: string; name: string; value: number; modifier: number }[] {
    const event = this.nextEvent;
    if (!event || event.type === 'COMBAT' || !this.state) return [];
    const crewIds = this.shipService.getShipById(this.state.shipId)?.crew ?? [];
    return crewIds
      .map((recruitId) => this.game.getRecruit(String(recruitId)))
      .filter((r): r is Recruit => !!r && r.status !== 'dead')
      .map((r) => ({
        id: r.id,
        name: r.name,
        value: r.attributes[event.attribute],
        modifier: [...(r.perks ?? []), ...(r.flaws ?? [])].reduce((total, trait) => {
          const effect = PERK_ATTRIBUTE_MODIFIERS[trait.name];
          return effect && effect.attribute === event.attribute ? total + effect.amount : total;
        }, 0),
      }))
      .sort((a, b) => b.value + b.modifier - (a.value + a.modifier));
  }

  get assignedRecruitName(): string | null {
    const id = this.state?.assignedRecruitId;
    return id ? (this.game.getRecruit(id)?.name ?? null) : null;
  }

  statBar(value: number): string {
    return '[' + '■'.repeat(value) + '□'.repeat(10 - value) + ']';
  }

  registerCommands() {
    return {
      stop: () => {
        void this.missionService.forceReturn(this.id);
      },
      assign: (recruitId: string) => {
        if (!recruitId) {
          console.warn('Usage: assign <recruitId>');
          return;
        }
        if (!this.state || this.nextEvent == null) return;
        this.assignError = null;
        void this.missionService
          .assignEventRecruit(this.id, this.state.currentEventIndex, recruitId)
          .then((err) => {
            if (err) this.assignError = err;
          });
      },
    };
  }
}
