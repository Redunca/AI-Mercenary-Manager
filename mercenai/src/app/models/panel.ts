import { TerminalController } from "../core/terminal-controller";

export interface Panel {
  id: number;
  module: string;
  data?: any;
  terminal?: TerminalController;
}
