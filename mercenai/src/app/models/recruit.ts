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
  // Gained from REFLECTION mission events (1 XP = 3 attribute points, per
  // the Open Legend core rules). Spend attributePoints via the recruit-detail
  // screen's `raise <attribute>` command -- see levelForExperience/
  // maxAttributeForLevel/attributePointCost below.
  experience: number;
  attributePoints: number;
}

// Open Legend core rules (01-character-creation), Player Character Level
// Advancement table: level = floor(total XP / 3) + 1. Mirrors
// server/src/domain/recruit.js's levelForExperience.
export function levelForExperience(experience: number): number {
  return Math.floor(experience / 3) + 1;
}

// Same table's Maximum Attribute Score column, tiered every 2 levels. A
// score of 10 can never be purchased with attribute points regardless of
// level, so 9 is the ceiling forever. Mirrors maxAttributeForLevel.
export function maxAttributeForLevel(level: number): number {
  if (level <= 2) return 5;
  if (level <= 4) return 6;
  if (level <= 6) return 7;
  if (level <= 8) return 8;
  return 9;
}

// Attribute Overview table: cost to increase an attribute equals its new
// score. Mirrors attributePointCost.
export function attributePointCost(currentScore: number): number {
  return currentScore + 1;
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
