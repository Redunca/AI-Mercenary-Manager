import { Component, OnInit, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShipService, Ship } from '../../../core/ship.service';

@Component({
  selector: 'app-ship-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ship-detail.component.html',
  styleUrl: './ship-detail.component.scss'
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
