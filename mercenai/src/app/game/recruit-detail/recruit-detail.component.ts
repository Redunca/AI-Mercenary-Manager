import { Component, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../core/game.service';

@Component({
  selector: 'app-recruit-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './recruit-detail.component.html',
  styleUrl: './recruit-detail.component.scss'
})
export class RecruitDetailComponent {
  @Input() id!: string;
  game = inject(GameService);

  get recruit() {
    return this.game.getRecruit(this.id);
  }

  statBar(value: number): string {
    return '[' + '■'.repeat(value) + '□'.repeat(10 - value) + ']';
  }

  registerCommands() {
    return {
      'rename': (newName: string) => {
        if (!newName) { console.warn('Usage: rename <newName>'); return; }
        void this.game.renameRecruit(this.id, newName);
      }
    };
  }
}
