import { Component, OnInit, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShopService, ShopItem } from '../../../core/shop.service';

@Component({
  selector: 'app-shop-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="shop-detail" *ngIf="item">
      <div class="title">[ DETAIL ARTICLE ]</div>

      <div class="line"><span class="label">ID</span> : #{{ item.id }}</div>
      <div class="line"><span class="label">Nom</span> : {{ item.name }}</div>
      <div class="line"><span class="label">Type</span> : {{ item.type === 'ship' ? 'NAVIRE' : 'EQUIPEMENT' }}</div>
      <div class="line"><span class="label">Rareté</span> : {{ item.rarity }}</div>
      <div class="line"><span class="label">Prix</span> : {{ item.price }} ¥</div>
      <div class="line"><span class="label">Description</span> : {{ item.description }}</div>

      <div *ngIf="item.type === 'ship'" class="stats">
        <div class="section-title">Stats navire</div>
        <div class="line">Vitesse : {{ item.stats?.speed }}</div>
        <div class="line">Capacité : {{ item.stats?.capacity }}</div>
        <div class="line">Durabilité : {{ item.stats?.durability }}</div>
        <div class="line">Inventaire : {{ item.stats?.inventory_space }}</div>
      </div>

      <div *ngIf="item.type === 'equipment'" class="stats">
        <div class="section-title">Effet</div>
        <div class="line">{{ item.effect }}</div>
      </div>

      <div class="hint">
        Usage terminal : shop buy {{ item.id }}
      </div>
    </div>

    <div class="shop-detail empty" *ngIf="!item">
      <div class="title">[ DETAIL ARTICLE ]</div>
      <div class="line">Article introuvable.</div>
    </div>
  `,
  styles: [`
    .shop-detail {
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
      margin: 0.7rem 0 0.3rem;
      text-transform: uppercase;
    }

    .label {
      color: #8b949e;
      display: inline-block;
      min-width: 6rem;
    }

    .line {
      margin: 0.2rem 0;
    }

    .stats {
      margin-top: 0.6rem;
      padding-left: 0.4rem;
      border-left: 2px solid #30363d;
    }

    .hint {
      margin-top: 0.8rem;
      color: #6e7681;
      font-style: italic;
    }

    .empty {
      color: #8b949e;
    }
  `]
})
export class ShopDetailComponent implements OnInit {
  @Input() id?: string;
  private shopService = inject(ShopService);
  item: ShopItem | null = null;

  ngOnInit() {
    if (this.id) {
      this.shopService.getShopItem(Number(this.id)).subscribe(item => {
        this.item = item;
      });
    }
  }
}