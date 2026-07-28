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

// Baseline speed assumed for a pre-commitment duration estimate, before any
// ship is assigned -- matches travelSegmentMs's own default param and the
// starter ship's speed (domain/ship.js), i.e. "no speed boost/penalty".
const BASELINE_SHIP_SPEED = 100

function estimatedMissionDurationMs(difficulty, eventCount, shipSpeed = BASELINE_SHIP_SPEED) {
  return travelSegmentMs(difficulty, shipSpeed) * 2 + eventsSegmentMs(difficulty, eventCount)
}

function missionHasCombat(events) {
  return events.some((e) => e.type === 'COMBAT')
}

// Attributes a mission will actually exercise as discrete skill checks, in
// first-appearance order, deduped. COMBAT events are excluded: their
// `attribute` is archetype flavor never consulted by resolveEvents' combat
// branch (game.service.js resolves COMBAT via bestCombatStat instead), so
// it isn't a real check to warn the player about.
function missionSkillChecks(events) {
  const seen = new Set()
  const result = []
  for (const e of events) {
    if (e.type === 'COMBAT' || seen.has(e.attribute)) continue
    seen.add(e.attribute)
    result.push(e.attribute)
  }
  return result
}

// Bundled pre-commitment summary for the two call sites in game.service.js
// that map a mission_templates row to client shape.
function missionPreCommitmentSummary(difficulty, events) {
  return {
    hasCombat: missionHasCombat(events),
    skillChecks: missionSkillChecks(events),
    estimatedDurationMs: estimatedMissionDurationMs(difficulty, events.length),
  }
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

// Single source of truth for a completed mission's 3-way verdict, shared by
// the completion summary and the final capstone log line (see completeMission
// and buildPhaseLogs in game.service.js/log.service.js) so they never
// disagree. PARTIAL SUCCESS covers both "the reward got forfeited along the
// way" (the only case this used to track, as "NO REWARD") and "a crew member
// died," even if the mission otherwise fully succeeded (e.g. won a COMBAT
// event but lost someone in the fight) -- death is worth flagging in the
// mission's own verdict, not just in banter/logs elsewhere.
function missionOutcome({ failed, rewardForfeited, anyDeath }) {
  if (failed) return 'FAILURE'
  if (rewardForfeited || anyDeath) return 'PARTIAL SUCCESS'
  return 'SUCCESS'
}

module.exports = {
  DIFFICULTY_VALUES,
  travelSegmentMs,
  eventsSegmentMs,
  dueEventCount,
  phaseAndProgressFromElapsed,
  missionOutcome,
  estimatedMissionDurationMs,
  missionHasCombat,
  missionSkillChecks,
  missionPreCommitmentSummary,
}
