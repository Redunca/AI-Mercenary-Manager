import { Component } from '@angular/core';

@Component({
  selector: 'app-recruit-list',
  standalone: true,
  imports: [],
  templateUrl: './recruit-list.component.html',
  styleUrl: './recruit-list.component.scss'
})
export class RecruitListComponent {

  // plus tard tu auras une vraie liste
  recruits = [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" }
  ];

  registerCommands() {
    return {
      "detail": (id: string) => {
        if (!id) {
          console.warn("Usage: detail <id>");
          return;
        }
        console.log("Ouvrir recruit-detail pour", id);
      }
    };
  }
}

