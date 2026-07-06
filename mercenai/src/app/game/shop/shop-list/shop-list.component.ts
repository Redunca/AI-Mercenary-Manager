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
  template: `
    <div class="shop-list">
      <div class="title">[ BOUTIQUE ]</div>

      <div class="line">Crédit disponible : {{ wallet }} ¥</div>

      <div class="section-title">Articles disponibles</div>

      <div class="item" *ngFor="let item of items">
        <div class="item-head">
          <span class="item-id">#{{ item.id }}</span>
          <span class="item-name">{{ item.name }}</span>
          <span class="item-price">{{ item.price }} ¥</span>
        </div>
        <div class="item-meta">
          <span class="item-type" [class]="'type-' + item.type">
            {{ item.type === 'ship' ? 'NAVIRE' : 'EQUIPEMENT' }}
          </span>
          <span class="item-rarity" [class]="'rarity-' + item.rarity">
            {{ item.rarity }}
          </span>
        </div>
        <div class="item-desc">{{ item.description }}</div>
      </div>

      <div class="hint">
        Usage terminal : shop detail &lt;id&gt; | shop buy &lt;id&gt;
      </div>
    </div>
  `,
  styles: [`
    .shop-list {
      padding: 0.75rem;
      color: #d0d0d0;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      line-height: 1.35;
      background: #0f1115;
      height: 100%;
      box-sizing: border-box;
    }

    .title {
      color: #7ee787;
      font-weight: bold;
      margin-bottom: 0.6rem;
      text-transform: uppercase;
    }

    .section-title {
      color: #58a6ff;
      margin: 0.7rem 0 0.4rem;
      text-transform: uppercase;
    }

    .line {
      margin: 0.25rem 0;
      color: #c9d1d9;
    }

    .item {
      border-left: 2px solid #30363d;
      padding: 0.45rem 0.55rem;
      margin: 0.35rem 0;
      background: #161b22;
    }

    .item-head {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 0.2rem;
    }

    .item-id {
      color: #8b949e;
      min-width: 2rem;
    }

    .item-name {
      color: #f0f6fc;
      font-weight: bold;
    }

    .item-price {
      margin-left: auto;
      color: #7ee787;
    }

    .item-meta {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.2rem;
      font-size: 0.8rem;
      text-transform: uppercase;
    }

    .item-type.type-ship {
      color: #58a6ff;
    }

    .item-type.type-equipment {
      color: #d2a8ff;
    }

    .item-rarity.rarity-common {
      color: #8b949e;
    }

    .item-rarity.rarity-rare {
      color: #58a6ff;
    }

    .item-rarity.rarity-epic {
      color: #d2a8ff;
    }

    .item-desc {
      color: #8b949e;
      font-size: 0.82rem;
    }

    .hint {
      margin-top: 0.8rem;
      color: #6e7681;
      font-style: italic;
    }
  `]
})
export class ShopListComponent implements OnInit {
  private shopService = inject(ShopService);
  private layout = inject(LayoutService);
  private gameSync = inject(GameSyncService);
  items: ShopItem[] = [];
  wallet = 0;

  ngOnInit() {
    this.shopService.getShopItems().subscribe(items => { this.items = items; });
    this.shopService.getWallet().subscribe(wallet => { this.wallet = wallet; });
  }

  registerCommands() {
    return {
      'detail': (id: string) => {
        if (!id) { console.warn('Usage: detail <id>'); return; }
        this.layout.addPanel(PanelModule.ShopDetail, { id });
      },
      'buy': (id: string, qtyStr?: string) => {
        if (!id) { console.warn('Usage: buy <id> [quantité]'); return; }
        const qty = qtyStr ? Number(qtyStr) : 1;
        void this.shopService.buyItem(Number(id), qty).then(result => {
          if (result?.error) { console.warn('Achat échoué :', result.error); return; }
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