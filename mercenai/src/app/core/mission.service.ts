import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Mission, MissionLogEvent, MissionPhase, MissionState } from '../models/mission';

const DURATION_MS = 60_000;
const TICK_MS = 500;

@Injectable({ providedIn: 'root' })
export class MissionService {
  missions: Record<number, Mission> = {
    1: { id: 1, name: 'Patrouille', description: 'Surveiller la zone', assignedRecruitId: null, available: true },
    2: { id: 2, name: 'Forage', description: 'Collecter des ressources', assignedRecruitId: null, available: true },
    3: { id: 3, name: 'Exploration', description: 'Explorer les environs', assignedRecruitId: null, available: true }
  };

  missionStates: Record<number, MissionState> = {};
  logEvents$ = new Subject<MissionLogEvent>();

  startMission(missionId: number, recruitId: number) {
    const mission = this.missions[missionId];
    if (!mission || !mission.available) return;

    const recruitBusy = Object.values(this.missionStates)
      .some(s => s.recruitId === recruitId && s.phase !== 'TERMINEE');
    if (recruitBusy) {
      console.warn(`Recrue ${recruitId} déjà en mission`);
      return;
    }

    mission.available = false;
    mission.assignedRecruitId = recruitId;

    const state: MissionState = { missionId, recruitId, phase: 'EN_ROUTE', progress: 0, intervalId: null };
    this.missionStates[missionId] = state;

    this.emitPhase(state, mission, 'EN_ROUTE');

    const totalTicks = DURATION_MS / TICK_MS;
    let tick = 0;
    let lastPhase: MissionPhase = 'EN_ROUTE';

    state.intervalId = setInterval(() => {
      tick++;
      state.progress = Math.min(100, Math.round((tick / totalTicks) * 100));

      const newPhase: MissionPhase = state.progress <= 33 ? 'EN_ROUTE'
        : state.progress <= 66 ? 'EVENEMENT'
        : state.progress < 100 ? 'RETOUR'
        : 'TERMINEE';

      if (newPhase !== lastPhase) {
        lastPhase = newPhase;
        state.phase = newPhase;
        this.emitPhase(state, mission, newPhase);
      }

      if (state.phase === 'TERMINEE') clearInterval(state.intervalId!);
    }, TICK_MS);
  }

  stopMission(missionId: number) {
    const state = this.missionStates[missionId];
    if (state?.intervalId) clearInterval(state.intervalId);
    delete this.missionStates[missionId];

    const mission = this.missions[missionId];
    if (mission) {
      mission.available = true;
      mission.assignedRecruitId = null;
    }
  }

  // EN_ROUTE → retour en autant de temps que le chemin parcouru
  // EVENEMENT → retour en 1/3 de la durée totale
  forceReturn(missionId: number) {
    const state = this.missionStates[missionId];
    if (!state || state.phase === 'TERMINEE' || state.phase === 'RETOUR') return;

    if (state.intervalId) clearInterval(state.intervalId);

    const mission = this.missions[missionId];
    const currentProgress = state.progress;
    const returnDurationMs = state.phase === 'EN_ROUTE'
      ? (currentProgress / 100) * DURATION_MS
      : DURATION_MS / 3;

    state.phase = 'RETOUR';
    this.emitPhase(state, mission, 'RETOUR');

    const remainingProgress = 100 - currentProgress;
    const returnTicks = Math.max(1, Math.round(returnDurationMs / TICK_MS));
    let tick = 0;

    state.intervalId = setInterval(() => {
      tick++;
      state.progress = Math.min(100, currentProgress + Math.round((tick / returnTicks) * remainingProgress));
      if (state.progress >= 100) {
        state.phase = 'TERMINEE';
        this.emitPhase(state, mission, 'TERMINEE');
        clearInterval(state.intervalId!);
      }
    }, TICK_MS);
  }

  getState(missionId: number): MissionState | undefined {
    return this.missionStates[missionId];
  }

  private emitPhase(state: MissionState, mission: Mission, phase: MissionPhase) {
    this.logEvents$.next({
      missionId: state.missionId,
      missionName: mission.name,
      recruitId: state.recruitId,
      phase
    });
  }

  constructor() {}
}
