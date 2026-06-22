export interface LogEntry {
  tag: string;      // '[SYS]', '[IA]', '[BOB]', etc.
  message: string;
  missionId?: number; // absent = entrée globale uniquement
}
