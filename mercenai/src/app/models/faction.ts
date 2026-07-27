// Mirrors server/src/domain/faction.js's TIERS, in ascending order.
export type FactionTier = 'HOSTILE' | 'UNFRIENDLY' | 'NEUTRAL' | 'FRIENDLY' | 'ALLIED';

export interface FactionReputation {
  name: string;
  score: number;
  tier: FactionTier;
}

// Mirrors server/src/domain/faction.js's REWARD_MULTIPLIER — how much a
// mission's credit reward is scaled by standing with the org it's done for.
export const FACTION_REWARD_MULTIPLIER: Record<FactionTier, number> = {
  HOSTILE: -0.25,
  UNFRIENDLY: -0.12,
  NEUTRAL: 0,
  FRIENDLY: 0.12,
  ALLIED: 0.25,
};
