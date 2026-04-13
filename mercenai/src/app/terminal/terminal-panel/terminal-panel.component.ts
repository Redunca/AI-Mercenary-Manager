import { AfterViewChecked, AfterViewInit, Component, inject, Input, OnInit, ViewChild } from '@angular/core';
import { Panel } from '../../models/panel';
import { CommonModule } from '@angular/common';
import { CommandService } from '../../core/command.service';
import { RecruitDetailComponent } from '../../game/recruit-detail/recruit-detail.component';
import { RecruitListComponent } from '../../game/recruit-list/recruit-list.component';
import { TerminalController } from '../../core/terminal-controller';
import { LayoutService } from '../../core/layout.service';
import { LayoutNodeComponent } from '../layout-node/layout-node.component';

@Component({
  selector: 'app-terminal-panel',
  standalone: true,
  imports: [CommonModule, RecruitDetailComponent, RecruitListComponent, LayoutNodeComponent],
  templateUrl: './terminal-panel.component.html',
  styleUrl: './terminal-panel.component.scss',
})
export class TerminalPanelComponent implements OnInit, AfterViewChecked {
  @Input() panel!: Panel;
  @Input() isActive = false;

  commandService = inject(CommandService);
  layout = inject(LayoutService);

@ViewChild('moduleInstance') moduleInstance: any;


  // commandes locales
  localCommands = {
  "split-h": () => this.layout.split(this.getPanelId(), 'row'),
  "split-v": () => this.layout.split(this.getPanelId(), 'column'),
  "close": () => this.layout.closePanel(this.getPanelId())
};

  constructor() {
    // enregistre les commandes locales dans le service
    this.commandService.registerPanelCommands(this.localCommands);
  }

  getPanelId(){
    return this.panel.id
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
  if(this.panel.terminal){

    this.panel.terminal.localCommands = {
      ...this.localCommands,
      ...moduleCommands
    };
  }
}

manageKeyDownEnter(){
  this.layout.activePanelId = this.getPanelId();
  this.panel.terminal?.execute(
          this.commandService.routeCommand.bind(this.commandService)
        )

}

  // private getModuleCommands(): { [name: string]: (...args: string[]) => void } {
  //   console.log("Tryign to get module commands", this);
  //   switch (this.panel.module) {
  //     case 'recruit-list':
  //       return (this.moduleInstance as RecruitListComponent).registerCommands();

  //     case 'recruit-detail':
  //       return (
  //         this.moduleInstance as RecruitDetailComponent
  //       ).registerCommands();

  //     default:
  //       return {};
  //   }
  // }
}
