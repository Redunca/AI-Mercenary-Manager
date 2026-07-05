import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShipService, Equipment } from '../../../core/ship.service';

@Component({
  selector: 'app-equipment-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="equipment-list">
      <h2>Équipement</h2>
      <div class="equipment-item" *ngFor="let item of equipment">
        <div class="item-name">{{ item.name }}</div>
        <div class="item-rarity" [class]="'rarity-' + item.rarity">{{ item.rarity }}</div>
        <div class="item-quantity">Qty: {{ item.quantity }}</div>
        <div class="item-price">Prix: {{ item.price }}</div>
      </div>
    </div>
  `,
  styles: [`
    .equipment-list { padding: 1rem; }
    .equipment-item { 
      border: 1px solid #444; 
      padding: 0.5rem; 
      margin: 0.5rem 0;
      background: #1a1a1a;
    }
    .item-name { font-weight: bold; }
    .rarity-common { color: #aaa; }
    .rarity-rare { color: #0ff; }
    .rarity-epic { color: #f0f; }
    .rarity-legendary { color: #ff8c00; }
  `]
})
export class EquipmentListComponent implements OnInit {
  private shipService = inject(ShipService);
  equipment: Equipment[] = [];

  ngOnInit() {
    this.shipService.getEquipment().subscribe(equipment => {
      this.equipment = equipment;
    });
  }
}