import { Component, inject } from '@angular/core';
import { CommonModule, NgFor } from '@angular/common';
import { LayoutService } from '../../core/layout.service';
import { GameService } from '../../core/game.service';
import { ShipService } from '../../core/ship.service';
import { PanelModule } from '../../models/panel';
import { Recruit } from '../../models/recruit';

@Component({
  selector: 'app-recruit-list',
  standalone: true,
  imports: [CommonModule, NgFor],
  templateUrl: './recruit-list.component.html',
  styleUrl: './recruit-list.component.scss',
})
export class RecruitListComponent {
  layout = inject(LayoutService);
  game = inject(GameService);
  ships = inject(ShipService);

  get recruits(): Recruit[] {
    return this.game.recruits;
  }

  statusLabel(r: Recruit): string {
    if (r.status === 'dead') return 'DEAD';
    if (r.status === 'in_mission') return 'In Mission';
    if (r.status === 'returning') return 'Returning';
    if (r.status === 'hospitalized') return 'Hospitalized';
    if (this.isCritical(r)) return 'CRITICAL — needs hospital';
    return 'Available';
  }

  // A recruit can come home from a mission at 0 HP and still be flagged
  // 'available' (see completeMission, server-side -- it doesn't check HP
  // before clearing crew back to available) -- without this, they render
  // identically to a fully healthy recruit and are one bad roll from
  // permadeath if sent straight back out.
  isCritical(r: Recruit): boolean {
    return r.hp <= 0 && r.status !== 'dead' && r.status !== 'hospitalized';
  }

  registerCommands() {
    return {
      detail: (id: string) => {
        if (!id) {
          console.warn('Usage: detail <id>');
          return;
        }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.RecruitDetail, { id });
      },
    };
  }
}
