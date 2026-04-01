import { Component, Input } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ModuleDisplayBaseComponent } from "./modules/module-display-base/module-display-base.component";
import { ModulesType } from './models/modules-type.enum';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ModuleDisplayBaseComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.sass'
})
export class AppComponent {
   @Input() userName = 'Mercen A.I.';
   ModulesType = ModulesType;
}
