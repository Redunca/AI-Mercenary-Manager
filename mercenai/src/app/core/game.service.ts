import { Injectable } from '@angular/core';
import { computeMaxHp, Recruit, RecruitAttributes, RecruitStatus } from '../models/recruit';

function makeRecruit(
  id: string,
  name: string,
  attrs: RecruitAttributes
): Recruit {
  const maxHp = computeMaxHp(attrs);
  return { id, name, attributes: attrs, hp: maxHp, maxHp, status: 'available' };
}

@Injectable({ providedIn: 'root' })
export class GameService {
  recruits: Recruit[] = [
    makeRecruit('1', 'Alice', {
      // Soldate — spécialiste du combat rapproché
      agility: 5, fortitude: 3, might: 4,
      learning: 2, logic: 1, perception: 3, will: 2,
      deception: 0, persuasion: 0, presence: 0,
      // maxHp = 2*(3+0+2)+10 = 20
    }),
    makeRecruit('2', 'Bob', {
      // Technicien — hacker et ingénieur de terrain
      agility: 0, fortitude: 0, might: 0,
      learning: 5, logic: 4, perception: 3, will: 2,
      deception: 1, persuasion: 0, presence: 0,
      // maxHp = 2*(0+0+2)+10 = 14
    }),
    makeRecruit('3', 'Charlie', {
      // Négociateur — infiltration et manipulation
      agility: 3, fortitude: 1, might: 0,
      learning: 0, logic: 0, perception: 2, will: 0,
      deception: 4, persuasion: 5, presence: 3,
      // maxHp = 2*(1+3+0)+10 = 18
    }),
  ];

  getRecruit(id: string): Recruit | null {
    return this.recruits.find(r => r.id === id) ?? null;
  }

  renameRecruit(id: string, newName: string): void {
    const r = this.getRecruit(id);
    if (r) r.name = newName;
  }

  setRecruitStatus(id: string, status: RecruitStatus): void {
    const r = this.getRecruit(id);
    if (r && r.status !== 'dead') r.status = status;
  }

  damageRecruit(id: string, amount: number): void {
    const r = this.getRecruit(id);
    if (!r || r.status === 'dead') return;
    r.hp = Math.max(0, r.hp - amount);
    if (r.hp === 0) this.killRecruit(id);
  }

  killRecruit(id: string): void {
    const r = this.getRecruit(id);
    if (!r) return;
    r.hp = 0;
    r.status = 'dead';
  }
}
