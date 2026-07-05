import { Component, OnInit, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShipService, Ship } from '../../../core/ship.service';

@Component({
  selector: 'app-ship-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ship-detail" *ngIf="ship">
      <h2>{{ ship.name }}</h2>
      <div class="ship-info">
        <p><strong>ID Galactique:</strong> {{ ship.galactic_id }}</p>
        <p><strong>Rareté:</strong> {{ ship.rarity }}</p>
        <p><strong>Statut:</strong> {{ ship.status }}</p>
      </div>
      <div class="ship-stats">
        <h3>Stats</h3>
        <p>Vitesse: {{ ship.stats.speed }}%</p>
        <p>Capacité: {{ ship.stats.capacity }}</p>
        <p>Durabilité: {{ ship.stats.durability }}</p>
        <p>Prix: {{ ship.stats.price }}</p>
      </div>
      <div class="ship-crew">
        <h3>Équipage ({{ ship.crew.length }}/{{ ship.stats.capacity }})</h3>
        <div *ngIf="ship.crew.length === 0" class="empty">Pas d'équipage assigné</div>
        <div *ngFor="let recruitId of ship.crew" class="crew-member">
          Recrue #{{ recruitId }}
        </div>
      </div>
    </div>
    <div *ngIf="!ship" class="empty">Navire non trouvé</div>
  `,
  styles: [`
    .ship-detail { padding: 1rem; }
    .ship-info, .ship-stats, .ship-crew { margin: 1rem 0; }
    .empty { color: #888; font-style: italic; }
    .crew-member { 
      padding: 0.25rem 0.5rem; 
      background: #1a1a1a; 
      margin: 0.25rem 0;
      border-left: 2px solid #0f0;
    }
  `]
})
export class ShipDetailComponent implements OnInit {
  @Input() id?: string;
  private shipService = inject(ShipService);
  ship: Ship | null = null;

  ngOnInit() {
    if (this.id) {
      this.shipService.getShip(Number(this.id)).subscribe(ship => {
        this.ship = ship;
      });
    }
  }
}