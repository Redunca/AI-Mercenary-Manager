export type RecruitStatus = 'available' | 'in_mission' | 'dead';

export type AttributeKey =
  | 'agility' | 'fortitude' | 'might'
  | 'learning' | 'logic' | 'perception' | 'will'
  | 'deception' | 'persuasion' | 'presence';

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

export interface Recruit {
  id: string;
  name: string;
  attributes: RecruitAttributes;
  hp: number;
  maxHp: number;
  status: RecruitStatus;
}

export function computeMaxHp(a: RecruitAttributes): number {
  return 2 * (a.fortitude + a.presence + a.will) + 10;
}
