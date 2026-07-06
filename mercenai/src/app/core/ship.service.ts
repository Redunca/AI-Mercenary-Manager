import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { Ship, Equipment } from '../models/ship';
import { GameSnapshot } from '../models/game-state';

export { Ship, Equipment };

@Injectable({ providedIn: 'root' })
export class ShipService {
  private http = inject(HttpClient);
  
  private shipsSubject = new BehaviorSubject<Ship[]>([]);
  public ships$ = this.shipsSubject.asObservable();
  
  private equipmentSubject = new BehaviorSubject<Equipment[]>([]);
  public equipment$ = this.equipmentSubject.asObservable();

  getShips(): Observable<Ship[]> {
    return this.http.get<Ship[]>('/api/ships');
  }

  getShip(id: number): Observable<Ship> {
    return this.http.get<Ship>(`/api/ships/${id}`);
  }

  getEquipment(): Observable<Equipment[]> {
    return this.http.get<Equipment[]>('/api/equipment');
  }

  getEquipmentById(id: number): Observable<Equipment> {
    return this.http.get<Equipment>(`/api/equipment/${id}`);
  }

  applyState(state: GameSnapshot): void {
    this.shipsSubject.next(state.ships ?? []);
  }

  getShipById(id: number): Ship | undefined {
    return this.shipsSubject.value.find(s => s.id === id);
  }

  getShipForRecruit(recruitId: number): Ship | undefined {
    return this.shipsSubject.value.find(s => s.crew.includes(recruitId));
  }

  assignCrewToShip(shipId: number, recruitIds: number[]): Promise<Ship> {
    return this.http.post<Ship>(`/api/ships/${shipId}/crew`, { recruitIds }).toPromise() as Promise<Ship>;
  }

  unassignCrewFromShip(shipId: number, recruitId: number): Promise<Ship> {
    return this.http.delete<Ship>(`/api/ships/${shipId}/crew/${recruitId}`).toPromise() as Promise<Ship>;
  }

  renameShip(shipId: number, newName: string): Promise<Ship> {
    return this.http.patch<Ship>(`/api/ships/${shipId}`, { name: newName }).toPromise() as Promise<Ship>;
  }

  assignEquipmentToShip(equipmentId: number, shipId: number): Promise<Equipment> {
    return this.http.post<Equipment>(`/api/equipment/${equipmentId}/assign`, { shipId }).toPromise() as Promise<Equipment>;
  }

  unassignEquipmentFromShip(equipmentId: number): Promise<Equipment> {
    return this.http.post<Equipment>(`/api/equipment/${equipmentId}/unassign`, {}).toPromise() as Promise<Equipment>;
  }
}