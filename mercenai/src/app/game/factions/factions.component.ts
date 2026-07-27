import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../core/game.service';
import { FactionReputation } from '../../models/faction';

@Component({
  selector: 'app-factions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './factions.component.html',
  styleUrl: './factions.component.scss',
})
export class FactionsComponent {
  game = inject(GameService);

  get factions(): FactionReputation[] {
    return [...this.game.factionReputations].sort((a, b) => a.name.localeCompare(b.name));
  }

  registerCommands() {
    return {};
  }
}
