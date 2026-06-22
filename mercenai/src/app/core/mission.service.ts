import { inject, Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import {
  EventResult,
  Mission,
  MissionEventResult,
  MissionLogEvent,
  MissionPhase,
  MissionState,
  MissionStatus,
} from '../models/mission';
import { GameService } from './game.service';
import { DiceService } from './dice.service';
import missionsData from '../data/missions.json';

const DURATION_PER_EVENT_MS = 15_000;
const TICK_MS = 500;

@Injectable({ providedIn: 'root' })
export class MissionService {
  private game = inject(GameService);
  private dice = inject(DiceService);

  missions: Mission[] = (missionsData as Mission[]).map(m => ({
    ...m,
    assignedRecruitId: null,
    status: 'available' as MissionStatus,
  }));

  missionStates: Record<number, MissionState> = {};
  logEvents$ = new Subject<MissionLogEvent>();
  eventResults$ = new Subject<MissionEventResult>();

  startMission(missionId: number, recruitId: number): void {
    const mission = this.missions.find(m => m.id === missionId);
    if (!mission || mission.status !== 'available') return;

    const recruit = this.game.getRecruit(String(recruitId));
    if (!recruit || recruit.status === 'dead') {
      console.warn(`Recrue ${recruitId} introuvable ou morte`);
      return;
    }

    const recruitBusy = Object.values(this.missionStates)
      .some(s => s.recruitId === recruitId && s.phase !== 'TERMINEE');
    if (recruitBusy) {
      console.warn(`Recrue ${recruitId} déjà en mission`);
      return;
    }

    mission.status = 'in_progress';
    mission.assignedRecruitId = recruitId;
    this.game.setRecruitStatus(String(recruitId), 'in_mission');

    const durationMs = mission.events.length * DURATION_PER_EVENT_MS;

    const state: MissionState = {
      missionId, recruitId,
      phase: 'EN_ROUTE', progress: 0,
      events: [...mission.events],
      currentEventIndex: 0,
      eventResults: [],
      failed: false,
      rewardForfeited: false,
      intervalId: null,
    };
    this.missionStates[missionId] = state;

    this.emitPhase(state, mission, 'EN_ROUTE');

    const totalTicks = durationMs / TICK_MS;
    let tick = 0;
    let lastPhase: MissionPhase = 'EN_ROUTE';

    state.intervalId = setInterval(() => {
      tick++;
      state.progress = Math.min(100, Math.round((tick / totalTicks) * 100));

      const newPhase: MissionPhase =
        state.progress <= 33 ? 'EN_ROUTE'
        : state.progress <= 66 ? 'EVENEMENT'
        : state.progress < 100 ? 'RETOUR'
        : 'TERMINEE';

      if (newPhase !== lastPhase) {
        lastPhase = newPhase;
        state.phase = newPhase;
        this.emitPhase(state, mission, newPhase);

        if (newPhase === 'EVENEMENT') {
          this.resolveEvents(state, mission);
        }

        if (newPhase === 'TERMINEE') {
          mission.status = state.failed ? 'failed' : 'success';
          if (!state.failed) {
            this.game.setRecruitStatus(String(recruitId), 'available');
          }
          clearInterval(state.intervalId!);
        }
      }
    }, TICK_MS);
  }

  stopMission(missionId: number): void {
    const state = this.missionStates[missionId];
    if (state?.intervalId) clearInterval(state.intervalId);

    const mission = this.missions.find(m => m.id === missionId);
    if (mission) {
      const recruit = this.game.getRecruit(String(state?.recruitId));
      if (recruit?.status === 'in_mission') {
        this.game.setRecruitStatus(String(state.recruitId), 'available');
      }
      mission.status = 'available';
      mission.assignedRecruitId = null;
    }
    delete this.missionStates[missionId];
  }

  forceReturn(missionId: number): void {
    const state = this.missionStates[missionId];
    if (!state || state.phase === 'TERMINEE' || state.phase === 'RETOUR') return;

    if (state.intervalId) clearInterval(state.intervalId);

    const mission = this.missions.find(m => m.id === missionId);
    if (!mission) return;

    const durationMs = mission.events.length * DURATION_PER_EVENT_MS;
    const currentProgress = state.progress;
    const returnDurationMs = state.phase === 'EN_ROUTE'
      ? (currentProgress / 100) * durationMs
      : durationMs / 3;

    state.phase = 'RETOUR';
    this.emitPhase(state, mission, 'RETOUR', state.failed);

    const remainingProgress = 100 - currentProgress;
    const returnTicks = Math.max(1, Math.round(returnDurationMs / TICK_MS));
    let tick = 0;

    state.intervalId = setInterval(() => {
      tick++;
      state.progress = Math.min(
        100,
        currentProgress + Math.round((tick / returnTicks) * remainingProgress)
      );
      if (state.progress >= 100) {
        state.phase = 'TERMINEE';
        mission.status = state.failed ? 'failed' : 'success';
        this.emitPhase(state, mission, 'TERMINEE', state.failed);
        if (!state.failed) {
          this.game.setRecruitStatus(String(state.recruitId), 'available');
        }
        clearInterval(state.intervalId!);
      }
    }, TICK_MS);
  }

  getState(missionId: number): MissionState | undefined {
    return this.missionStates[missionId];
  }

  private resolveEvents(state: MissionState, mission: Mission): void {
    for (let i = state.currentEventIndex; i < state.events.length; i++) {
      if (state.failed) break;

      const recruit = this.game.getRecruit(String(state.recruitId));
      if (!recruit || recruit.status === 'dead') {
        state.failed = true;
        break;
      }

      const event = state.events[i];
      const roll = this.dice.rollAction(recruit.attributes[event.attribute]);
      const success = roll.total >= event.dc;

      const result: EventResult = {
        eventIndex: i,
        type: event.type,
        d20: roll.d20,
        bonus: roll.bonus,
        diceNotation: roll.diceNotation,
        total: roll.total,
        dc: event.dc,
        success,
      };

      if (success) {
        result.rewardEarned = event.reward;
      } else {
        const consequence = event.failureConsequence;
        result.consequence = consequence;

        if (consequence === 'HP_LOSS') {
          const hpLost = this.dice.rollDie(6);
          result.hpLost = hpLost;
          this.game.damageRecruit(String(state.recruitId), hpLost);

          const updated = this.game.getRecruit(String(state.recruitId));
          if (!updated || updated.status === 'dead') {
            result.recruitDied = true;
            state.failed = true;
            state.currentEventIndex = i + 1;
            state.eventResults.push(result);
            this.eventResults$.next({ missionId: mission.id, missionName: mission.name, recruitId: state.recruitId, eventResult: result });
            if (state.intervalId) clearInterval(state.intervalId);
            state.phase = 'TERMINEE';
            mission.status = 'failed';
            this.emitPhase(state, mission, 'TERMINEE', true);
            return;
          }
        } else if (consequence === 'FORCED_DEPARTURE') {
          state.failed = true;
          state.currentEventIndex = i + 1;
          state.eventResults.push(result);
          this.eventResults$.next({ missionId: mission.id, missionName: mission.name, recruitId: state.recruitId, eventResult: result });
          this.forceReturn(mission.id);
          return;
        } else {
          // NO_REWARD : aucune pénalité physique, mission continue sans récompense
          state.rewardForfeited = true;
        }
      }

      state.currentEventIndex = i + 1;
      state.eventResults.push(result);
      this.eventResults$.next({ missionId: mission.id, missionName: mission.name, recruitId: state.recruitId, eventResult: result });
    }
  }

  private emitPhase(
    state: MissionState,
    mission: Mission,
    phase: MissionPhase,
    failed = false
  ): void {
    this.logEvents$.next({
      missionId: state.missionId,
      missionName: mission.name,
      recruitId: state.recruitId,
      phase,
      failed,
      rewardForfeited: state.rewardForfeited,
    });
  }

  constructor() {}
}
