const {
  DURATION_PER_EVENT_MS, travelSegmentMs, eventsSegmentMs, phaseAndProgressFromElapsed,
} = require('../src/domain/mission')

describe('travelSegmentMs', () => {
  test('at speed 100, matches a third of the old fixed E*15s duration', () => {
    const eventCount = 3
    expect(travelSegmentMs(eventCount, 100)).toBe((eventCount * DURATION_PER_EVENT_MS) / 3)
  })

  test('double speed halves the travel leg', () => {
    const base = travelSegmentMs(3, 100)
    expect(travelSegmentMs(3, 200)).toBe(Math.round(base / 2))
  })

  test('half speed doubles the travel leg', () => {
    const base = travelSegmentMs(3, 100)
    expect(travelSegmentMs(3, 50)).toBe(Math.round(base * 2))
  })

  test('never rounds down to zero, even at very high speed', () => {
    expect(travelSegmentMs(1, 100_000)).toBeGreaterThanOrEqual(1)
  })
})

describe('eventsSegmentMs', () => {
  test('is unaffected by ship speed and matches a third of the old fixed duration', () => {
    const eventCount = 4
    expect(eventsSegmentMs(eventCount)).toBe((eventCount * DURATION_PER_EVENT_MS) / 3)
  })
})

describe('phaseAndProgressFromElapsed', () => {
  const eventCount = 3
  const travelMs = travelSegmentMs(eventCount, 100)
  const eventsMs = eventsSegmentMs(eventCount)

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
    const boostedTravelMs = travelSegmentMs(eventCount, 200) // double speed
    const atOldTravelMs = phaseAndProgressFromElapsed(travelMs, boostedTravelMs, eventsMs)
    expect(atOldTravelMs.phase).toBe('EVENT') // would still be EN_ROUTE without the boost
  })

  test('a shorter travel leg does not shrink the event segment duration', () => {
    const boostedTravelMs = travelSegmentMs(eventCount, 200)
    const justBeforeEventsEnd = phaseAndProgressFromElapsed(boostedTravelMs + eventsMs - 1, boostedTravelMs, eventsMs)
    expect(justBeforeEventsEnd.phase).toBe('EVENT')
  })
})
