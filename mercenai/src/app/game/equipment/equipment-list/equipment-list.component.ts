import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShipService, Equipment } from '../../../core/ship.service';
import { LayoutService } from '../../../core/layout.service';
import { PanelModule } from '../../../models/panel';

@Component({
  selector: 'app-equipment-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './equipment-list.component.html',
  styleUrl: './equipment-list.component.scss'
})
export class EquipmentListComponent implements OnInit {
  private shipService = inject(ShipService);
  private layout = inject(LayoutService);
  equipment: Equipment[] = [];

  ngOnInit() {
    this.shipService.getEquipment().subscribe(equipment => {
      this.equipment = equipment;
    });
  }

  registerCommands() {
    return {
      'detail': (id: string) => {
        if (!id) { console.warn('Usage: detail <id>'); return; }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.EquipmentDetail, { id });
      }
    };
  }
}
