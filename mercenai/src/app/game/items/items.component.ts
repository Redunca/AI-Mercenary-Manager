import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EquipmentService, Equipment } from '../../core/equipment.service';
import { ConsumableService, Consumable } from '../../core/consumable.service';

@Component({
  selector: 'app-items',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './items.component.html',
  styleUrl: './items.component.scss'
})
export class ItemsComponent implements OnInit {
  private equipmentService = inject(EquipmentService);
  private consumableService = inject(ConsumableService);

  armorStash: Equipment[] = [];
  cargoStash: Consumable[] = [];

  ngOnInit() {
    this.equipmentService.getEquipment().subscribe(state => this.armorStash = state.stash);
    this.consumableService.getConsumables(true).subscribe(items => this.cargoStash = items);
  }

  registerCommands() { return {}; }
}
