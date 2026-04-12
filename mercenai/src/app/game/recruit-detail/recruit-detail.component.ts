import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-recruit-detail',
  standalone: true,
  imports: [],
  templateUrl: './recruit-detail.component.html',
  styleUrl: './recruit-detail.component.scss'
})
export class RecruitDetailComponent {
  @Input() id!: string;

  registerCommands() {
    console.log("Registering commands for panel", this)
    return {
      "rename": (newName: string) => {
        if (!newName) {
          console.warn("Usage: rename <newName>");
          return;
        }
        console.log("Renommer la recrue", this.id, "→", newName);
      }
    };
  }
}

