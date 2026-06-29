import { TerminalController } from "../core/terminal-controller";


export enum PanelModule{
  None='none',
  RecruitList='recruit-list',
  RecruitDetail='recruit-detail',
  MissionList = "mission-list",
  MissionDetail = "mission-detail",
  Logs = "logs",
  MissionLogs = "mission-logs",
  Dashboard = "dashboard",
  Help = "help",
  CandidateList = "candidate-list",
}

export interface Panel {
  id: number;
  module: PanelModule;
  data?: any;
  terminal?: TerminalController;
}
