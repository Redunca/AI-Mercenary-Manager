import { Component, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../core/game.service';
import { Recruit } from '../../models/recruit';

@Component({
  selector: 'app-recruit-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './recruit-detail.component.html',
  styleUrl: './recruit-detail.component.scss'
})
export class RecruitDetailComponent implements OnInit {
  @Input() id!: string;
  game = inject(GameService);

  recruit: Recruit | null = null;

  ngOnInit(): void {
    this.recruit = this.game.getRecruit(this.id);
  }

  statBar(value: number): string {
    return '[' + '■'.repeat(value) + '□'.repeat(10 - value) + ']';
  }

  registerCommands() {
    return {
      'rename': (newName: string) => {
        if (!newName) { console.warn('Usage: rename <newName>'); return; }
        this.game.renameRecruit(this.id, newName);
      }
    };
  }
}
