import { Component, OnDestroy, OnInit, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShopService, ShopItem, SHOP_ITEMS_REFRESH_INTERVAL_MS, isSoldOut } from '../../../core/shop.service';
import { LayoutService } from '../../../core/layout.service';
import { GameSyncService } from '../../../core/game-sync.service';
import { PanelModule } from '../../../models/panel';

@Component({
  selector: 'app-shop-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shop-detail.component.html',
  styleUrl: './shop-detail.component.scss'
})
export class ShopDetailComponent implements OnInit, OnDestroy {
  @Input() id?: string;
  private shopService = inject(ShopService);
  private layout = inject(LayoutService);
  private gameSync = inject(GameSyncService);
  item: ShopItem | null = null;
  buyError: string | null = null;

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.refreshItem();

    // Rotation can swap this item out (404 -> not found) or its stock can
    // drop to 0 while the panel stays open; poll to catch either.
    this.refreshTimer = setInterval(() => this.refreshItem(), SHOP_ITEMS_REFRESH_INTERVAL_MS);
  }

  ngOnDestroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private refreshItem(): void {
    if (!this.id) return;
    this.shopService.getShopItem(Number(this.id)).subscribe({
      next: item => { this.item = item; },
      error: () => { this.item = null; },
    });
  }

  isSoldOut = isSoldOut;

  registerCommands() {
    return {
      'buy': (qtyStr?: string) => {
        if (!this.item) { console.warn('Item not loaded'); return; }

        if (isSoldOut(this.item)) {
          this.buyError = 'This item is sold out.';
          return;
        }

        const qty = qtyStr ? Number(qtyStr) : 1;
        void this.shopService.buyItem(this.item.id, qty).then(result => {
          if (result?.error) {
            // Race condition: sold out (e.g. by a rotation refresh) between
            // load and this attempt. Refresh so the panel reflects the
            // item's real state instead of the stale one we checked.
            this.buyError = result.error;
            this.refreshItem();
            return;
          }
          this.buyError = null;
          const isShip = this.item?.type === 'ship';
          this.refreshItem();
          void this.gameSync.sync().then(() => {
            if (isShip) this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipList);
          });
        });
      },
    };
  }
}
