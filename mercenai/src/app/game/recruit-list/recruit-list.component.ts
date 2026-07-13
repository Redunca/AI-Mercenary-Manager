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
  styleUrl: './recruit-list.component.scss'
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
    return 'Available';
  }

  registerCommands() {
    return {
      'detail': (id: string) => {
        if (!id) { console.warn('Usage: detail <id>'); return; }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.RecruitDetail, { id });
      }
    };
  }
}
