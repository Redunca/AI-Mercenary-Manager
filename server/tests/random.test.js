const {
  randGaussian,
  randGaussianInt,
  pickWeighted,
  setSeed,
  resetSeed,
} = require('../src/utils/random')

describe('randGaussian', () => {
  test('returns exactly the mean when Box-Muller angle cancels out (v = 0.25)', () => {
    // z = sqrt(-2 ln u) * cos(2*pi*v); cos(2*pi*0.25) = cos(pi/2) = 0,
    // so the result collapses to `mean` regardless of u.
    jest.spyOn(global.Math, 'random').mockReturnValueOnce(0.7).mockReturnValueOnce(0.25)

    expect(randGaussian(10, 2)).toBeCloseTo(10, 10)

    jest.restoreAllMocks()
  })

  test('re-rolls if Math.random ever returns exactly 0, to avoid log(0)', () => {
    jest
      .spyOn(global.Math, 'random')
      .mockReturnValueOnce(0) // rejected for u
      .mockReturnValueOnce(0.5) // accepted for u
      .mockReturnValueOnce(0.25) // accepted for v (cancels the angle)

    expect(randGaussian(5, 1)).toBeCloseTo(5, 10)

    jest.restoreAllMocks()
  })
})

describe('randGaussianInt', () => {
  test('clamps to max when the roll lands far above the range', () => {
    // v = 0 -> cos(0) = 1 (largest possible positive swing); u tiny -> huge sqrt(-2 ln u)
    jest.spyOn(global.Math, 'random').mockReturnValueOnce(0.0001).mockReturnValueOnce(0)

    expect(randGaussianInt(4, 0, 5, 1.3)).toBe(5)

    jest.restoreAllMocks()
  })

  test('clamps to min when the roll lands far below the range', () => {
    // v = 0.5 -> cos(pi) = -1 (largest possible negative swing)
    jest.spyOn(global.Math, 'random').mockReturnValueOnce(0.0001).mockReturnValueOnce(0.5)

    expect(randGaussianInt(4, 0, 5, 1.3)).toBe(0)

    jest.restoreAllMocks()
  })

  test('rounds to the nearest integer', () => {
    jest.spyOn(global.Math, 'random').mockReturnValueOnce(0.7).mockReturnValueOnce(0.25)

    expect(randGaussianInt(3.6, 0, 5, 1)).toBe(4)

    jest.restoreAllMocks()
  })

  test('never leaves [min, max] across many random rolls', () => {
    for (let i = 0; i < 500; i++) {
      const result = randGaussianInt(4, 0, 5, 1.3)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(5)
      expect(Number.isInteger(result)).toBe(true)
    }
  })

  test('clusters around the mean rather than being flat-uniform', () => {
    const samples = Array.from({ length: 2000 }, () => randGaussianInt(4, 0, 5, 1.3))
    const average = samples.reduce((sum, n) => sum + n, 0) / samples.length
    // Loose bounds: a real bell curve centered on 4 should average close to
    // 4 even after clamping; a uniform 0-5 roll would average close to 2.5.
    expect(average).toBeGreaterThan(3.3)
    expect(average).toBeLessThanOrEqual(5)
  })
})

describe('pickWeighted', () => {
  afterEach(() => {
    resetSeed()
  })

  test('returns undefined for an empty or missing list', () => {
    expect(pickWeighted([])).toBeUndefined()
    expect(pickWeighted(undefined)).toBeUndefined()
  })

  test('returns undefined when every weight is zero (or the total is non-positive)', () => {
    expect(
      pickWeighted([
        { value: 'A', weight: 0 },
        { value: 'B', weight: 0 },
      ]),
    ).toBeUndefined()
  })

  test('always returns the only item when it is the only one with positive weight', () => {
    const items = [
      { value: 'A', weight: 0 },
      { value: 'B', weight: 5 },
      { value: 'C', weight: 0 },
    ]
    for (let i = 0; i < 50; i++) {
      expect(pickWeighted(items)).toBe('B')
    }
  })

  test('respects roll boundaries: a roll just under a weight boundary picks that item, just at/over it picks the next', () => {
    // weights A=30, B=70 (total 100). rng() * 100 = roll.
    const items = [
      { value: 'A', weight: 30 },
      { value: 'B', weight: 70 },
    ]

    jest.spyOn(global.Math, 'random').mockReturnValueOnce(0.2999) // roll ~29.99 -> A
    expect(pickWeighted(items)).toBe('A')
    jest.restoreAllMocks()

    jest.spyOn(global.Math, 'random').mockReturnValueOnce(0.3) // roll = 30 -> B (not < 30)
    expect(pickWeighted(items)).toBe('B')
    jest.restoreAllMocks()
  })

  test('over a large sample, lands within a reasonable tolerance of the configured weights', () => {
    setSeed(42)
    const items = [
      { value: 'ROUTINE', weight: 40 },
      { value: 'STANDARD', weight: 30 },
      { value: 'HARD', weight: 15 },
      { value: 'PERILOUS', weight: 10 },
      { value: 'EPIC', weight: 5 },
    ]
    const counts = { ROUTINE: 0, STANDARD: 0, HARD: 0, PERILOUS: 0, EPIC: 0 }
    const sampleSize = 20000
    for (let i = 0; i < sampleSize; i++) {
      counts[pickWeighted(items)]++
    }

    // Loose tolerance (+/- 2 percentage points) — this is testing statistical
    // shape, not pinning an exact seeded sequence.
    expect(counts.ROUTINE / sampleSize).toBeCloseTo(0.4, 1)
    expect(counts.STANDARD / sampleSize).toBeCloseTo(0.3, 1)
    expect(counts.HARD / sampleSize).toBeCloseTo(0.15, 1)
    expect(counts.PERILOUS / sampleSize).toBeCloseTo(0.1, 1)
    expect(counts.EPIC / sampleSize).toBeCloseTo(0.05, 1)
  })
})
