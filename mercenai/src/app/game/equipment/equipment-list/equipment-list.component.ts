import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShipService, Equipment } from '../../../core/ship.service';

@Component({
  selector: 'app-equipment-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './equipment-list.component.html',
  styleUrl: './equipment-list.component.scss'
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
