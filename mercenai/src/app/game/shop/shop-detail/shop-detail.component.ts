import { Component, OnInit, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShopService, ShopItem } from '../../../core/shop.service';
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
export class ShopDetailComponent implements OnInit {
  @Input() id?: string;
  private shopService = inject(ShopService);
  private layout = inject(LayoutService);
  private gameSync = inject(GameSyncService);
  item: ShopItem | null = null;

  ngOnInit() {
    if (this.id) {
      this.shopService.getShopItem(Number(this.id)).subscribe(item => { this.item = item; });
    }
  }

  registerCommands() {
    return {
      'buy': (qtyStr?: string) => {
        if (!this.item) { console.warn('Item not loaded'); return; }
        const qty = qtyStr ? Number(qtyStr) : 1;
        void this.shopService.buyItem(this.item.id, qty).then(result => {
          if (result?.error) { console.warn('Purchase failed:', result.error); return; }
          const isShip = this.item?.type === 'ship';
          void this.gameSync.sync().then(() => {
            if (isShip) this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShipList);
          });
        });
      },
    };
  }
}
