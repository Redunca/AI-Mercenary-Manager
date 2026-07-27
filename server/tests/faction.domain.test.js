const {
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
} = require('../src/domain/faction')

describe('clampScore', () => {
  test('leaves an in-range score untouched', () => {
    expect(clampScore(0)).toBe(0)
    expect(clampScore(42)).toBe(42)
    expect(clampScore(-42)).toBe(-42)
  })

  test('clamps above MAX_SCORE', () => {
    expect(clampScore(MAX_SCORE + 50)).toBe(MAX_SCORE)
  })

  test('clamps below MIN_SCORE', () => {
    expect(clampScore(MIN_SCORE - 50)).toBe(MIN_SCORE)
  })
})

describe('reputationTier', () => {
  test('boundaries match TIERS order', () => {
    expect(reputationTier(-100)).toBe('HOSTILE')
    expect(reputationTier(-60)).toBe('HOSTILE')
    expect(reputationTier(-59)).toBe('UNFRIENDLY')
    expect(reputationTier(-20)).toBe('UNFRIENDLY')
    expect(reputationTier(-19)).toBe('NEUTRAL')
    expect(reputationTier(0)).toBe('NEUTRAL')
    expect(reputationTier(19)).toBe('NEUTRAL')
    expect(reputationTier(20)).toBe('FRIENDLY')
    expect(reputationTier(59)).toBe('FRIENDLY')
    expect(reputationTier(60)).toBe('ALLIED')
    expect(reputationTier(100)).toBe('ALLIED')
  })

  test('TIERS is ordered ascending', () => {
    expect(TIERS).toEqual(['HOSTILE', 'UNFRIENDLY', 'NEUTRAL', 'FRIENDLY', 'ALLIED'])
  })
})

describe('rewardMultiplier', () => {
  test('matches REWARD_MULTIPLIER for each tier', () => {
    expect(rewardMultiplier(-100)).toBe(REWARD_MULTIPLIER.HOSTILE)
    expect(rewardMultiplier(-30)).toBe(REWARD_MULTIPLIER.UNFRIENDLY)
    expect(rewardMultiplier(0)).toBe(REWARD_MULTIPLIER.NEUTRAL)
    expect(rewardMultiplier(30)).toBe(REWARD_MULTIPLIER.FRIENDLY)
    expect(rewardMultiplier(100)).toBe(REWARD_MULTIPLIER.ALLIED)
  })

  test('spans -25%..+25%', () => {
    expect(rewardMultiplier(MIN_SCORE)).toBe(-0.25)
    expect(rewardMultiplier(MAX_SCORE)).toBe(0.25)
  })
})

describe('computeMissionRepDelta', () => {
  test('"for" role uses FOR_MISSION_DELTA', () => {
    expect(computeMissionRepDelta({ role: 'for', success: true })).toBe(FOR_MISSION_DELTA.success)
    expect(computeMissionRepDelta({ role: 'for', success: false })).toBe(FOR_MISSION_DELTA.failure)
  })

  test('"against" role uses AGAINST_MISSION_DELTA', () => {
    expect(computeMissionRepDelta({ role: 'against', success: true })).toBe(
      AGAINST_MISSION_DELTA.success,
    )
    expect(computeMissionRepDelta({ role: 'against', success: false })).toBe(
      AGAINST_MISSION_DELTA.failure,
    )
  })

  test('"against" only ever costs standing, even on failure', () => {
    expect(AGAINST_MISSION_DELTA.success).toBeLessThan(0)
    expect(AGAINST_MISSION_DELTA.failure).toBeLessThan(0)
  })
})
