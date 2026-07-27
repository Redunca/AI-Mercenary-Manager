import type { RecruitAttributes, RecruitPersonality } from './recruit';

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
  personality: RecruitPersonality;
  attributes: RecruitAttributes;
  hp: number;
  maxHp: number;
  perks: Perk[];
  flaws: Flaw[];
  // True when an opera required hiring this specific candidate -- exempt
  // from shop-style rotation, see server's generateCandidateBatch.
  isQuestCandidate: boolean;
}
