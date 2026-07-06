import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShipService, Ship } from '../../../core/ship.service';

@Component({
  selector: 'app-ship-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ship-list.component.html',
  styleUrl: './ship-list.component.scss'
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
