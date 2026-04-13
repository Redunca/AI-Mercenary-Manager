import { Component, inject } from '@angular/core';
import { CommonModule, NgFor } from '@angular/common';
import { LayoutService } from '../../core/layout.service';

@Component({
  selector: 'app-recruit-list',
  standalone: true,
  imports: [CommonModule, NgFor],
  templateUrl: './recruit-list.component.html',
  styleUrl: './recruit-list.component.scss'
})
export class RecruitListComponent {

  // plus tard tu auras une vraie liste
  recruits = [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" }
  ];

  layout = inject(LayoutService);

  registerCommands() {
    return {
      "detail": (id: string) => {
        if (!id) {
          console.warn("Usage: detail <id>");
          return;
        }
        this.layout.addPanel("recruit-detail", { id });
      }
    };
  }
}

