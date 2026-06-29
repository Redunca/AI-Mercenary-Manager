import { Injectable } from '@angular/core';
import { computeMaxHp, Recruit, RecruitAttributes, RecruitStatus } from '../models/recruit';
import { Subject } from 'rxjs';

function makeRecruit(
  id: string,
  name: string,
  attrs: RecruitAttributes,
  jobTitle?: string,
  perks?: Recruit['perks'],
  flaws?: Recruit['flaws'],
): Recruit {
  const maxHp = computeMaxHp(attrs);
  return { id, name, jobTitle, attributes: attrs, hp: maxHp, maxHp, status: 'available', perks: perks ?? [], flaws: flaws ?? [] };
}

@Injectable({ providedIn: 'root' })
export class GameService {
  private nextRecruitId = 1;
  recruitHired$ = new Subject<Recruit>();

  recruits: Recruit[] = [];

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

  maxRecruits = 5;

  addRecruit(name: string, attrs: RecruitAttributes, jobTitle?: string, perks?: Recruit['perks'], flaws?: Recruit['flaws']): Recruit | null {
    if (this.recruits.length >= this.maxRecruits) return null;
    const recruit = makeRecruit(String(this.nextRecruitId++), name, attrs, jobTitle, perks, flaws);
    this.recruits.push(recruit);
    this.recruitHired$.next(recruit);
    return recruit;
  }
}
