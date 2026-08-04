import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ShopService,
  ShopItem,
  SHOP_ITEMS_REFRESH_INTERVAL_MS,
  isSoldOut,
} from '../../../core/shop.service';
import { LayoutService } from '../../../core/layout.service';
import { GameSyncService } from '../../../core/game-sync.service';
import { GameService } from '../../../core/game.service';
import { PanelModule } from '../../../models/panel';
import { msUntilNextRefresh, formatCountdown } from '../../../core/refresh-countdown';

// Display grouping only -- distinct from ShopItem.type, since a quest item
// (is_quest_item) is pulled into its own section regardless of its
// underlying type. Order here is display order: items that cycle in on the
// shop's timed rotation first, then the conditionally-present quest items.
type ShopCategory = 'consumable' | 'armor' | 'ship' | 'quest';
const SHOP_CATEGORY_ORDER: ShopCategory[] = ['consumable', 'armor', 'ship', 'quest'];
const SHOP_CATEGORY_LABELS: Record<ShopCategory, string> = {
  consumable: 'Consumables',
  armor: 'Equipment',
  ship: 'Ships',
  quest: 'Quests',
};

@Component({
  selector: 'app-shop-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shop-list.component.html',
  styleUrl: './shop-list.component.scss',
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

  // Same items, sorted into display-category order (Array.sort is stable,
  // so within a category the backend's type/rarity/price ordering — see
  // shop.service.js's getShopItems — is preserved). The template pairs this
  // with `category()` to print one section header per run of matching items
  // rather than duplicating the row markup per category.
  get groupedItems(): ShopItem[] {
    return [...this.items].sort(
      (a, b) =>
        SHOP_CATEGORY_ORDER.indexOf(this.category(a)!) -
        SHOP_CATEGORY_ORDER.indexOf(this.category(b)!),
    );
  }

  category(item: ShopItem | undefined): ShopCategory | null {
    if (!item) return null;
    return item.is_quest_item ? 'quest' : item.type;
  }

  categoryLabel(item: ShopItem): string {
    return SHOP_CATEGORY_LABELS[this.category(item)!];
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
    this.shopService.getShopItems().subscribe((items) => {
      this.items = items;
    });
  }

  private tickCountdown(): void {
    const intervalMs = this.game.player$.value.shopRefreshIntervalMs;
    this.nextRefreshLabel = formatCountdown(msUntilNextRefresh(intervalMs));
  }

  isSoldOut = isSoldOut;

  registerCommands() {
    return {
      detail: (id: string) => {
        if (!id) {
          console.warn('Usage: detail <id>');
          return;
        }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShopDetail, { id });
      },
      buy: (id: string, qtyStr?: string) => {
        if (!id) {
          console.warn('Usage: buy <id> [quantity]');
          return;
        }

        const item = this.items.find((i) => i.id === Number(id));
        if (item && isSoldOut(item)) {
          console.warn('Purchase failed: item is sold out');
          return;
        }

        const qty = qtyStr ? Number(qtyStr) : 1;
        void this.shopService.buyItem(Number(id), qty).then((result) => {
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
