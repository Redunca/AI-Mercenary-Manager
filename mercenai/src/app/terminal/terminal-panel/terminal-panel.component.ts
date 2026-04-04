import { Component, inject, Input } from '@angular/core';
import { Panel } from '../../models/panel';
import { CommonModule } from '@angular/common';
import { CommandService } from '../../core/command.service';
import { RecruitDetailComponent } from "../../game/recruit-detail/recruit-detail.component";
import { RecruitListComponent } from "../../game/recruit-list/recruit-list.component";

@Component({
  selector: 'app-terminal-panel',
  standalone: true,
  imports: [CommonModule, RecruitDetailComponent, RecruitListComponent],
  templateUrl: './terminal-panel.component.html',
  styleUrl: './terminal-panel.component.scss'
})
export class TerminalPanelComponent {
  @Input() panel!: Panel;
  @Input() isActive = false;

   commandService = inject(CommandService);

  // commandes locales
  localCommands = {
    "close": () => this.commandService.layout.removePanel(this.panel.id),
    "split-h": () => console.log("split horizontal (plus tard)"),
    "split-v": () => console.log("split vertical (plus tard)")
  };

  constructor() {
    // enregistre les commandes locales dans le service
    this.commandService.registerPanelCommands(this.localCommands);
  }
}
