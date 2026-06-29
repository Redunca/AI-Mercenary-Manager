import { Candidate } from './candidate';
import { LogEntry } from './log';
import { Mission, MissionState } from './mission';
import { Recruit } from './recruit';

export interface GameSnapshot {
  recruits: Recruit[];
  candidates: Candidate[];
  missions: Mission[];
  missionStates: Record<number, MissionState>;
  globalLogs: LogEntry[];
  missionLogs: Record<number, LogEntry[]>;
}
