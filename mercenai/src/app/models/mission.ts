export interface Mission {
  id: number;
  name: string;
  description: string;
  assignedRecruitId: number | null;
  available: boolean; // true = personne dessus
}

export type MissionPhase = 'EN_ROUTE' | 'EVENEMENT' | 'RETOUR' | 'TERMINEE';

export interface MissionLogEvent {
  missionId: number;
  missionName: string;
  recruitId: number;
  phase: MissionPhase;
}

export interface MissionState {
  missionId: number;
  recruitId: number;
  phase: MissionPhase;
  progress: number; // 0–100
  intervalId: ReturnType<typeof setInterval> | null;
}
