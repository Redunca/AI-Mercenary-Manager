import { inject, Injectable } from '@angular/core';
import { Candidate, CandidateArchetype, Flaw, Perk } from '../models/candidate';
import { computeMaxHp, Recruit, RecruitAttributes } from '../models/recruit';
import { DiceService } from './dice.service';
import { GameService } from './game.service';
import perksFlawsData from '../data/perks-flaws.json';

const ATTRIBUTE_KEYS: (keyof RecruitAttributes)[] = [
  'agility', 'fortitude', 'might',
  'learning', 'logic', 'perception', 'will',
  'deception', 'persuasion', 'presence',
];

// Valeurs de stats par archétype, complétées à 10 avec des zéros
const ATTRIBUTE_TABLES: Record<CandidateArchetype, number[]> = {
  'specialized':        [5, 4, 3, 2, 2, 2, 0, 0, 0, 0],
  'well-rounded':       [4, 4, 3, 3, 3, 1, 1, 0, 0, 0],
  'jack-of-all-trades': [3, 3, 3, 3, 3, 2, 2, 2, 1, 0],
};

const JOB_TITLES: Record<CandidateArchetype, string[]> = {
  'specialized':        ['Assassin', 'Soldat d\'élite', 'Hacker', 'Franc-tireur', 'Berserk', 'Saboteur', 'Infiltrateur'],
  'well-rounded':       ['Opérateur', 'Éclaireur', 'Tacticien', 'Agent de terrain', 'Commando', 'Ranger'],
  'jack-of-all-trades': ['Freelance', 'Mercenaire', 'Contractuel', 'Survivant', 'Drifter', 'Généraliste'],
};

const CANDIDATE_NAMES = [
  'Kade', 'Riven', 'Sable', 'Torque', 'Vex', 'Zara', 'Dusk', 'Mira',
  'Rook', 'Shade', 'Lark', 'Finn', 'Nash', 'Cole', 'Jade', 'Rex',
  'Nova', 'Gray', 'Wren', 'Cruz', 'Vale', 'Blaze', 'Hex', 'Sorn',
  'Lyra', 'Dane', 'Pax', 'Fen', 'Voss', 'Kyra',
];

const ARCHETYPES: CandidateArchetype[] = ['specialized', 'well-rounded', 'jack-of-all-trades'];

@Injectable({ providedIn: 'root' })
export class CandidateService {
  private dice = inject(DiceService);
  game = inject(GameService);

  private nextId = 1;
  candidates: Candidate[] = [];

  constructor() {
    this.generateCandidates(5);
    this.hireCandidate(this.candidates[0].id);
  }

  generateCandidates(count: number): void {
    this.candidates = Array.from({ length: count }, () => this.generateCandidate());
  }

  private generateCandidate(): Candidate {
    const id = String(this.nextId++);
    const archetype = this.pickRandom(ARCHETYPES);
    const name = this.pickRandom(CANDIDATE_NAMES);
    const jobTitle = this.pickRandom(JOB_TITLES[archetype]);
    const attributes = this.buildAttributes(ATTRIBUTE_TABLES[archetype]);
    const maxHp = computeMaxHp(attributes);
    const perkCount = this.dice.rollInRange(0, 2);
    const flawCount = this.dice.rollInRange(0, 2);
    const perks = this.pickUnique(perksFlawsData.perks as Perk[], perkCount);
    const flaws = this.pickUnique(perksFlawsData.flaws as Flaw[], flawCount);

    return { id, name, jobTitle, archetype, attributes, hp: maxHp, maxHp, perks, flaws };
  }

  private buildAttributes(values: number[]): RecruitAttributes {
    const shuffled = this.shuffle([...values]);
    return ATTRIBUTE_KEYS.reduce((acc, key, i) => {
      acc[key] = shuffled[i];
      return acc;
    }, {} as RecruitAttributes);
  }

  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.dice.rollInRange(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private pickRandom<T>(arr: T[]): T {
    return arr[this.dice.rollInRange(0, arr.length - 1)];
  }

  private pickUnique<T>(arr: T[], count: number): T[] {
    return this.shuffle([...arr]).slice(0, count);
  }

  hireCandidate(candidateId: string): Recruit | null {
    const index = this.candidates.findIndex(c => c.id === candidateId);
    if (index === -1) return null;

    const candidate = this.candidates[index];
    const recruit = this.game.addRecruit(candidate.name, candidate.attributes, candidate.jobTitle, candidate.perks, candidate.flaws);
    if (!recruit) return null;
    this.candidates.splice(index, 1);
    return recruit;
  }
}
