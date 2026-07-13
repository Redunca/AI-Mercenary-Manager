import { Component, OnInit, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShipService, Equipment } from '../../../core/ship.service';

@Component({
  selector: 'app-equipment-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './equipment-detail.component.html',
  styleUrl: './equipment-detail.component.scss'
})
export class EquipmentDetailComponent implements OnInit {
  @Input() id?: string;
  private shipService = inject(ShipService);
  equipment: Equipment | null = null;

  ngOnInit() {
    this.refresh();
  }

  private refresh(): void {
    if (this.id) {
      this.shipService.getEquipmentById(Number(this.id)).subscribe(equipment => {
        this.equipment = equipment;
      });
    }
  }

  registerCommands() {
    return {
      'assign': (shipId: string) => {
        if (!this.equipment || !shipId) { console.warn('Usage: assign <shipId>'); return; }
        void this.shipService.assignEquipmentToShip(this.equipment.id, Number(shipId))
          .then(() => this.refresh())
          .catch(err => console.error('[equipment assign]', err?.error?.error ?? err?.message ?? err));
      },
      'unassign': () => {
        if (!this.equipment) { console.warn('No equipment loaded'); return; }
        void this.shipService.unassignEquipmentFromShip(this.equipment.id)
          .then(() => this.refresh())
          .catch(err => console.error('[equipment unassign]', err?.error?.error ?? err?.message ?? err));
      },
    };
  }
}
