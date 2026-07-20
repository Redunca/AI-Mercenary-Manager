import { Component, OnInit, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShipService, Ship } from '../../../core/ship.service';
import { GameService } from '../../../core/game.service';
import { GameSyncService } from '../../../core/game-sync.service';
import { Recruit } from '../../../models/recruit';

@Component({
  selector: 'app-ship-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ship-detail.component.html',
  styleUrl: './ship-detail.component.scss'
})
export class ShipDetailComponent implements OnInit {
  @Input() id?: string;
  private shipService = inject(ShipService);
  private gameService = inject(GameService);
  private gameSync = inject(GameSyncService);
  ship: Ship | null = null;

  ngOnInit() {
    this.shipService.ships$.subscribe(ships => {
      this.ship = ships.find(s => s.id === Number(this.id)) ?? null;
    });
  }

  getRecruit(recruitId: number): Recruit | undefined {
    return this.gameService.recruits.find(r => Number(r.id) === recruitId);
  }

  registerCommands() {
    return {
      'assign': (recruitId: string) => {
        if (!this.ship || !recruitId) { console.warn('Usage: assign <recruitId>'); return; }
        void this.shipService.assignCrewToShip(this.ship.id, [Number(recruitId)])
          .then(() => this.gameSync.sync())
          .catch(err => console.error('[ship assign]', err?.error?.error ?? err?.message ?? err));
      },
      'unassign': (recruitId: string) => {
        if (!this.ship || !recruitId) { console.warn('Usage: unassign <recruitId>'); return; }
        void this.shipService.unassignCrewFromShip(this.ship.id, Number(recruitId))
          .then(() => this.gameSync.sync())
          .catch(err => console.error('[ship unassign]', err?.error?.error ?? err?.message ?? err));
      },
      'rename': (...nameParts: string[]) => {
        if (!this.ship || nameParts.length === 0) { console.warn('Usage: rename <newName>'); return; }
        void this.shipService.renameShip(this.ship.id, nameParts.join(' '))
          .then(() => this.gameSync.sync())
          .catch(err => console.error('[ship rename]', err?.error?.error ?? err?.message ?? err));
      },
      'load': (consumableId: string, quantity?: string) => {
        if (!this.ship || !consumableId) { console.warn('Usage: load <consumableId> [quantity]'); return; }
        void this.shipService.loadConsumableOntoShip(this.ship.id, Number(consumableId), quantity ? Number(quantity) : 1)
          .then(() => this.gameSync.sync())
          .catch(err => console.error('[ship load]', err?.error?.error ?? err?.message ?? err));
      },
    };
  }
}
