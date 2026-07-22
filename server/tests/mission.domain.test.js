const {
  DIFFICULTY_VALUES, travelSegmentMs, eventsSegmentMs, dueEventCount, phaseAndProgressFromElapsed,
} = require('../src/domain/mission')

const MINUTE_MS = 60_000

describe('travelSegmentMs', () => {
  test('at speed 100, is 2x this tier\'s fixed per-event duration', () => {
    expect(travelSegmentMs('HARD', 100)).toBe(2 * DIFFICULTY_VALUES.HARD * MINUTE_MS)
  })

  test('double speed halves the travel leg', () => {
    const base = travelSegmentMs('HARD', 100)
    expect(travelSegmentMs('HARD', 200)).toBe(Math.round(base / 2))
  })

  test('half speed doubles the travel leg', () => {
    const base = travelSegmentMs('HARD', 100)
    expect(travelSegmentMs('HARD', 50)).toBe(Math.round(base * 2))
  })

  test('never rounds down to zero, even at very high speed', () => {
    expect(travelSegmentMs('ROUTINE', 100_000)).toBeGreaterThanOrEqual(1)
  })

  test('scales up with difficulty tier', () => {
    expect(travelSegmentMs('EPIC', 100)).toBeGreaterThan(travelSegmentMs('ROUTINE', 100))
  })
})

describe('eventsSegmentMs', () => {
  test('is unaffected by ship speed and is eventCount x this tier\'s fixed per-event duration', () => {
    expect(eventsSegmentMs('STANDARD', 4)).toBe(4 * DIFFICULTY_VALUES.STANDARD * MINUTE_MS)
  })
})

describe('dueEventCount', () => {
  const difficulty = 'STANDARD'
  const eventCount = 3
  const travelMs = travelSegmentMs(difficulty, 100)
  const eventsMs = eventsSegmentMs(difficulty, eventCount)
  const perEventMs = eventsMs / eventCount

  test('no events are due before the travel leg ends', () => {
    expect(dueEventCount(0, travelMs, eventsMs, eventCount)).toBe(0)
    expect(dueEventCount(travelMs - 1, travelMs, eventsMs, eventCount)).toBe(0)
  })

  test('one event becomes due once its own time slice elapses -- not before', () => {
    expect(dueEventCount(travelMs + perEventMs - 1, travelMs, eventsMs, eventCount)).toBe(0)
    expect(dueEventCount(travelMs + perEventMs, travelMs, eventsMs, eventCount)).toBe(1)
  })

  test('events accumulate one at a time as elapsed time crosses each slice, never in a batch', () => {
    expect(dueEventCount(travelMs + perEventMs * 2, travelMs, eventsMs, eventCount)).toBe(2)
  })

  test('is clamped to eventCount once the full events window has elapsed', () => {
    expect(dueEventCount(travelMs + eventsMs, travelMs, eventsMs, eventCount)).toBe(eventCount)
    expect(dueEventCount(travelMs + eventsMs + 999_999, travelMs, eventsMs, eventCount)).toBe(eventCount)
  })

  test('returns 0 for a zero-event mission', () => {
    expect(dueEventCount(999_999, travelMs, eventsMs, 0)).toBe(0)
  })
})

describe('phaseAndProgressFromElapsed', () => {
  const difficulty = 'STANDARD'
  const eventCount = 3
  const travelMs = travelSegmentMs(difficulty, 100)
  const eventsMs = eventsSegmentMs(difficulty, eventCount)

  test('starts EN_ROUTE at progress 0', () => {
    expect(phaseAndProgressFromElapsed(0, travelMs, eventsMs)).toEqual({ phase: 'EN_ROUTE', progress: 0 })
  })

  test('reaches EVENT once the travel leg elapses', () => {
    const result = phaseAndProgressFromElapsed(travelMs + 1, travelMs, eventsMs)
    expect(result.phase).toBe('EVENT')
  })

  test('reaches RETURN once travel + events elapse', () => {
    const result = phaseAndProgressFromElapsed(travelMs + eventsMs + 1, travelMs, eventsMs)
    expect(result.phase).toBe('RETURN')
  })

  test('completes once the full duration (travel*2 + events) has elapsed', () => {
    const totalMs = travelMs * 2 + eventsMs
    expect(phaseAndProgressFromElapsed(totalMs, travelMs, eventsMs)).toEqual({ phase: 'COMPLETED', progress: 100 })
    expect(phaseAndProgressFromElapsed(totalMs * 10, travelMs, eventsMs)).toEqual({ phase: 'COMPLETED', progress: 100 })
  })

  test('a shorter travel leg (speed boost) reaches EVENT sooner in absolute time', () => {
    const boostedTravelMs = travelSegmentMs(difficulty, 200) // double speed
    const atOldTravelMs = phaseAndProgressFromElapsed(travelMs, boostedTravelMs, eventsMs)
    expect(atOldTravelMs.phase).toBe('EVENT') // would still be EN_ROUTE without the boost
  })

  test('a shorter travel leg does not shrink the event segment duration', () => {
    const boostedTravelMs = travelSegmentMs(difficulty, 200)
    const justBeforeEventsEnd = phaseAndProgressFromElapsed(boostedTravelMs + eventsMs - 1, boostedTravelMs, eventsMs)
    expect(justBeforeEventsEnd.phase).toBe('EVENT')
  })
})
