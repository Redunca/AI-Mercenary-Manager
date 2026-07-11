const { randGaussian, randGaussianInt } = require('../src/utils/random');

describe('randGaussian', () => {
  test('returns exactly the mean when Box-Muller angle cancels out (v = 0.25)', () => {
    // z = sqrt(-2 ln u) * cos(2*pi*v); cos(2*pi*0.25) = cos(pi/2) = 0,
    // so the result collapses to `mean` regardless of u.
    jest.spyOn(global.Math, 'random').mockReturnValueOnce(0.7).mockReturnValueOnce(0.25);

    expect(randGaussian(10, 2)).toBeCloseTo(10, 10);

    jest.restoreAllMocks();
  });

  test('re-rolls if Math.random ever returns exactly 0, to avoid log(0)', () => {
    jest.spyOn(global.Math, 'random')
      .mockReturnValueOnce(0) // rejected for u
      .mockReturnValueOnce(0.5) // accepted for u
      .mockReturnValueOnce(0.25); // accepted for v (cancels the angle)

    expect(randGaussian(5, 1)).toBeCloseTo(5, 10);

    jest.restoreAllMocks();
  });
});

describe('randGaussianInt', () => {
  test('clamps to max when the roll lands far above the range', () => {
    // v = 0 -> cos(0) = 1 (largest possible positive swing); u tiny -> huge sqrt(-2 ln u)
    jest.spyOn(global.Math, 'random').mockReturnValueOnce(0.0001).mockReturnValueOnce(0);

    expect(randGaussianInt(4, 0, 5, 1.3)).toBe(5);

    jest.restoreAllMocks();
  });

  test('clamps to min when the roll lands far below the range', () => {
    // v = 0.5 -> cos(pi) = -1 (largest possible negative swing)
    jest.spyOn(global.Math, 'random').mockReturnValueOnce(0.0001).mockReturnValueOnce(0.5);

    expect(randGaussianInt(4, 0, 5, 1.3)).toBe(0);

    jest.restoreAllMocks();
  });

  test('rounds to the nearest integer', () => {
    jest.spyOn(global.Math, 'random').mockReturnValueOnce(0.7).mockReturnValueOnce(0.25);

    expect(randGaussianInt(3.6, 0, 5, 1)).toBe(4);

    jest.restoreAllMocks();
  });

  test('never leaves [min, max] across many random rolls', () => {
    for (let i = 0; i < 500; i++) {
      const result = randGaussianInt(4, 0, 5, 1.3);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(5);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  test('clusters around the mean rather than being flat-uniform', () => {
    const samples = Array.from({ length: 2000 }, () => randGaussianInt(4, 0, 5, 1.3));
    const average = samples.reduce((sum, n) => sum + n, 0) / samples.length;
    // Loose bounds: a real bell curve centered on 4 should average close to
    // 4 even after clamping; a uniform 0-5 roll would average close to 2.5.
    expect(average).toBeGreaterThan(3.3);
    expect(average).toBeLessThanOrEqual(5);
  });
});
