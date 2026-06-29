import { AfterViewChecked, AfterViewInit, Component, ElementRef, inject, Input, OnInit, ViewChild } from '@angular/core';
import { Panel } from '../../models/panel';
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
import { TerminalController } from '../../core/terminal-controller';
import { LayoutService } from '../../core/layout.service';
import { LayoutNodeComponent } from '../layout-node/layout-node.component';

@Component({
  selector: 'app-terminal-panel',
  standalone: true,
  imports: [CommonModule, RecruitDetailComponent, RecruitListComponent, MissionListComponent, MissionDetailComponent, GlobalLogsComponent, MissionLogsComponent, DashboardComponent, HelpComponent, CandidateListComponent, CandidateDetailComponent, LayoutNodeComponent],
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

  // commandes locales
  localCommands = {
    "split-h": () => this.layout.split(this.getPanelId(), 'row'),
    "split-v": () => this.layout.split(this.getPanelId(), 'column'),
    "close": () => this.layout.closePanel(this.getPanelId())
  };


  ngAfterViewInit(): void {
    this.layout.activePanelChanged.subscribe(id => {
      console.log('Received focus changed ', id, this.panel);
      if (id === this.panel.id) {
        this.focusTextarea();
      }
    });
    //On fait le check en cas de nouveau panneau (comme après un split) parce que sinon l'événement part avant que la vue existe
    if (this.layout.activePanelId === this.panel.id) {
      this.focusTextarea();
    }
  }
  focusTextarea() {
    this.textareaRef?.nativeElement.focus();
  }
  getPanelId() {
    return this.panel.id
  }
  onFocus() {
    this.layout.setActivePanel(this.panel.id);
  }
  get prompt() {
    return `user@${this.panel?.module ?? 'localhost'}(${this.getPanelId() ?? '?'})`;
  }

  ngOnInit(): void {
    console.log("On essaye de créer le terminal", this.panel);
    this.panel.terminal = new TerminalController(this.panel.id, this.localCommands);
    console.log(this.panel);
  }

  ngAfterViewChecked() {
    if (this.moduleInstance && this.moduleInstance !== this._lastModuleInstance) {
      this._lastModuleInstance = this.moduleInstance;
      this.setModuleInstance(this.moduleInstance);
    }
  }

  private _lastModuleInstance: any = null;


  setModuleInstance(instance: any) {
    const moduleCommands = instance.registerCommands?.() ?? {};
    if (this.panel.terminal) {

      this.panel.terminal.localCommands = {
        ...this.localCommands,
        ...moduleCommands
      };
    }
  }

  manageKeyDownEnter() {
    this.layout.activePanelId = this.getPanelId();
    this.panel.terminal?.execute(
      this.commandService.routeCommand.bind(this.commandService)
    )

  }
  autoResize(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  resetInputHeight() {
    const textarea = this.textareaRef?.nativeElement;
    console.log("Trying to reset text area height", textarea);

    if (!textarea) return;
    console.log("resetting text area height");
    textarea.style.height = '';
  }
}
