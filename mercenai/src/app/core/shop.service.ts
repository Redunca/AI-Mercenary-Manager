import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ShopItem {
  id: number;
  name: string;
  description: string;
  type: 'ship' | 'consumable';
  rarity: string;
  price: number;
  stats?: any;
  effect?: string;
  effect_data?: Record<string, unknown>;
  quantity?: number;
  // How many units of this listing are still purchasable in the player's
  // current 15-minute shop rotation, out of max_stock. 0 = sold out.
  // NOTE: shop_items.available (a legacy column) is no longer read by the
  // backend (see server/src/db/migrations/V013__shop_rotation.sql) and is
  // intentionally not modeled here — remaining_stock is the source of truth.
  remaining_stock: number;
  max_stock: number;
}

// Items rotate out entirely (or restock) on a 15-minute wall-clock server
// cycle. This is unrelated to GameSyncService's mission-driven polling, so
// shop panels poll on their own cadence to catch that boundary while open.
export const SHOP_ITEMS_REFRESH_INTERVAL_MS = 30_000;

export function isSoldOut(item: Pick<ShopItem, 'remaining_stock'>): boolean {
  return item.remaining_stock <= 0;
}

@Injectable({ providedIn: 'root' })
export class ShopService {
  private http = inject(HttpClient);

  getShopItems(): Observable<ShopItem[]> {
    return this.http.get<ShopItem[]>('/api/shop/items');
  }

  getShopItem(id: number): Observable<ShopItem> {
    return this.http.get<ShopItem>(`/api/shop/items/${id}`);
  }

  buyItem(itemId: number, quantity: number = 1): Promise<any> {
    return this.http.post(`/api/shop/buy/${itemId}`, { quantity }).toPromise() as Promise<any>;
  }

  buyShip(itemId: number): Promise<any> {
    return this.http.post(`/api/shop/buy/ship/${itemId}`, {}).toPromise() as Promise<any>;
  }

  buyConsumable(itemId: number, quantity: number = 1): Promise<any> {
    return this.http.post(`/api/shop/buy/consumable/${itemId}`, { quantity }).toPromise() as Promise<any>;
  }
}