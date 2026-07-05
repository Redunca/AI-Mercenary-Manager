import { inject, Injectable } from '@angular/core';
import { LayoutService } from './layout.service';
import { PanelModule } from '../models/panel';
import { MissionService } from './mission.service';
import { CandidateService } from './candidate.service';
import { ShipService } from './ship.service';
import { ShopService } from './shop.service';

@Injectable({ providedIn: 'root' })
export class CommandService {
  constructor(public layout: LayoutService) {
    this.registerGlobalCommands('recruit', this.handleRecruit.bind(this));
    this.registerGlobalCommands('focus', this.handleFocus.bind(this));
    this.registerGlobalCommands('mission', this.handleMission.bind(this));
    this.registerGlobalCommands('ship', this.handleShip.bind(this));
    this.registerGlobalCommands('equipment', this.handleEquipment.bind(this));
    this.registerGlobalCommands('logs', this.handleLogs.bind(this));
    this.registerGlobalCommands('home', this.handleHome.bind(this));
    this.registerGlobalCommands('help', this.handleHelp.bind(this));
    this.registerGlobalCommands('candidate', this.handleCandidate.bind(this));
    this.registerGlobalCommands('shop', this.handleShop.bind(this));
    this.registerGlobalCommands('wallet', this.handleWallet.bind(this));
  }

  missionService = inject(MissionService);
  candidateService = inject(CandidateService);
  shipService = inject(ShipService);
  shopService = inject(ShopService);

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

    if (opt === "hire" && args[1]) {
      void this.candidateService.hireCandidate(args[1]).then(recruit => {
        if (recruit) {
          this.layout.setPanelModule(panelId, PanelModule.RecruitDetail, { id: recruit.id });
        }
      });
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
      void this.missionService.startMission(Number(args[0]), Number(args[1])).then(() => {
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionDetail, { id: Number(args[0]) });
      });
      break;

    case "stop":
      void this.missionService.stopMission(Number(args[0])).then(() => {
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.MissionDetail, { id: Number(args[0]) });
      });
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

  private handleCandidate(action: string, ...args: string[]) {
    switch (action) {
      case 'list':
      case '-l':
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.CandidateList);
        break;
      case 'detail':
      case '-d':
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
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipList);
        break;

      case 'detail':
      case '-d':
        if (args[0]) {
          this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipDetail, { id: args[0] });
        }
        break;

      case 'assign':
        if (args[0] && args[1]) {
          void this.shipService.assignCrewToShip(Number(args[0]), [Number(args[1])]).then(() => {
            this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipDetail, { id: args[0] });
          });
        }
        break;

      case 'unassign':
        if (args[0] && args[1]) {
          void this.shipService.unassignCrewFromShip(Number(args[0]), Number(args[1])).then(() => {
            this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipDetail, { id: args[0] });
          });
        }
        break;

      case 'rename':
        if (args[0]) {
          void this.shipService.renameShip(Number(args[0]), args.slice(1).join(' ')).then(() => {
            this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipDetail, { id: args[0] });
          });
        }
        break;

      default:
        console.warn('Usage: ship list | ship detail <id> | ship assign <shipId> <recruitId> | ship unassign <shipId> <recruitId> | ship rename <shipId> <newName>');
    }
  }

  private handleEquipment(action: string, ...args: string[]) {
    switch (action) {
      case 'list':
      case '-l':
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.EquipmentList);
        break;

      case 'detail':
      case '-d':
        if (args[0]) {
          this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.EquipmentDetail, { id: args[0] });
        }
        break;

      case 'assign':
        if (args[0] && args[1]) {
          void this.shipService.assignEquipmentToShip(Number(args[0]), Number(args[1])).then(() => {
            this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.EquipmentDetail, { id: args[0] });
          });
        }
        break;

      case 'unassign':
        if (args[0]) {
          void this.shipService.unassignEquipmentFromShip(Number(args[0])).then(() => {
            this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.EquipmentDetail, { id: args[0] });
          });
        }
        break;

      default:
        console.warn('Usage: equipment list | equipment detail <id> | equipment assign <equipmentId> <shipId> | equipment unassign <equipmentId>');
    }
  }

  private handleShop(action: string, ...args: string[]) {
    switch (action) {
      case 'list':
      case '-l':
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShopList);
        break;

      case 'detail':
      case '-d':
        if (args[0]) {
          this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShopDetail, { id: args[0] });
        }
        break;

      default:
        console.warn('Usage: shop list | shop detail <id>');
    }
  }

  private handleWallet() {
    this.shopService.getWallet().subscribe(wallet => {
      console.log(`💰 Crédit actuel: ${wallet} ₹`);
    });
  }

}
