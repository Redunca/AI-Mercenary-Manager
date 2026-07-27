export type RecruitStatus = 'available' | 'in_mission' | 'returning' | 'hospitalized' | 'dead';

export type AttributeKey =
  | 'agility'
  | 'fortitude'
  | 'might'
  | 'learning'
  | 'logic'
  | 'perception'
  | 'will'
  | 'deception'
  | 'persuasion'
  | 'presence';

export interface RecruitAttributes {
  // Physical
  agility: number;
  fortitude: number;
  might: number;
  // Mental
  learning: number;
  logic: number;
  perception: number;
  will: number;
  // Social
  deception: number;
  persuasion: number;
  presence: number;
}

export type RecruitPersonality = 'Analyst' | 'Diplomat' | 'Sentinel' | 'Explorer';

export interface Recruit {
  id: string;
  name: string;
  jobTitle?: string;
  personality?: RecruitPersonality;
  attributes: RecruitAttributes;
  hp: number;
  maxHp: number;
  originalMaxHp: number;
  status: RecruitStatus;
  perks?: { name: string; description: string }[];
  flaws?: { name: string; description: string }[];
}

// Mirrors server/data/perk-effects.json -- the curated subset of perks/flaws
// (out of the full pool in server/data/perks-flaws.json) that grant a
// passive +/-1 modifier on skill checks for a specific attribute. Any
// perk/flaw name not listed here (including opera-granted custom names) has
// no mechanical effect, only flavor.
export const PERK_ATTRIBUTE_MODIFIERS: Record<string, { attribute: AttributeKey; amount: number }> = {
  Observant: { attribute: 'perception', amount: 1 },
  Scholar: { attribute: 'learning', amount: 1 },
  'Silver Tongue': { attribute: 'persuasion', amount: 1 },
  'Street Rat': { attribute: 'agility', amount: 1 },
  Resilient: { attribute: 'fortitude', amount: 1 },
  Courageous: { attribute: 'will', amount: 1 },
  'Extraordinary Presence': { attribute: 'presence', amount: 1 },
  Artisan: { attribute: 'logic', amount: 1 },
  Cowardly: { attribute: 'will', amount: -1 },
  'Absent-minded': { attribute: 'perception', amount: -1 },
  Dimwitted: { attribute: 'learning', amount: -1 },
  'Socially Awkward': { attribute: 'persuasion', amount: -1 },
  Uncoordinated: { attribute: 'agility', amount: -1 },
  'Short-winded': { attribute: 'fortitude', amount: -1 },
  Naive: { attribute: 'deception', amount: -1 },
};
