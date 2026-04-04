import { CommonModule } from '@angular/common';
import { AfterContentInit, Component, inject, Input, numberAttribute, OnInit } from '@angular/core';
import { SanitizePipe } from '../../shared/sanitize.pipe';
import { ModulesType } from '../../models/modules-type.enum';
import { RecruitListComponent } from "../recruit/recruit-list/recruit-list.component";
import { RecruitDetailComponent } from "../recruit/recruit-detail/recruit-detail.component";
import { TerminalService } from '../../core/terminal.service';
import { GameService } from '../../core/game.service';
import { LayoutService } from '../../core/layout.service';

@Component({
  selector: 'app-module-display-base',
  standalone: true,
  imports: [CommonModule, SanitizePipe, RecruitListComponent, RecruitDetailComponent],
  templateUrl: './module-display-base.component.html',
  styleUrl: './module-display-base.component.sass'
})

export class ModuleDisplayBaseComponent {
  
 
  @Input() isSelected = false;
  @Input() hasRightNeighbor = false;
  @Input() hasLeftNeighbor = false;
  @Input() hasTopNeighbor = false;
  @Input() hasBottomNeighbor = false;
  @Input() public module : ModulesType = ModulesType.None; 
  
  public terminalService = inject(TerminalService);
  public gameService = inject(GameService);
  public layoutService = inject(LayoutService);

  
  public moduleTitle = '';
  public commands: {[commandName: string]: (...args: []) => void} = {};
  
  
  ModulesType = ModulesType;
  /**
   * ModuleDisplayBase.component
   */
  constructor() {
    this.commands["close"] = (): void => {};
    this.commands["split-h"] = (): void => {};
    this.commands["split-v"] = (): void => {};
    this.commands["open"] = (...args:[]): void => {};
  }

  private open(...args:[]){

    if(args.length > 0){
      switch(args.at(0) as string){
        case "recruit-list":

          break;
      }
    }
    var module = args[0]

    args.forEach((arg, index, values) => {
      if(arg === "recruit-list"){
        this.layoutService.addPanel(ModulesType.RecruitList);
      }
      if(arg === "recruit-detail")
    });
  }
}
