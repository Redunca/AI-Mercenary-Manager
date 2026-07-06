import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ShopItem {
  id: number;
  name: string;
  description: string;
  type: 'ship' | 'equipment';
  rarity: string;
  price: number;
  stats?: any;
  effect?: string;
  quantity?: number;
  available: boolean;
}

@Injectable({ providedIn: 'root' })
export class ShopService {
  private http = inject(HttpClient);

  private walletSubject = new BehaviorSubject<number>(0);
  public wallet$ = this.walletSubject.asObservable();

  getShopItems(): Observable<ShopItem[]> {
    return this.http.get<ShopItem[]>('/api/shop/items');
  }

  getShopItem(id: number): Observable<ShopItem> {
    return this.http.get<ShopItem>(`/api/shop/items/${id}`);
  }

  getWallet(): Observable<number> {
    return this.http.get<number>('/api/shop/wallet');
  }

  buyItem(itemId: number, quantity: number = 1): Promise<any> {
    return this.http.post(`/api/shop/buy/${itemId}`, { quantity }).toPromise() as Promise<any>;
  }

  buyShip(itemId: number): Promise<any> {
    return this.http.post(`/api/shop/buy/ship/${itemId}`, {}).toPromise() as Promise<any>;
  }

  buyEquipment(itemId: number, quantity: number = 1): Promise<any> {
    return this.http.post(`/api/shop/buy/equipment/${itemId}`, { quantity }).toPromise() as Promise<any>;
  }
}