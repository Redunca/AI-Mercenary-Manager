import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  forwardRef,
  inject,
  Input,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Panel, PanelModule } from '../../models/panel';
import { CommonModule } from '@angular/common';
import { CommandService } from '../../core/command.service';
import { RecruitDetailComponent } from '../../game/recruit-detail/recruit-detail.component';
import { RecruitListComponent } from '../../game/recruit-list/recruit-list.component';
import { MissionListComponent } from '../../game/mission-list/mission-list.component';
import { MissionDetailComponent } from '../../game/mission-detail/mission-detail.component';
import { GlobalLogsComponent } from '../../game/global-logs/global-logs.component';
import { MissionLogsComponent } from '../../game/mission-logs/mission-logs.component';
import { DashboardComponent } from '../../game/dashboard/dashboard.component';
import { HelpComponent } from '../../game/help/help.component';
import { CandidateListComponent } from '../../game/candidate-list/candidate-list.component';
import { CandidateDetailComponent } from '../../game/candidate-detail/candidate-detail.component';
import { ShipListComponent } from '../../game/ship/ship-list/ship-list.component';
import { ShipDetailComponent } from '../../game/ship/ship-detail/ship-detail.component';
import { TerminalController } from '../../core/terminal-controller';
import { LayoutService } from '../../core/layout.service';
import { LayoutNodeComponent } from '../layout-node/layout-node.component';
import { ShopListComponent } from '../../game/shop/shop-list/shop-list.component';
import { ShopDetailComponent } from '../../game/shop/shop-detail/shop-detail.component';
import { SelfComponent } from '../../game/self/self.component';
import { OperaListComponent } from '../../game/opera-list/opera-list.component';
import { OperaDetailComponent } from '../../game/opera-detail/opera-detail.component';
import { ItemsComponent } from '../../game/items/items.component';
import { HospitalComponent } from '../../game/hospital/hospital.component';
import { CemeteryComponent } from '../../game/cemetery/cemetery.component';
import { FactionsComponent } from '../../game/factions/factions.component';

@Component({
  selector: 'app-terminal-panel',
  standalone: true,
  imports: [
    CommonModule,
    RecruitDetailComponent,
    RecruitListComponent,
    MissionListComponent,
    MissionDetailComponent,
    GlobalLogsComponent,
    MissionLogsComponent,
    DashboardComponent,
    HelpComponent,
    CandidateListComponent,
    CandidateDetailComponent,
    ShipListComponent,
    ShipDetailComponent,
    forwardRef(() => LayoutNodeComponent),
    ShopListComponent,
    ShopDetailComponent,
    SelfComponent,
    OperaListComponent,
    OperaDetailComponent,
    ItemsComponent,
    HospitalComponent,
    CemeteryComponent,
    FactionsComponent,
  ],
  templateUrl: './terminal-panel.component.html',
  styleUrl: './terminal-panel.component.scss',
})
export class TerminalPanelComponent implements OnInit, AfterViewChecked, AfterViewInit {
  @Input() panel!: Panel;
  @Input() isActive = false;

  commandService = inject(CommandService);
  layout = inject(LayoutService);

  @ViewChild('moduleInstance') moduleInstance: any;
  @ViewChild('cmdInput') textareaRef!: ElementRef<HTMLTextAreaElement>;

  prompt = '> ';

  // commandes locales
  localCommands: { [name: string]: (...args: string[]) => void } = {
    'split-h': () => this.layout.split(this.getPanelId(), 'row'),
    'split-v': () => this.layout.split(this.getPanelId(), 'column'),
    close: () => this.layout.closePanel(this.getPanelId()),
  };

  private lastModuleInstance: any = null;

  ngOnInit() {
    this.panel.terminal = new TerminalController(this.getPanelId(), this.localCommands);
  }

  ngAfterViewInit() {
    this.textareaRef?.nativeElement?.focus();
  }

  ngAfterViewChecked() {
    this.textareaRef?.nativeElement?.scrollIntoView({ block: 'nearest' });
    if (this.moduleInstance !== this.lastModuleInstance) {
      this.lastModuleInstance = this.moduleInstance;
      for (const key of Object.keys(this.localCommands)) {
        if (key !== 'split-h' && key !== 'split-v' && key !== 'close') {
          delete this.localCommands[key];
        }
      }
      if (this.moduleInstance?.registerCommands) {
        Object.assign(this.localCommands, this.moduleInstance.registerCommands());
      }
    }
  }

  onInputChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.panel.terminal?.setInput(target.value);
  }

  autoResize(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  onEnterKey(event: Event): void {
    // Without this, the browser's default behavior for Enter in a <textarea>
    // inserts a newline *after* the command has run. That newline then fires
    // a native `input` event, which re-syncs the (stale) DOM value back into
    // the TerminalController and undoes the input clearing done by execute(),
    // leaving a trailing blank line in the box and corrupting the next command's
    // parsing (parse() splits on \s+, which also matches \n).
    event.preventDefault();
    this.manageKeyDownEnter();
  }

  manageKeyDownEnter(): void {
    this.panel.terminal?.execute((input: string, panelId: number) => {
      this.commandService.routeCommand(input, panelId);
    });
  }

  onArrowUpKey(event: Event): void {
    // Prevent the browser from moving the caret to the start of the
    // textarea; we're using ArrowUp to cycle through command history instead.
    event.preventDefault();
    this.panel.terminal?.historyPrevious();
  }

  onArrowDownKey(event: Event): void {
    // Same as above but for cycling forward through history / back to a
    // blank line.
    event.preventDefault();
    this.panel.terminal?.historyNext();
  }

  onTabKey(event: Event): void {
    // Without this, Tab would move browser focus off the textarea instead
    // of completing the command.
    event.preventDefault();
    const input = this.panel.terminal?.getInput() ?? '';
    const suggestion = this.getSuggestion(input);
    if (!suggestion) return;
    this.panel.terminal?.setInput(suggestion + ' ');
  }

  // Only completes the command name itself (the first, space-free token),
  // matched against the commands actually available in this panel right
  // now (local + global) -- not sub-command arguments, which live in
  // per-handler switch statements rather than any enumerable registry.
  private getSuggestion(input: string): string | null {
    if (!input || /\s/.test(input)) return null;

    const lower = input.toLowerCase();
    const names = [...Object.keys(this.localCommands), ...this.commandService.getGlobalCommandNames()];
    const matches = names
      .filter((name) => name.toLowerCase() !== lower && name.toLowerCase().startsWith(lower))
      .sort();
    return matches[0] ?? null;
  }

  getGhostSuffix(): string {
    const input = this.panel.terminal?.getInput() ?? '';
    const suggestion = this.getSuggestion(input);
    return suggestion ? suggestion.slice(input.length) : '';
  }

  onFocus(): void {
    this.layout.setActivePanel(this.getPanelId());
  }

  getPanelId(): number {
    return this.panel.id;
  }

  getComponentForModule(module: PanelModule) {
    switch (module) {
      case PanelModule.RecruitList:
        return RecruitListComponent;
      case PanelModule.RecruitDetail:
        return RecruitDetailComponent;
      case PanelModule.MissionList:
        return MissionListComponent;
      case PanelModule.MissionDetail:
        return MissionDetailComponent;
      case PanelModule.Logs:
        return GlobalLogsComponent;
      case PanelModule.MissionLogs:
        return MissionLogsComponent;
      case PanelModule.Dashboard:
        return DashboardComponent;
      case PanelModule.Help:
        return HelpComponent;
      case PanelModule.CandidateList:
        return CandidateListComponent;
      case PanelModule.CandidateDetail:
        return CandidateDetailComponent;
      case PanelModule.ShipList:
        return ShipListComponent;
      case PanelModule.ShipDetail:
        return ShipDetailComponent;
      case PanelModule.ShopList:
        return ShopListComponent;
      case PanelModule.ShopDetail:
        return ShopDetailComponent;
      case PanelModule.Self:
        return SelfComponent;
      case PanelModule.OperaList:
        return OperaListComponent;
      case PanelModule.OperaDetail:
        return OperaDetailComponent;
      case PanelModule.Items:
        return ItemsComponent;
      case PanelModule.Hospital:
        return HospitalComponent;
      case PanelModule.Cemetery:
        return CemeteryComponent;
      case PanelModule.Factions:
        return FactionsComponent;
      default:
        return DashboardComponent;
    }
  }
}
