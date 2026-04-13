import { Component, inject, Input, OnInit } from '@angular/core';
import { GameService } from '../../core/game.service';

@Component({
  selector: 'app-recruit-detail',
  standalone: true,
  imports: [],
  templateUrl: './recruit-detail.component.html',
  styleUrl: './recruit-detail.component.scss'
})
export class RecruitDetailComponent implements OnInit {

  @Input() id!: string;
  game = inject(GameService);

  recruit : {id: string, name: string} | null = null;

   ngOnInit(): void {
     this.recruit = this.game?.getRecruit(this.id);
     console.log("Trying to show recruit with id " + this.id, this.recruit);
  }

  registerCommands() {
    console.log("Registering commands for panel", this)
    return {
      "rename": (newName: string) => {
        if (!newName) {
          console.warn("Usage: rename <newName>");
          return;
        }
        console.log("Renommer la recrue", this.id, "→", newName);
        this.game.renameRecruit(this.id, newName);
      }
    };
  }
}

