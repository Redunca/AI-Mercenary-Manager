import { AttributeKey } from './recruit';

export type MissionPhase = 'EN_ROUTE' | 'EVENT' | 'RETURN' | 'COMPLETED';

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
  d20?: number;
  bonus?: number;
  diceNotation?: string;
  total?: number;
  dc?: number;
  success: boolean;
  rewardEarned?: MissionReward;
  consequence?: FailureConsequence;
  hpLost?: number;
  recruitDied?: boolean;
  // COMBAT events resolve as a full auto-battle instead of a single skill
  // check; these fields are only present when `combat` is true.
  combat?: boolean;
  rounds?: number;
  enemyDefeated?: boolean;
  recruitsDied?: number[];
}

export interface Mission {
  id: number;
  name: string;
  description: string;
  difficulty: MissionDifficulty;
  events: MissionEvent[];
  hasCombat: boolean;
  skillChecks: AttributeKey[];
  estimatedDurationMs: number;
  assignedShipId: number | null;
  status: MissionStatus;
  // The org (if any) this mission is done for/against — see
  // server/src/engine/missionGenerator.js's resolveAgainstFaction.
  // forFaction's current standing scales the credit reward (see
  // domain/faction.js's REWARD_MULTIPLIER).
  forFaction?: string;
  againstFaction?: string;
}

export interface MissionState {
  missionId: number;
  shipId: number;
  phase: MissionPhase;
  progress: number;
  events: MissionEvent[];
  currentEventIndex: number;
  eventResults: EventResult[];
  failed: boolean;
  rewardForfeited: boolean;
  assignedRecruitId: string | null;
}
