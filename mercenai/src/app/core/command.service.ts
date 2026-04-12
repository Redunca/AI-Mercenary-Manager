import { Injectable } from '@angular/core';
import { LayoutService } from './layout.service';

@Injectable({ providedIn: 'root' })
export class CommandService {
  constructor(public layout: LayoutService) {
    this.registerGlobalCommands('recruit', this.handleRecruit.bind(this));
  }

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
  console.log("Called routeCommand with parameters",input,panelId);
  const panel = this.layout.getPanelById(panelId);
  console.log("Panel had theses commands",panel?.terminal?.localCommands);
  if (panel?.terminal?.localCommands[command]) {
    panel.terminal.localCommands[command](...args);
    return;
  }

  // 2. commandes globales
  if (this.globalCommands[command]) {
    this.globalCommands[command](...args);
    return;
  }

  console.warn("Commande inconnue :", command);
}


  private handleRecruit(...args: string[]) {
    // aucun argument → aide
    if (args.length === 0) {
      console.log('Usage: recruit -l | --list | -d <id> | --detail <id>');
      return;
    }

    const option = args[0];

    // LISTE
    if (option === '-l' || option === '--list') {
      this.layout.addPanel('recruit-list');
      return;
    }

    // DETAIL
    if ((option === '-d' || option === '--detail') && args[1]) {
      const id = args[1];
      this.layout.addPanel('recruit-detail', { id });
      return;
    }

    console.warn('Option inconnue :', option);
  }
}
