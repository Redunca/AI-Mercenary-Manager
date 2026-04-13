import { TerminalController } from "../core/terminal-controller";


export enum PanelModule{
  None='none',
  RecruitList='recruit-list',
  RecruitDetail='recruit-detail'
}

export interface Panel {
  id: number;
  module: PanelModule;
  data?: any;
  terminal?: TerminalController;
}
