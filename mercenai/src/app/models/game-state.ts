import { Candidate } from './candidate';
import { LogEntry } from './log';
import { Mission, MissionState } from './mission';
import { OperaSummary } from './opera';
import { Recruit } from './recruit';
import { Ship } from './ship';

export interface PlayerSnapshot {
  maxNumberOfRecruits: number;
  maxAvailableMissions: number;
  credits: number;
  tokens: number;
  missionRefreshIntervalMs: number;
  shopRefreshIntervalMs: number;
}

export interface GameSnapshot {
  player: PlayerSnapshot;
  recruits: Recruit[];
  candidates: Candidate[];
  ships: Ship[];
  missions: Mission[];
  missionStates: Record<number, MissionState>;
  globalLogs: LogEntry[];
  missionLogs: Record<number, LogEntry[]>;
  operas: OperaSummary[];
  operaLogs: Record<string, LogEntry[]>;
}
