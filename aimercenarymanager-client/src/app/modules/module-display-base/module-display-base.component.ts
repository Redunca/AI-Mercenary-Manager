import { CommonModule } from '@angular/common';
import { AfterContentInit, Component, Input, numberAttribute } from '@angular/core';
import { SanitizePipe } from '../../shared/sanitize.pipe';
import { ModulesType } from '../../models/modules-type.enum';
import { RecruitListComponent } from "../recruit/recruit-list/recruit-list.component";

@Component({
  selector: 'app-module-display-base',
  standalone: true,
  imports: [CommonModule, SanitizePipe, RecruitListComponent],
  templateUrl: './module-display-base.component.html',
  styleUrl: './module-display-base.component.sass'
})

export class ModuleDisplayBaseComponent implements AfterContentInit{
  ngAfterContentInit(): void {
    switch(this.module){
      case ModulesType.None:
        this.moduleTitle = "Lorem Ipsum"
        break;
        case ModulesType.RecruitList:
          this.moduleTitle= "Recruit List"
          break; 
          default:
            this.moduleTitle = "Unknown Error"
            break;
    }
  }
  @Input() userName = '';
  moduleTitle = '';
  @Input() isSelected = false;
  @Input() hasRightNeighbor = false;
  @Input() hasLeftNeighbor = false;
  @Input() hasTopNeighbor = false;
  @Input() hasBottomNeighbor = false;

  @Input() module : ModulesType = ModulesType.None; 

  ModulesType = ModulesType;


}
