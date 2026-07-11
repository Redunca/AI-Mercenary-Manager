'use strict';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(shuffled[i % shuffled.length]);
  }
  return result;
}

/**
 * Samples one value from a normal (Gaussian) distribution via the
 * Box-Muller transform. Two independent Math.random() draws in, one
 * normally-distributed float out.
 */
function randGaussian(mean, stdDev) {
  let u = 0;
  // Math.random() is [0, 1); Box-Muller needs u in (0, 1] to avoid log(0).
  // v has no such restriction: v = 0 is a valid angle (cos(0) = 1).
  while (u === 0) u = Math.random();
  const v = Math.random();
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

module.exports = { randInt, pickOne, pickN, rollWithVariance, sampleWithCoverage, randGaussian, randGaussianInt };
