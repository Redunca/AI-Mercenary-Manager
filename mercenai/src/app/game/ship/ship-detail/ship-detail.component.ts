import { Component, OnInit, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShipService, Ship } from '../../../core/ship.service';
import { GameService } from '../../../core/game.service';
import { Recruit } from '../../../models/recruit';

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
  private gameService = inject(GameService);
  ship: Ship | null = null;

  ngOnInit() {
    this.shipService.ships$.subscribe(ships => {
      this.ship = ships.find(s => s.id === Number(this.id)) ?? null;
    });
  }

  getRecruit(recruitId: number): Recruit | undefined {
    return this.gameService.recruits.find(r => Number(r.id) === recruitId);
  }
}
