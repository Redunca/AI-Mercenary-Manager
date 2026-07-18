const { setSeed, resetSeed } = require('../src/utils/random');
const { DIFFICULTY_WEIGHTS, pickWeightedDifficulty } = require('../src/utils/missionDifficulty');

describe('pickWeightedDifficulty', () => {
  afterEach(() => {
    resetSeed();
  });

  test('always returns one of the 5 known difficulties', () => {
    setSeed(7);
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      seen.add(pickWeightedDifficulty());
    }
    for (const difficulty of seen) {
      expect(Object.keys(DIFFICULTY_WEIGHTS)).toContain(difficulty);
    }
  });

  test('default weights are ROUTINE 40 / STANDARD 30 / HARD 15 / PERILOUS 10 / EPIC 5', () => {
    expect(DIFFICULTY_WEIGHTS).toEqual({
      ROUTINE: 40,
      STANDARD: 30,
      HARD: 15,
      PERILOUS: 10,
      EPIC: 5,
    });
  });

  test('over a large sample, the default distribution lands within a reasonable tolerance of the configured weights', () => {
    setSeed(2024);
    const counts = { ROUTINE: 0, STANDARD: 0, HARD: 0, PERILOUS: 0, EPIC: 0 };
    const sampleSize = 20000;
    for (let i = 0; i < sampleSize; i++) {
      counts[pickWeightedDifficulty()]++;
    }

    expect(counts.ROUTINE / sampleSize).toBeCloseTo(0.40, 1);
    expect(counts.STANDARD / sampleSize).toBeCloseTo(0.30, 1);
    expect(counts.HARD / sampleSize).toBeCloseTo(0.15, 1);
    expect(counts.PERILOUS / sampleSize).toBeCloseTo(0.10, 1);
    expect(counts.EPIC / sampleSize).toBeCloseTo(0.05, 1);
  });

  test('a custom weights map overrides the default distribution (e.g. an all-EPIC override)', () => {
    setSeed(1);
    const allEpic = { ROUTINE: 0, STANDARD: 0, HARD: 0, PERILOUS: 0, EPIC: 1 };
    for (let i = 0; i < 100; i++) {
      expect(pickWeightedDifficulty(allEpic)).toBe('EPIC');
    }
  });

  test('a two-way custom split roughly respects its own ratio, independent of the default weights', () => {
    setSeed(99);
    const evenSplit = { ROUTINE: 1, EPIC: 1 };
    const counts = { ROUTINE: 0, EPIC: 0 };
    const sampleSize = 10000;
    for (let i = 0; i < sampleSize; i++) {
      counts[pickWeightedDifficulty(evenSplit)]++;
    }
    expect(counts.ROUTINE / sampleSize).toBeCloseTo(0.5, 1);
    expect(counts.EPIC / sampleSize).toBeCloseTo(0.5, 1);
  });
});
