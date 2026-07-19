'use strict';

/**
 * Computes the token payout for a completed mission:
 *
 *   tokens = round(tokenBase * (0.5 + successes / totalEvents))
 *
 * `totalEvents` is the mission template's fixed event count
 * (template.events.length), not eventResults.length — unreached events
 * (e.g. after a FORCED_DEPARTURE cuts the mission short) are simply never
 * pushed into eventResults, so they count toward totalEvents but not
 * successes, naturally treating them as failures-by-omission.
 *
 * Callers are expected to gate this on the mission having succeeded
 * (`!failed`) — this function itself doesn't know about failure, it just
 * scores whatever eventResults it's given.
 *
 * Defensive only: totalEvents is always >= 2 in real data (the smallest
 * difficulty, ROUTINE, has an eventCount of 2), so this guard should never
 * actually trigger — it exists so the function doesn't divide by zero if it
 * ever does.
 */
function calculateTokenReward(tokenBase, eventResults, totalEvents) {
  if (totalEvents === 0) return 0;

  const successes = eventResults.filter(r => r.success).length;
  return Math.round(tokenBase * (0.5 + successes / totalEvents));
}

module.exports = { calculateTokenReward };
