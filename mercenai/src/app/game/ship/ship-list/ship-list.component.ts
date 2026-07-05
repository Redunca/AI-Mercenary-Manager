import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShipService, Ship } from '../../../core/ship.service';

@Component({
  selector: 'app-ship-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ship-list">
      <h2>Navires</h2>
      <div class="ship-item" *ngFor="let ship of ships">
        <div class="ship-name">{{ ship.name }}</div>
        <div class="ship-status" [class]="'status-' + ship.status">{{ ship.status }}</div>
        <div class="ship-crew">Équipage: {{ ship.crew.length }}/{{ ship.stats.capacity }}</div>
      </div>
    </div>
  `,
  styles: [`
    .ship-list { padding: 1rem; }
    .ship-item { 
      border: 1px solid #444; 
      padding: 0.5rem; 
      margin: 0.5rem 0;
      background: #1a1a1a;
    }
    .ship-name { font-weight: bold; }
    .ship-status { font-size: 0.8rem; }
    .status-docked { color: #0f0; }
    .status-in_mission { color: #0ff; }
    .status-destroyed { color: #f00; }
  `]
})
export class ShipListComponent implements OnInit {
  private shipService = inject(ShipService);
  ships: Ship[] = [];

  ngOnInit() {
    this.shipService.getShips().subscribe(ships => {
      this.ships = ships;
    });
  }
}