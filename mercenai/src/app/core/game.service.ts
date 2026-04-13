import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class GameService {
 recruits = [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
    { id: "3", name: "Charlie" }
  ];
  getRecruit(id: string) {
    return this.recruits.find(r => r.id === id) ?? null;
  }

  renameRecruit(id: string, newName: string) {
    const r = this.getRecruit(id);
    if (r) {
      r.name = newName;
    }
  }
}
