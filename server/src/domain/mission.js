const { calculateEffectiveTravelTime } = require('./ship')

const MINUTE_MS = 60_000

// Ordinal weight per difficulty tier, used only to scale mission timing --
// nothing else in the codebase maps tiers to a number (difficulty-tables.json
// only has dcBase/eventCount/tokenBase/rewardRange).
const DIFFICULTY_VALUES = { ROUTINE: 1, STANDARD: 2, HARD: 3, PERILOUS: 4, EPIC: 5 }

// A mission is EN_ROUTE, then EVENT, then RETURN. One event's duration is
// fixed per difficulty tier and never scales with ship speed; one-way
// travel (before the speed modifier) is 2x that same per-event value, and
// the return leg takes the same time as the outbound leg.
function eventDurationMs(difficulty) {
  return DIFFICULTY_VALUES[difficulty] * MINUTE_MS
}

function travelBaseMs(difficulty) {
  return 2 * eventDurationMs(difficulty)
}

function travelSegmentMs(difficulty, shipSpeed = 100) {
  return Math.max(1, calculateEffectiveTravelTime(travelBaseMs(difficulty), shipSpeed))
}

function eventsSegmentMs(difficulty, eventCount) {
  return eventDurationMs(difficulty) * eventCount
}

// How many of a mission's events should have resolved by now, given an
// equal (fixed) time-slice per event within eventsMs -- the pacing fix: a
// mission's events are meant to trickle in one at a time as the EVENT phase
// elapses, not all resolve the instant the phase is entered. Derived from
// the same elapsedMs/travelMs/eventsMs inputs as phaseAndProgressFromElapsed
// below, so the last event is always due by the exact elapsed threshold
// where phase transitions past EVENT into RETURN -- the two can never drift
// out of sync.
function dueEventCount(elapsedMs, travelMs, eventsMs, eventCount) {
  if (eventCount === 0) return 0
  const intoEventPhase = elapsedMs - travelMs
  if (intoEventPhase <= 0) return 0
  if (intoEventPhase >= eventsMs) return eventCount
  const perEventMs = eventsMs / eventCount
  return Math.min(eventCount, Math.floor(intoEventPhase / perEventMs))
}

function phaseAndProgressFromElapsed(elapsedMs, travelMs, eventsMs) {
  const totalMs = travelMs * 2 + eventsMs
  if (totalMs <= 0 || elapsedMs >= totalMs) return { phase: 'COMPLETED', progress: 100 }

  if (elapsedMs < travelMs) {
    return { phase: 'EN_ROUTE', progress: Math.round((elapsedMs / travelMs) * 33) }
  }
  if (elapsedMs < travelMs + eventsMs) {
    return { phase: 'EVENT', progress: 33 + Math.round(((elapsedMs - travelMs) / eventsMs) * 33) }
  }
  const returnElapsed = elapsedMs - travelMs - eventsMs
  return { phase: 'RETURN', progress: 66 + Math.round((returnElapsed / travelMs) * 34) }
}

module.exports = {
  DIFFICULTY_VALUES,
  travelSegmentMs,
  eventsSegmentMs,
  dueEventCount,
  phaseAndProgressFromElapsed,
}
