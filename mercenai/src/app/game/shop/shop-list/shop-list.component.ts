import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShopService, ShopItem, SHOP_ITEMS_REFRESH_INTERVAL_MS, isSoldOut } from '../../../core/shop.service';
import { LayoutService } from '../../../core/layout.service';
import { GameSyncService } from '../../../core/game-sync.service';
import { GameService } from '../../../core/game.service';
import { PanelModule } from '../../../models/panel';
import { msUntilNextRefresh, formatCountdown } from '../../../core/refresh-countdown';

@Component({
  selector: 'app-shop-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shop-list.component.html',
  styleUrl: './shop-list.component.scss'
})
export class ShopListComponent implements OnInit, OnDestroy {
  private shopService = inject(ShopService);
  private layout = inject(LayoutService);
  private gameSync = inject(GameSyncService);
  private game = inject(GameService);
  private ngZone = inject(NgZone);
  items: ShopItem[] = [];

  get wallet(): number {
    return this.game.player$.value.credits;
  }

  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  nextRefreshLabel = '—';

  ngOnInit() {
    this.refreshItems();
    this.tickCountdown();

    // The live rotation can swap out from under the player on the server's
    // 15-minute cycle; poll while this panel is open so it doesn't show a
    // stale list until reopened.
    this.refreshTimer = setInterval(() => this.refreshItems(), SHOP_ITEMS_REFRESH_INTERVAL_MS);

    // The countdown clock runs outside Angular's zone: it's a display-only
    // tick with no business being a testability/stability signal, and
    // ticking it inside the zone would trigger an app-wide change detection
    // pass every second for no reason.
    this.ngZone.runOutsideAngular(() => {
      this.countdownTimer = setInterval(() => this.ngZone.run(() => this.tickCountdown()), 1000);
    });
  }

  ngOnDestroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private refreshItems(): void {
    this.shopService.getShopItems().subscribe(items => { this.items = items; });
  }

  private tickCountdown(): void {
    const intervalMs = this.game.player$.value.shopRefreshIntervalMs;
    this.nextRefreshLabel = formatCountdown(msUntilNextRefresh(intervalMs));
  }

  isSoldOut = isSoldOut;

  registerCommands() {
    return {
      'detail': (id: string) => {
        if (!id) { console.warn('Usage: detail <id>'); return; }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShopDetail, { id });
      },
      'buy': (id: string, qtyStr?: string) => {
        if (!id) { console.warn('Usage: buy <id> [quantity]'); return; }

        const item = this.items.find(i => i.id === Number(id));
        if (item && isSoldOut(item)) {
          console.warn('Purchase failed: item is sold out');
          return;
        }

        const qty = qtyStr ? Number(qtyStr) : 1;
        void this.shopService.buyItem(Number(id), qty).then(result => {
          if (result?.error) {
            // Race condition: item sold out (e.g. by a rotation refresh)
            // between load and this attempt. Refresh so the list reflects
            // the item's real state instead of the stale one we checked.
            console.warn('Purchase failed:', result.error);
            this.refreshItems();
            return;
          }
          this.refreshItems();
          void this.gameSync.sync().then(() => {
            if (item?.type === 'ship') {
              this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipList);
            }
          });
        });
      },
    };
  }
}
