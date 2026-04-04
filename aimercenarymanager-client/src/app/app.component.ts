import { Component, inject, Input } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ModuleDisplayBaseComponent } from "./modules/module-display-base/module-display-base.component";
import { ModulesType } from './models/modules-type.enum';
import { RecruitDetailComponent } from "./modules/recruit/recruit-detail/recruit-detail.component";
import { RecruitListComponent } from "./modules/recruit/recruit-list/recruit-list.component";
import { LayoutService } from './core/layout.service';
import { GameService } from './core/game.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ModuleDisplayBaseComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.sass'
})
export class AppComponent {

   public layoutService = inject(LayoutService);
   public gameService = inject(GameService);

   ModulesType = ModulesType;
}
