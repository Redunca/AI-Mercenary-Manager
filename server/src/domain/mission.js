const { calculateEffectiveTravelTime } = require('./ship')

const DURATION_PER_EVENT_MS = 15_000

// A mission is EN_ROUTE, then EVENT, then RETURN. At the default ship speed
// (100) all three take the same base share of the total duration, matching
// the original fixed E*15s/3 split. Ship speed (and temporary speed-boost
// items) only shortens the two travel legs; the EVENT segment is a fixed
// resolution window and never scales with speed.
function segmentBaseMs(eventCount) {
  return (eventCount * DURATION_PER_EVENT_MS) / 3
}

function travelSegmentMs(eventCount, shipSpeed = 100) {
  return Math.max(1, calculateEffectiveTravelTime(segmentBaseMs(eventCount), shipSpeed))
}

function eventsSegmentMs(eventCount) {
  return Math.round(segmentBaseMs(eventCount))
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
  DURATION_PER_EVENT_MS,
  travelSegmentMs,
  eventsSegmentMs,
  phaseAndProgressFromElapsed,
}
