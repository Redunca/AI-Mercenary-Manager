// Mirrors server/src/domain/relationship.js's TIERS, in ascending order.
export type RelationshipTier = 'RIVAL' | 'TENSE' | 'NEUTRAL' | 'FRIENDLY' | 'BONDED';

export interface Relationship {
  recruitAId: string;
  recruitBId: string;
  score: number;
  tier: RelationshipTier;
}
