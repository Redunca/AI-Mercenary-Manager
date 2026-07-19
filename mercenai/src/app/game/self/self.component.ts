import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SelfService, SelfUpgrade } from '../../core/self.service';
import { GameSyncService } from '../../core/game-sync.service';

@Component({
  selector: 'app-self',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './self.component.html',
  styleUrl: './self.component.scss'
})
export class SelfComponent implements OnInit {
  private selfService = inject(SelfService);
  private gameSync = inject(GameSyncService);

  upgrades: SelfUpgrade[] = [];
  tokens = 0;

  ngOnInit() {
    this.refreshUpgrades();
  }

  private refreshUpgrades(): void {
    this.selfService.getUpgrades().subscribe(catalog => {
      this.upgrades = catalog.upgrades;
      this.tokens = catalog.tokens;
    });
  }

  private buy(id: string): void {
    const upgrade = this.upgrades.find(u => u.id === Number(id));
    if (upgrade?.maxed) {
      console.warn('Purchase failed: upgrade already maxed');
      return;
    }

    void this.selfService.buyUpgrade(Number(id)).then(result => {
      if (result?.error) {
        // Race condition: another purchase (or a catalog ceiling shift)
        // between load and this attempt. Refresh so the list reflects the
        // upgrade's real state instead of the stale one we checked.
        console.warn('Purchase failed:', result.error);
        this.refreshUpgrades();
        return;
      }
      this.refreshUpgrades();
      void this.gameSync.sync();
    });
  }

  registerCommands() {
    return {
      'buy': (id: string) => {
        if (!id) { console.warn('Usage: buy <id>'); return; }
        this.buy(id);
      },
    };
  }
}
