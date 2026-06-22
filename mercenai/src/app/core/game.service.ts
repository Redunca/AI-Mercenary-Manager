import { Injectable } from '@angular/core';
import { Recruit } from '../models/recruit';

@Injectable({
  providedIn: 'root'
})
export class GameService {
  recruits: Recruit[] = [
    { id: '1', name: 'Alice',   stats: { phy: 5, men: 3, soc: 0 } },
    { id: '2', name: 'Bob',     stats: { phy: 0, men: 5, soc: 3 } },
    { id: '3', name: 'Charlie', stats: { phy: 3, men: 0, soc: 5 } }
  ];

  getRecruit(id: string): Recruit | null {
    return this.recruits.find(r => r.id === id) ?? null;
  }

  renameRecruit(id: string, newName: string) {
    const r = this.getRecruit(id);
    if (r) r.name = newName;
  }
}
