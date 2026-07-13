import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShipService, Ship } from '../../../core/ship.service';
import { LayoutService } from '../../../core/layout.service';
import { PanelModule } from '../../../models/panel';

@Component({
  selector: 'app-ship-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ship-list.component.html',
  styleUrl: './ship-list.component.scss'
})
export class ShipListComponent implements OnInit {
  private shipService = inject(ShipService);
  private layout = inject(LayoutService);
  ships: Ship[] = [];

  ngOnInit() {
    this.shipService.ships$.subscribe(ships => {
      this.ships = ships;
    });
  }

  registerCommands() {
    return {
      'detail': (id: string) => {
        if (!id) { console.warn('Usage: detail <id>'); return; }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipDetail, { id });
      }
    };
  }
}
