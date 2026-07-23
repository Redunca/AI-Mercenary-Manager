import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable } from 'rxjs';
import { Ship, Consumable } from '../models/ship';
import { GameSnapshot } from '../models/game-state';

export { Ship, Consumable };

@Injectable({ providedIn: 'root' })
export class ShipService {
  private http = inject(HttpClient);

  private shipsSubject = new BehaviorSubject<Ship[]>([]);
  public ships$ = this.shipsSubject.asObservable();

  getShips(): Observable<Ship[]> {
    return this.http.get<Ship[]>('/api/ships');
  }

  getShip(id: number): Observable<Ship> {
    return this.http.get<Ship>(`/api/ships/${id}`);
  }

  getShipInventory(shipId: number): Observable<Consumable[]> {
    return this.http.get<Consumable[]>(`/api/ships/${shipId}/inventory`);
  }

  applyState(state: GameSnapshot): void {
    this.shipsSubject.next(state.ships ?? []);
  }

  getShipById(id: number): Ship | undefined {
    return this.shipsSubject.value.find((s) => s.id === id);
  }

  getShipForRecruit(recruitId: number): Ship | undefined {
    return this.shipsSubject.value.find((s) => s.crew.includes(recruitId));
  }

  assignCrewToShip(shipId: number, recruitIds: number[]): Promise<Ship> {
    return firstValueFrom(this.http.post<Ship>(`/api/ships/${shipId}/crew`, { recruitIds }));
  }

  unassignCrewFromShip(shipId: number, recruitId: number): Promise<Ship> {
    return firstValueFrom(this.http.delete<Ship>(`/api/ships/${shipId}/crew/${recruitId}`));
  }

  renameShip(shipId: number, newName: string): Promise<Ship> {
    return firstValueFrom(this.http.patch<Ship>(`/api/ships/${shipId}`, { name: newName }));
  }

  loadConsumableOntoShip(shipId: number, consumableId: number, quantity = 1): Promise<Consumable> {
    return firstValueFrom(
      this.http.post<Consumable>(`/api/ships/${shipId}/inventory`, { consumableId, quantity }),
    );
  }

  unloadConsumableFromShip(
    shipId: number,
    consumableId: number,
    quantity = 1,
  ): Promise<Consumable> {
    return firstValueFrom(
      this.http.delete<Consumable>(`/api/ships/${shipId}/inventory/${consumableId}`, {
        body: { quantity },
      }),
    );
  }
}
