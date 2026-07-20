import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Consumable } from '../models/ship';

export { Consumable };

// Owned consumables are fetched on demand (like equipment), not part of
// GameSyncService's polled snapshot -- only needed on the cargo/items and
// ship-detail screens.
@Injectable({ providedIn: 'root' })
export class ConsumableService {
  private http = inject(HttpClient);

  getConsumables(unassignedOnly = false): Observable<Consumable[]> {
    const query = unassignedOnly ? '?unassigned=true' : '';
    return this.http.get<Consumable[]>(`/api/consumables${query}`);
  }
}
