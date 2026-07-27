// Player standing with a faction/corporation is a single running score in
// [MIN_SCORE, MAX_SCORE], bucketed into a tier that drives the mission
// reward multiplier below and narrative log lines (see faction.service.js).
// Orgs are identified by name (the entity-names.json "faction"/"corporation"
// categories) -- they're never DB rows of their own, same as today.

const MIN_SCORE = -100
const MAX_SCORE = 100

const TIERS = ['HOSTILE', 'UNFRIENDLY', 'NEUTRAL', 'FRIENDLY', 'ALLIED']

function clampScore(score) {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score))
}

function reputationTier(score) {
  if (score <= -60) return 'HOSTILE'
  if (score <= -20) return 'UNFRIENDLY'
  if (score < 20) return 'NEUTRAL'
  if (score < 60) return 'FRIENDLY'
  return 'ALLIED'
}

// Mission credit reward is scaled by this much based on standing with the
// org the mission is done "for" (see completeMission in game.service.js).
const REWARD_MULTIPLIER = {
  HOSTILE: -0.25,
  UNFRIENDLY: -0.12,
  NEUTRAL: 0,
  FRIENDLY: 0.12,
  ALLIED: 0.25,
}

function rewardMultiplier(score) {
  return REWARD_MULTIPLIER[reputationTier(score)]
}

// Asymmetric per-mission drift: doing a job "for" an org nudges standing a
// little either way; doing one "against" an org only ever costs standing --
// succeeding hurts them more than a failed attempt does.
const FOR_MISSION_DELTA = { success: 3, failure: -2 }
const AGAINST_MISSION_DELTA = { success: -5, failure: -2 }

function computeMissionRepDelta({ role, success }) {
  const table = role === 'against' ? AGAINST_MISSION_DELTA : FOR_MISSION_DELTA
  return success ? table.success : table.failure
}

module.exports = {
  MIN_SCORE,
  MAX_SCORE,
  TIERS,
  clampScore,
  reputationTier,
  REWARD_MULTIPLIER,
  rewardMultiplier,
  FOR_MISSION_DELTA,
  AGAINST_MISSION_DELTA,
  computeMissionRepDelta,
}
