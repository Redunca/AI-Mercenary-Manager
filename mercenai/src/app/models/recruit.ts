export type RecruitStatus = 'available' | 'in_mission' | 'dead';

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
  status: RecruitStatus;
  perks?: { name: string; description: string }[];
  flaws?: { name: string; description: string }[];
}
