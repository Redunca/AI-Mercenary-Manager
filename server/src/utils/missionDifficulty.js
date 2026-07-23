'use strict'

const { pickWeighted } = require('./random')

/**
 * Default mission-difficulty distribution: easier missions are far more
 * common than harder ones. Weights are relative (they don't need to sum to
 * 100) and are normalized by pickWeighted().
 */
const DIFFICULTY_WEIGHTS = {
  ROUTINE: 40,
  STANDARD: 30,
  HARD: 15,
  PERILOUS: 10,
  EPIC: 5,
}

/**
 * Picks a mission difficulty, weighted toward easier difficulties by
 * default. Pass a custom `weights` map (same shape as DIFFICULTY_WEIGHTS)
 * to override the distribution, e.g. for tests.
 */
function pickWeightedDifficulty(weights = DIFFICULTY_WEIGHTS) {
  const items = Object.entries(weights).map(([difficulty, weight]) => ({
    value: difficulty,
    weight,
  }))
  return pickWeighted(items)
}

module.exports = { DIFFICULTY_WEIGHTS, pickWeightedDifficulty }
