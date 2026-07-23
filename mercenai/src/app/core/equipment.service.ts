import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { Equipment, EquipmentState } from '../models/equipment';

export { Equipment, EquipmentState };

// Owned/equipped armor is fetched on demand (like consumables), not part of
// GameSyncService's polled snapshot -- it's only needed on the equipment
// and recruit-detail screens.
@Injectable({ providedIn: 'root' })
export class EquipmentService {
  private http = inject(HttpClient);

  getEquipment(): Observable<EquipmentState> {
    return this.http.get<EquipmentState>('/api/equipment');
  }

  equip(equipmentId: number, recruitId: number): Promise<any> {
    return firstValueFrom(this.http.post(`/api/equipment/${equipmentId}/equip`, { recruitId }));
  }

  unequip(equipmentId: number): Promise<any> {
    return firstValueFrom(this.http.post(`/api/equipment/${equipmentId}/unequip`, {}));
  }
}
