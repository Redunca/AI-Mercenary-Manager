import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SelfUpgrade {
  id: number;
  name: string;
  description: string;
  tier: number;
  currentValue: number;
  maxValue: number;
  maxed: boolean;
  nextCost: number | null;
}

export interface SelfUpgradeCatalog {
  upgrades: SelfUpgrade[];
  tokens: number;
}

@Injectable({ providedIn: 'root' })
export class SelfService {
  private http = inject(HttpClient);

  getUpgrades(): Observable<SelfUpgradeCatalog> {
    return this.http.get<SelfUpgradeCatalog>('/api/self/upgrades');
  }

  buyUpgrade(id: number): Promise<any> {
    return this.http.post(`/api/self/upgrades/${id}/buy`, {}).toPromise() as Promise<any>;
  }
}
