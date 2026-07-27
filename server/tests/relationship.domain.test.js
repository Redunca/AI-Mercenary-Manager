const {
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
} = require('../src/domain/relationship')

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

  test('leaves the exact boundaries untouched', () => {
    expect(clampScore(MAX_SCORE)).toBe(MAX_SCORE)
    expect(clampScore(MIN_SCORE)).toBe(MIN_SCORE)
  })
})

describe('relationshipTier', () => {
  test('boundaries match TIERS order', () => {
    expect(relationshipTier(-100)).toBe('RIVAL')
    expect(relationshipTier(-61)).toBe('RIVAL')
    expect(relationshipTier(-60)).toBe('RIVAL')
    expect(relationshipTier(-59)).toBe('TENSE')
    expect(relationshipTier(-21)).toBe('TENSE')
    expect(relationshipTier(-20)).toBe('TENSE')
    expect(relationshipTier(-19)).toBe('NEUTRAL')
    expect(relationshipTier(0)).toBe('NEUTRAL')
    expect(relationshipTier(19)).toBe('NEUTRAL')
    expect(relationshipTier(20)).toBe('FRIENDLY')
    expect(relationshipTier(59)).toBe('FRIENDLY')
    expect(relationshipTier(60)).toBe('BONDED')
    expect(relationshipTier(100)).toBe('BONDED')
  })

  test('every tier is reachable and TIERS is ordered ascending', () => {
    expect(TIERS).toEqual(['RIVAL', 'TENSE', 'NEUTRAL', 'FRIENDLY', 'BONDED'])
  })
})

describe('orderPair', () => {
  test('returns [min, max] for numbers already in order', () => {
    expect(orderPair(3, 7)).toEqual([3, 7])
  })

  test('swaps numbers given in reverse order', () => {
    expect(orderPair(7, 3)).toEqual([3, 7])
  })

  test('coerces string ids to numbers (recruit.id is always a string)', () => {
    expect(orderPair('3', '7')).toEqual([3, 7])
    expect(orderPair('7', '3')).toEqual([3, 7])
  })

  // The bug this specifically guards against: a naive string comparison
  // ("10" < "9") is lexicographic and puts "10" before "9".
  test('orders double-digit ids numerically, not lexicographically', () => {
    expect(orderPair('9', '10')).toEqual([9, 10])
    expect(orderPair('10', '9')).toEqual([9, 10])
  })

  test('handles mixed string/number inputs', () => {
    expect(orderPair('10', 9)).toEqual([9, 10])
  })
})

describe('personalityCompatibility', () => {
  test('is symmetric regardless of argument order', () => {
    expect(personalityCompatibility('Analyst', 'Diplomat')).toBe(
      personalityCompatibility('Diplomat', 'Analyst'),
    )
  })

  test('returns 0 for an unknown or missing personality', () => {
    expect(personalityCompatibility(undefined, 'Explorer')).toBe(0)
    expect(personalityCompatibility('Explorer', undefined)).toBe(0)
    expect(personalityCompatibility(null, null)).toBe(0)
  })

  test('same-personality pairs use the self pair entry', () => {
    expect(personalityCompatibility('Explorer', 'Explorer')).toBe(2)
    expect(personalityCompatibility('Sentinel', 'Sentinel')).toBe(-2)
  })
})

describe('computeMissionDelta', () => {
  test('a plain success with no compatibility/friction is the base success delta', () => {
    expect(
      computeMissionDelta({
        success: true,
        personalityA: undefined,
        personalityB: undefined,
        traitFriction: false,
      }),
    ).toBe(MISSION_OUTCOME_DELTA.success)
  })

  test('a plain failure is the base failure delta', () => {
    expect(
      computeMissionDelta({
        success: false,
        personalityA: undefined,
        personalityB: undefined,
        traitFriction: false,
      }),
    ).toBe(MISSION_OUTCOME_DELTA.failure)
  })

  test('adds personality compatibility on top of the outcome delta', () => {
    expect(
      computeMissionDelta({
        success: true,
        personalityA: 'Explorer',
        personalityB: 'Explorer',
        traitFriction: false,
      }),
    ).toBe(MISSION_OUTCOME_DELTA.success + 2)
  })

  test('subtracts the trait friction delta when the pair clashes', () => {
    expect(
      computeMissionDelta({
        success: true,
        personalityA: undefined,
        personalityB: undefined,
        traitFriction: true,
      }),
    ).toBe(MISSION_OUTCOME_DELTA.success + TRAIT_FRICTION_DELTA)
  })

  test('combines all three components', () => {
    expect(
      computeMissionDelta({
        success: false,
        personalityA: 'Sentinel',
        personalityB: 'Sentinel',
        traitFriction: true,
      }),
    ).toBe(MISSION_OUTCOME_DELTA.failure + -2 + TRAIT_FRICTION_DELTA)
  })
})
