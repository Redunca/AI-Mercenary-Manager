import { inject, Injectable } from '@angular/core';
import { LayoutService } from './layout.service';
import { PanelModule } from '../models/panel';
import { MissionService } from './mission.service';

@Injectable({ providedIn: 'root' })
export class CommandService {
  constructor(public layout: LayoutService) {
    this.registerGlobalCommands('recruit', this.handleRecruit.bind(this));
    this.registerGlobalCommands('focus', this.handleFocus.bind(this));
    this.registerGlobalCommands('mission', this.handleMission.bind(this));
    this.registerGlobalCommands('logs', this.handleLogs.bind(this));
    this.registerGlobalCommands('home', this.handleHome.bind(this));
    this.registerGlobalCommands('help', this.handleHelp.bind(this));
  }

  missionService = inject(MissionService);

  private input = '';
  private history: string[] = [];
  private index = -1;

  private panelCommands: { [name: string]: (...args: string[]) => void } = {};
  private globalCommands: { [name: string]: (...args: string[]) => void } = {};

  setInput(value: string) {
    this.input = value;
  }

  getInput() {
    return this.input;
  }

  registerPanelCommands(cmds: { [name: string]: (...args: string[]) => void }) {
    this.panelCommands = cmds;
  }

  registerGlobalCommands(name: string, fn: (...args: string[]) => void) {
    this.globalCommands[name] = fn;
  }

  private parse(input: string) {
    const parts = input.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    return { command, args };
  }

  execute() {
    const { command, args } = this.parse(this.input);

    this.history.push(this.input);
    this.index = -1;

    if (this.panelCommands[command]) {
      this.panelCommands[command](...args);
    } else if (this.globalCommands[command]) {
      this.globalCommands[command](...args);
    } else {
      console.warn('Commande inconnue :', name);
    }

    this.input = '';
  }

  historyPrevious() {
    if (this.history.length === 0) return;

    if (this.index === -1) {
      this.index = this.history.length - 1;
    } else if (this.index > 0) {
      this.index--;
    }

    this.input = this.history[this.index];
  }

  historyNext() {
    if (this.index === -1) return;

    this.index++;
    if (this.index >= this.history.length) {
      this.index = -1;
      this.input = '';
    } else {
      this.input = this.history[this.index];
    }
  }


  routeCommand(input: string, panelId: number) {
    const { command, args } = this.parse(input);

    // 1. commandes locales
    console.log("Called routeCommand with parameters", input, panelId);
    const panel = this.layout.getPanelById(panelId);
    console.log("Panel had theses commands", panel?.terminal?.localCommands);
    if (panel?.terminal?.localCommands[command]) {
      panel.terminal.localCommands[command](...args);
      panel.terminal?.setInput('');
      return;
    }
    console.log("Looking into global commands", this.globalCommands)
    // 2. commandes globales
    if (this.globalCommands[command]) {
      this.globalCommands[command](...args);
      panel.terminal?.setInput('');
      return;
    }

    console.warn("Commande inconnue :", command);
  }


  private handleRecruit(...args: string[]) {

    const panelId = this.layout.activePanelId;
    if (!panelId) return;

    if (args.length === 0) {
      console.log("Usage: recruit -l | --list | -d <id>");
      return;
    }

    const opt = args[0];

    if (opt === "list" || opt === "-l" || opt === "--list") {
      this.layout.setPanelModule(panelId, PanelModule.RecruitList);
      return;
    }

    if ((opt === "detail" || opt === "-d" || opt === "--detail") && args[1]) {
      this.layout.setPanelModule(panelId, PanelModule.RecruitDetail, { id: args[1] });
      return;
    }

    console.warn("Option inconnue :", opt);
  }
  private handleFocus(arg: string) {
    // focus par ID
  const id = Number(arg);
  if (!isNaN(id)) {
    this.layout.setActivePanel(id);
    return;
  }

  // focus directionnel
  const dir = arg as 'left' | 'right' | 'up' | 'down';
  this.layout.focus(dir);
  }


  private handleMission(action: string, ...args: string[]) {
  switch (action) {
    case "list":
      this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionList);
      break;

    case "start":
      this.missionService.startMission(Number(args[0]), Number(args[1]));
      this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionDetail, { id: Number(args[0]) });
      break;

    case "stop":
      this.missionService.stopMission(Number(args[0]));
      this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionDetail, { id: Number(args[0]) });
      break;

    case "detail":
      this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionDetail, { id: Number(args[0]) });
      break;

    case "logs":
      this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionLogs, { id: Number(args[0]) });
      break;
  }
}

  private handleLogs() {
    this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.Logs);
  }

  private handleHome() {
    this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.Dashboard);
  }

  private handleHelp() {
    this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.Help);
  }

}
