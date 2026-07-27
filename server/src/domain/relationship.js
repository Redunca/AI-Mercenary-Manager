// A pairwise recruit relationship is a single running score in [MIN_SCORE,
// MAX_SCORE] (see relationship.service.js), bucketed into a tier that drives
// banter selection, mission-log flavor, and the reroll perks at the
// extremes (BONDED grants a friend's reroll on a failed test, RIVAL forces
// a reroll of a successful one -- see resolveEvents in game.service.js).

const MIN_SCORE = -100
const MAX_SCORE = 100

const TIERS = ['RIVAL', 'TENSE', 'NEUTRAL', 'FRIENDLY', 'BONDED']

function clampScore(score) {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score))
}

function relationshipTier(score) {
  if (score <= -60) return 'RIVAL'
  if (score <= -20) return 'TENSE'
  if (score < 20) return 'NEUTRAL'
  if (score < 60) return 'FRIENDLY'
  return 'BONDED'
}

// recruit.id is always a string (see domain/recruit.js's rowToRecruit) --
// coerced to Number here so callers never have to remember, and so pair
// ordering isn't a lexicographic string comparison (which would put "10"
// before "9"). Returns [min, max], the recruit_relationships storage order.
function orderPair(idA, idB) {
  const a = Number(idA)
  const b = Number(idB)
  return a <= b ? [a, b] : [b, a]
}

const MISSION_OUTCOME_DELTA = { success: 4, failure: -4 }
const TRAIT_FRICTION_DELTA = -2

// A symmetric numeric weight per unordered personality pair -- unlike
// banter's hand-authored, asymmetric personality-pairs.json (where {A} and
// {B} say different lines), compatibility is a single value regardless of
// which recruit is which, so each pair only needs one entry here. Loosely
// justified by that same file's tone: Explorer+Explorer's shared mischief
// reads as bonding, Sentinel+Sentinel's command rivalry as friction, the
// rest as mild professional friction or neutral. Tunable defaults, not
// load-bearing design.
const PERSONALITY_COMPATIBILITY = {
  'Analyst+Analyst': 0,
  'Analyst+Diplomat': 1,
  'Analyst+Explorer': -1,
  'Analyst+Sentinel': 0,
  'Diplomat+Diplomat': 0,
  'Diplomat+Explorer': 0,
  'Diplomat+Sentinel': -1,
  'Explorer+Explorer': 2,
  'Explorer+Sentinel': -1,
  'Sentinel+Sentinel': -2,
}

function personalityCompatibility(personalityA, personalityB) {
  if (!personalityA || !personalityB) return 0
  const [a, b] = [personalityA, personalityB].sort()
  return PERSONALITY_COMPATIBILITY[`${a}+${b}`] ?? 0
}

// Single formula for a shared-mission relationship delta, applied once per
// crew pair when a mission completes (see completeMission in
// game.service.js) -- kept here, pure and unit-testable, rather than inlined.
function computeMissionDelta({ success, personalityA, personalityB, traitFriction }) {
  return (
    (success ? MISSION_OUTCOME_DELTA.success : MISSION_OUTCOME_DELTA.failure) +
    personalityCompatibility(personalityA, personalityB) +
    (traitFriction ? TRAIT_FRICTION_DELTA : 0)
  )
}

module.exports = {
  MIN_SCORE,
  MAX_SCORE,
  TIERS,
  clampScore,
  relationshipTier,
  orderPair,
  personalityCompatibility,
  computeMissionDelta,
  MISSION_OUTCOME_DELTA,
  TRAIT_FRICTION_DELTA,
}
