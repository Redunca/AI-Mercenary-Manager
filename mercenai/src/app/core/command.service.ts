import { inject, Injectable } from '@angular/core';
import { LayoutService } from './layout.service';
import { PanelModule } from '../models/panel';
import { MissionService } from './mission.service';
import { CandidateService } from './candidate.service';
import { ShipService } from './ship.service';
import { ShopService } from './shop.service';
import { SelfService } from './self.service';
import { GameSyncService } from './game-sync.service';
import { GameService } from './game.service';
import { OperaService } from './opera.service';

@Injectable({ providedIn: 'root' })
export class CommandService {
  constructor(public layout: LayoutService) {
    this.registerGlobalCommands('recruit', this.handleRecruit.bind(this));
    this.registerGlobalCommands('focus', this.handleFocus.bind(this));
    this.registerGlobalCommands('mission', this.handleMission.bind(this));
    this.registerGlobalCommands('ship', this.handleShip.bind(this));
    this.registerGlobalCommands('logs', this.handleLogs.bind(this));
    this.registerGlobalCommands('home', this.handleHome.bind(this));
    this.registerGlobalCommands('help', this.handleHelp.bind(this));
    this.registerGlobalCommands('candidate', this.handleCandidate.bind(this));
    this.registerGlobalCommands('shop', this.handleShop.bind(this));
    this.registerGlobalCommands('wallet', this.handleWallet.bind(this));
    this.registerGlobalCommands('self', this.handleSelf.bind(this));
    this.registerGlobalCommands('opera', this.handleOpera.bind(this));
    this.registerGlobalCommands('items', this.handleItems.bind(this));
  }

  missionService = inject(MissionService);
  candidateService = inject(CandidateService);
  shipService = inject(ShipService);
  shopService = inject(ShopService);
  selfService = inject(SelfService);
  operaService = inject(OperaService);
  private gameSync = inject(GameSyncService);
  private game = inject(GameService);

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

    // Fire-and-forget: reports every command (local or global) so
    // execute_command Opera steps can be detected, including commands like
    // split-h/split-v/help that have no other backend correlate. Never
    // blocks command dispatch below.
    if (command) this.operaService.recordCommand(command, args);

    // 1. local commands
    const panel = this.layout.getPanelById(panelId);
    if (panel?.terminal?.localCommands[command]) {
      panel.terminal.localCommands[command](...args);
      panel.terminal?.setInput('');
      return;
    }

    // 2. global commands
    if (this.globalCommands[command]) {
      this.globalCommands[command](...args);
      panel?.terminal?.setInput('');
      return;
    }

    console.warn("Unknown command:", command);
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

    if (opt === "hire" && args[1]) {
      void this.candidateService.hireCandidate(args[1]).then(recruit => {
        if (recruit) {
          this.layout.setPanelModule(panelId, PanelModule.RecruitDetail, { id: recruit.id });
        }
      });
      return;
    }

    console.warn("Unknown option:", opt);
  }
  private handleFocus(arg: string) {
    // focus by ID
  const id = Number(arg);
  if (!isNaN(id)) {
    this.layout.setActivePanel(id);
    return;
  }

  // directional focus
  const dir = arg as 'left' | 'right' | 'up' | 'down';
  this.layout.focus(dir);
  }


  private handleMission(action: string, ...args: string[]) {
  switch (action) {
    case "list":
    case "-l":
    case "--list": {
      const completed = args[0] === "--completed" || args[0] === "-c";
      this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionList, completed ? { completed: true } : undefined);
      break;
    }

    // Bare shorthand for "mission list --completed", mirroring how -l/--list
    // is itself a shorthand for "list" — lets "mission -c" work on its own
    // without needing "list" spelled out.
    case "-c":
    case "--completed":
      this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionList, { completed: true });
      break;

    case "start":
      void this.missionService.startMission(Number(args[0]), Number(args[1])).then(err => {
        if (err) { console.error(`[mission start] ${err}`); return; }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionDetail, { id: Number(args[0]) });
      });
      break;

    case "stop":
      void this.missionService.stopMission(Number(args[0])).then(err => {
        if (err) { console.error(`[mission stop] ${err}`); return; }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionDetail, { id: Number(args[0]) });
      });
      break;

    case "detail":
    case "-d":
    case "--detail":
      this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionDetail, { id: Number(args[0]) });
      break;

    case "logs":
      this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionLogs, { id: Number(args[0]) });
      break;

    default:
      console.warn('Usage: mission list [--completed|-c] | mission start <shipId> <missionId> | mission stop <id> | mission detail <id> | mission logs <id>');
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

  private handleCandidate(action: string, ...args: string[]) {
    switch (action) {
      case 'list':
      case '-l':
      case '--list':
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.CandidateList);
        break;
      case 'detail':
      case '-d':
      case '--detail':
        if (args[0]) {
          this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.CandidateDetail, { id: args[0] });
        }
        break;
      default:
        console.warn('Usage: candidate list | candidate detail <id>');
    }
  }

  private handleShip(action: string, ...args: string[]) {
    switch (action) {
      case 'list':
      case '-l':
      case '--list':
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipList);
        break;

      case 'detail':
      case '-d':
      case '--detail':
        if (args[0]) {
          this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipDetail, { id: args[0] });
        }
        break;

      case 'assign':
        if (args[0] && args[1]) {
          void this.shipService.assignCrewToShip(Number(args[0]), [Number(args[1])])
            .then(() => this.gameSync.sync())
            .then(() => this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipDetail, { id: args[0] }))
            .catch(err => console.error('[ship assign]', err?.error?.error ?? err?.message ?? err));
        }
        break;

      case 'unassign':
        if (args[0] && args[1]) {
          void this.shipService.unassignCrewFromShip(Number(args[0]), Number(args[1]))
            .then(() => this.gameSync.sync())
            .then(() => this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipDetail, { id: args[0] }))
            .catch(err => console.error('[ship unassign]', err?.error?.error ?? err?.message ?? err));
        }
        break;

      case 'rename':
        if (args[0]) {
          void this.shipService.renameShip(Number(args[0]), args.slice(1).join(' '))
            .then(() => this.gameSync.sync())
            .then(() => this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipDetail, { id: args[0] }))
            .catch(err => console.error('[ship rename]', err?.error?.error ?? err?.message ?? err));
        }
        break;

      case 'load':
        if (args[0] && args[1]) {
          void this.shipService.loadConsumableOntoShip(Number(args[0]), Number(args[1]), args[2] ? Number(args[2]) : 1)
            .then(() => this.gameSync.sync())
            .then(() => this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipDetail, { id: args[0] }))
            .catch(err => console.error('[ship load]', err?.error?.error ?? err?.message ?? err));
        }
        break;

      default:
        console.warn('Usage: ship list | ship detail <id> | ship assign <shipId> <recruitId> | ship unassign <shipId> <recruitId> | ship rename <shipId> <newName> | ship load <shipId> <consumableId> [quantity]');
    }
  }

  private handleShop(action: string, ...args: string[]) {
    switch (action) {
      case 'list':
      case '-l':
      case '--list':
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShopList);
        break;

      case 'detail':
      case '-d':
      case '--detail':
        if (args[0]) {
          this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShopDetail, { id: args[0] });
        }
        break;

      case 'buy':
        if (args[0]) {
          void this.shopService.buyItem(Number(args[0])).then(result => {
            if (result?.error) {
              console.warn('Purchase failed:', result.error);
              return;
            }
            void this.gameSync.sync().then(() => {
              this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipList);
            });
          });
        }
        break;

      default:
        console.warn('Usage: shop list | shop detail <id> | shop buy <id>');
    }
  }

  private handleWallet() {
    console.log(`💰 Current credit: ${this.game.player$.value.credits} ₹`);
  }

  private handleSelf(action?: string, ...args: string[]) {
    if (!action) {
      this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.Self);
      return;
    }

    if (action === 'buy' && args[0]) {
      void this.selfService.buyUpgrade(Number(args[0])).then(result => {
        if (result?.error) {
          console.warn('Purchase failed:', result.error);
          return;
        }
        void this.gameSync.sync().then(() => {
          this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.Self);
        });
      });
      return;
    }

    console.warn('Usage: self | self buy <id>');
  }

  private handleOpera(action: string, ...args: string[]) {
    switch (action) {
      case 'list':
      case '-l':
      case '--list':
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.OperaList);
        break;

      case 'detail':
      case '-d':
      case '--detail':
        if (args[0]) {
          this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.OperaDetail, { id: args[0] });
        }
        break;

      case 'start':
        if (args[0]) {
          void this.operaService.startOpera(args[0]).then(err => {
            if (err) { console.error(`[opera start] ${err}`); return; }
            this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.OperaDetail, { id: args[0] });
          });
        }
        break;

      default:
        console.warn('Usage: opera list | opera detail <id> | opera start <id>');
    }
  }

  private handleItems() {
    this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.Items);
  }

}
