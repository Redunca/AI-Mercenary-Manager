import { AfterViewChecked, AfterViewInit, Component, inject, Input, ViewChild } from '@angular/core';
import { Panel } from '../../models/panel';
import { CommonModule } from '@angular/common';
import { CommandService } from '../../core/command.service';
import { RecruitDetailComponent } from '../../game/recruit-detail/recruit-detail.component';
import { RecruitListComponent } from '../../game/recruit-list/recruit-list.component';
import { TerminalController } from '../../core/terminal-controller';

@Component({
  selector: 'app-terminal-panel',
  standalone: true,
  imports: [CommonModule, RecruitDetailComponent, RecruitListComponent],
  templateUrl: './terminal-panel.component.html',
  styleUrl: './terminal-panel.component.scss',
})
export class TerminalPanelComponent implements AfterViewInit, AfterViewChecked {
  @Input() panel!: Panel;
  @Input() isActive = false;

  commandService = inject(CommandService);

@ViewChild('moduleInstance') moduleInstance: any;


  // commandes locales
  localCommands = {
    close: () => this.commandService.layout.removePanel(this.panel.id),
    'split-h': () => console.log('split horizontal (plus tard)'),
    'split-v': () => console.log('split vertical (plus tard)'),
  };

  constructor() {
    // enregistre les commandes locales dans le service
    this.commandService.registerPanelCommands(this.localCommands);
  }
  ngAfterViewInit(): void {
    this.panel.terminal = new TerminalController(this.panel.id, {
      close: () => this.commandService.layout.removePanel(this.panel.id),
      'split-h': () => console.log('split horizontal'),
      'split-v': () => console.log('split vertical'),
    });
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



  private getModuleCommands(): { [name: string]: (...args: string[]) => void } {
    console.log("Tryign to get module commands", this);
    switch (this.panel.module) {
      case 'recruit-list':
        return (this.moduleInstance as RecruitListComponent).registerCommands();

      case 'recruit-detail':
        return (
          this.moduleInstance as RecruitDetailComponent
        ).registerCommands();

      default:
        return {};
    }
  }
}
