import { AttributeKey } from './recruit';

export type MissionPhase = 'EN_ROUTE' | 'EVENEMENT' | 'RETOUR' | 'TERMINEE';

export type EventType =
  | 'COMBAT'
  | 'INFILTRATION'
  | 'BREACH'
  | 'SURVIVAL'
  | 'NEGOTIATION'
  | 'INTIMIDATION'
  | 'DECEPTION'
  | 'RECON'
  | 'ENGINEERING'
  | 'PSYCHWAR';

export type MissionDifficulty = 'ROUTINE' | 'STANDARD' | 'HARD' | 'PERILOUS' | 'EPIC';

export type MissionStatus = 'available' | 'in_progress' | 'failed' | 'success';

export type FailureConsequence = 'HP_LOSS' | 'FORCED_DEPARTURE' | 'NO_REWARD';

export type RewardType = 'CREDITS' | 'EXPERIENCE' | 'INTEL';

export interface MissionReward {
  type: RewardType;
  amount: number;
  description: string;
}

export interface MissionEvent {
  type: EventType;
  attribute: AttributeKey;
  dc: number;
  reward: MissionReward;
  failureConsequence: FailureConsequence;
}

export interface EventResult {
  eventIndex: number;
  type: EventType;
  d20: number;
  bonus: number;
  diceNotation: string;
  total: number;
  dc: number;
  success: boolean;
  rewardEarned?: MissionReward;
  consequence?: FailureConsequence;
  hpLost?: number;
  recruitDied?: boolean;
}

export interface Mission {
  id: number;
  name: string;
  description: string;
  difficulty: MissionDifficulty;
  events: MissionEvent[];
  assignedRecruitId: number | null;
  status: MissionStatus;
}

export interface MissionLogEvent {
  missionId: number;
  missionName: string;
  recruitId: number;
  phase: MissionPhase;
  failed?: boolean;
  rewardForfeited?: boolean;
}

export interface MissionEventResult {
  missionId: number;
  missionName: string;
  recruitId: number;
  eventResult: EventResult;
}

export interface MissionState {
  missionId: number;
  recruitId: number;
  phase: MissionPhase;
  progress: number;
  events: MissionEvent[];
  currentEventIndex: number;
  eventResults: EventResult[];
  failed: boolean;
  rewardForfeited: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
}
