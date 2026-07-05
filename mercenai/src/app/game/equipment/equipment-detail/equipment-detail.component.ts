import { Component, OnInit, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShipService, Equipment } from '../../../core/ship.service';

@Component({
  selector: 'app-equipment-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="equipment-detail" *ngIf="equipment">
      <h2>{{ equipment.name }}</h2>
      <div class="equipment-info">
        <p><strong>Description:</strong> {{ equipment.description }}</p>
        <p><strong>Effet:</strong> {{ equipment.effect }}</p>
        <p><strong>Rareté:</strong> {{ equipment.rarity }}</p>
        <p><strong>Prix:</strong> {{ equipment.price }}</p>
        <p><strong>Quantité:</strong> {{ equipment.quantity }}</p>
        <p *ngIf="equipment.assigned_to_ship">
          <strong>Assigné au Navire:</strong> #{{ equipment.assigned_to_ship }}
        </p>
        <p *ngIf="!equipment.assigned_to_ship" class="unassigned">
          Non assigné
        </p>
      </div>
    </div>
    <div *ngIf="!equipment" class="empty">Équipement non trouvé</div>
  `,
  styles: [`
    .equipment-detail { padding: 1rem; }
    .equipment-info { margin: 1rem 0; }
    .empty { color: #888; font-style: italic; }
    .unassigned { color: #888; }
  `]
})
export class EquipmentDetailComponent implements OnInit {
  @Input() id?: string;
  private shipService = inject(ShipService);
  equipment: Equipment | null = null;

  ngOnInit() {
    if (this.id) {
      this.shipService.getEquipmentById(Number(this.id)).subscribe(equipment => {
        this.equipment = equipment;
      });
    }
  }
}