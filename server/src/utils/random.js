'use strict';

// All randomness in the game funnels through `rng()` below. By default it
// calls the real, global Math.random() (looked up dynamically on every call,
// not captured by reference — this keeps it compatible with tests that do
// `jest.spyOn(Math, 'random')`). Tests can call setSeed() to swap in a
// deterministic generator instead, so mission generation, planet stats, etc.
// are reproducible run-to-run, then call resetSeed() to go back to real
// randomness.
let seededRng = null;

function rng() {
  return seededRng ? seededRng() : Math.random();
}

/**
 * Deterministic PRNG (mulberry32). Cheap, dependency-free, good enough
 * statistical quality for gameplay content generation and tests.
 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Switches to a deterministic seeded RNG. Same seed -> same sequence every time. */
function setSeed(seed) {
  seededRng = mulberry32(seed);
}

/** Restores the default, non-deterministic RNG (real Math.random). */
function resetSeed() {
  seededRng = null;
}

/**
 * Returns a brand-new, independent seeded generator function (same
 * mulberry32 algorithm as setSeed(), but not tied to the shared module
 * state above). Use this when something needs its own private
 * deterministic sequence — e.g. a planet name derived purely from that
 * planet's system+position — without disturbing or being disturbed by
 * the shared rng() stream used for mission/candidate generation.
 */
function createSeededRng(seed) {
  return mulberry32(seed);
}

function randInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickOne(array) {
  if (!array || array.length === 0) return undefined;
  return array[randInt(0, array.length - 1)];
}

/**
 * Picks `count` items from `array`. If count exceeds the array length,
 * items are re-sampled (with repetition) so callers can always get the
 * number of events a mission difficulty demands, even from a small pool.
 */
function pickN(array, count) {
  if (!array || array.length === 0) return [];
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(pickOne(array));
  }
  return result;
}

function rollWithVariance(base, variance) {
  return base + randInt(-variance, variance);
}

/**
 * Samples `count` items from `array`, guaranteeing every item appears at
 * least once before any item repeats (as long as count >= array.length).
 * Used for event-archetype selection so a mission never skips a beat
 * (e.g. "Extraction") just because random-with-replacement happened to
 * pick "Infiltration" twice in a row.
 */
function sampleWithCoverage(array, count) {
  if (!array || array.length === 0) return [];
  const shuffled = [...array].sort(() => rng() - 0.5);
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(shuffled[i % shuffled.length]);
  }
  return result;
}

/**
 * Samples one value from a normal (Gaussian) distribution via the
 * Box-Muller transform. Two independent rng() draws in, one
 * normally-distributed float out.
 */
function randGaussian(mean, stdDev) {
  let u = 0;
  // rng() is [0, 1); Box-Muller needs u in (0, 1] to avoid log(0).
  // v has no such restriction: v = 0 is a valid angle (cos(0) = 1).
  while (u === 0) u = rng();
  const v = rng();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Rolls a normally-distributed integer centered on `mean`, clamped to
 * [min, max] and rounded to the nearest whole number. Values near the
 * mean are common; values near the edges of the range are rare but not
 * impossible. Used for planet stats so, e.g., a habitability roll
 * centered on 4 mostly lands on 3-5 while an occasional 0 still shows up.
 */
function randGaussianInt(mean, min, max, stdDev = 1.3) {
  const raw = randGaussian(mean, stdDev);
  return Math.min(max, Math.max(min, Math.round(raw)));
}

module.exports = {
  randInt, pickOne, pickN, rollWithVariance, sampleWithCoverage, randGaussian, randGaussianInt,
  setSeed, resetSeed, createSeededRng,
};
