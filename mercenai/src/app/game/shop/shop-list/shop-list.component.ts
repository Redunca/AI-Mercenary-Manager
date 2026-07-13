import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShopService, ShopItem } from '../../../core/shop.service';
import { LayoutService } from '../../../core/layout.service';
import { GameSyncService } from '../../../core/game-sync.service';
import { PanelModule } from '../../../models/panel';

@Component({
  selector: 'app-shop-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shop-list.component.html',
  styleUrl: './shop-list.component.scss'
})
export class ShopListComponent implements OnInit {
  private shopService = inject(ShopService);
  private layout = inject(LayoutService);
  private gameSync = inject(GameSyncService);
  items: ShopItem[] = [];
  wallet = 0;

  ngOnInit() {
    this.shopService.getShopItems().subscribe(items => { this.items = items; });
    this.shopService.wallet$.subscribe(wallet => { this.wallet = wallet; });
    this.shopService.refreshWallet();
  }

  registerCommands() {
    return {
      'detail': (id: string) => {
        if (!id) { console.warn('Usage: detail <id>'); return; }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.ShopDetail, { id });
      },
      'buy': (id: string, qtyStr?: string) => {
        if (!id) { console.warn('Usage: buy <id> [quantity]'); return; }
        const qty = qtyStr ? Number(qtyStr) : 1;
        void this.shopService.buyItem(Number(id), qty).then(result => {
          if (result?.error) { console.warn('Purchase failed:', result.error); return; }
          const item = this.items.find(i => i.id === Number(id));
          void this.gameSync.sync().then(() => {
            const target = item?.type === 'equipment' ? PanelModule.EquipmentList : PanelModule.ShipList;
            this.layout.setPanelModule(this.layout.activePanelId!, target);
          });
        });
      },
    };
  }
}
