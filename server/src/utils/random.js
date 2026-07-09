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

module.exports = { randInt, pickOne, pickN, rollWithVariance, sampleWithCoverage };
