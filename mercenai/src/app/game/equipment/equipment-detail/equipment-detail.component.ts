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
    if (this.id) {
      this.shipService.getEquipmentById(Number(this.id)).subscribe(equipment => {
        this.equipment = equipment;
      });
    }
  }
}
