import { RecruitAttributes } from './recruit';

export type CandidateArchetype = 'specialized' | 'well-rounded' | 'jack-of-all-trades';

export interface Perk {
  name: string;
  description: string;
}

export interface Flaw {
  name: string;
  description: string;
}

export interface Candidate {
  id: string;
  name: string;
  jobTitle: string;
  archetype: CandidateArchetype;
  attributes: RecruitAttributes;
  hp: number;
  maxHp: number;
  perks: Perk[];
  flaws: Flaw[];
}
