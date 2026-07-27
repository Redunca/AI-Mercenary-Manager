import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../core/game.service';
import { Recruit } from '../../models/recruit';

@Component({
  selector: 'app-cemetery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cemetery.component.html',
  styleUrl: './cemetery.component.scss',
})
export class CemeteryComponent {
  game = inject(GameService);

  get deceasedRecruits(): Recruit[] {
    return this.game.recruits.filter((r) => r.status === 'dead');
  }

  registerCommands() {
    return {};
  }
}
