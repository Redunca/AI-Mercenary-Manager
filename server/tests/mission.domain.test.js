const {
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
} = require('../src/domain/mission')

const MINUTE_MS = 60_000

describe('travelSegmentMs', () => {
  test("at speed 100, is 2x this tier's fixed per-event duration", () => {
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
  test("is unaffected by ship speed and is eventCount x this tier's fixed per-event duration", () => {
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
    expect(dueEventCount(travelMs + eventsMs + 999_999, travelMs, eventsMs, eventCount)).toBe(
      eventCount,
    )
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
    expect(phaseAndProgressFromElapsed(0, travelMs, eventsMs)).toEqual({
      phase: 'EN_ROUTE',
      progress: 0,
    })
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
    expect(phaseAndProgressFromElapsed(totalMs, travelMs, eventsMs)).toEqual({
      phase: 'COMPLETED',
      progress: 100,
    })
    expect(phaseAndProgressFromElapsed(totalMs * 10, travelMs, eventsMs)).toEqual({
      phase: 'COMPLETED',
      progress: 100,
    })
  })

  test('a shorter travel leg (speed boost) reaches EVENT sooner in absolute time', () => {
    const boostedTravelMs = travelSegmentMs(difficulty, 200) // double speed
    const atOldTravelMs = phaseAndProgressFromElapsed(travelMs, boostedTravelMs, eventsMs)
    expect(atOldTravelMs.phase).toBe('EVENT') // would still be EN_ROUTE without the boost
  })

  test('a shorter travel leg does not shrink the event segment duration', () => {
    const boostedTravelMs = travelSegmentMs(difficulty, 200)
    const justBeforeEventsEnd = phaseAndProgressFromElapsed(
      boostedTravelMs + eventsMs - 1,
      boostedTravelMs,
      eventsMs,
    )
    expect(justBeforeEventsEnd.phase).toBe('EVENT')
  })
})

describe('missionOutcome', () => {
  test('FAILURE when failed, regardless of the other flags', () => {
    expect(missionOutcome({ failed: true, rewardForfeited: false, anyDeath: false })).toBe(
      'FAILURE',
    )
    expect(missionOutcome({ failed: true, rewardForfeited: true, anyDeath: true })).toBe('FAILURE')
  })

  test('SUCCESS when not failed, reward intact, and no deaths', () => {
    expect(missionOutcome({ failed: false, rewardForfeited: false, anyDeath: false })).toBe(
      'SUCCESS',
    )
  })

  test('PARTIAL SUCCESS when not failed but the reward was forfeited', () => {
    expect(missionOutcome({ failed: false, rewardForfeited: true, anyDeath: false })).toBe(
      'PARTIAL SUCCESS',
    )
  })

  test('PARTIAL SUCCESS when not failed and reward intact, but a crew death occurred', () => {
    expect(missionOutcome({ failed: false, rewardForfeited: false, anyDeath: true })).toBe(
      'PARTIAL SUCCESS',
    )
  })
})

describe('estimatedMissionDurationMs', () => {
  test('at the default (baseline) speed, equals travel*2 + events', () => {
    const difficulty = 'STANDARD'
    const eventCount = 3
    const expected =
      travelSegmentMs(difficulty, 100) * 2 + eventsSegmentMs(difficulty, eventCount)
    expect(estimatedMissionDurationMs(difficulty, eventCount)).toBe(expected)
  })

  test('honors an explicit ship speed', () => {
    const difficulty = 'HARD'
    const eventCount = 2
    const expected =
      travelSegmentMs(difficulty, 200) * 2 + eventsSegmentMs(difficulty, eventCount)
    expect(estimatedMissionDurationMs(difficulty, eventCount, 200)).toBe(expected)
  })
})

describe('missionHasCombat', () => {
  test('true when any event is COMBAT', () => {
    expect(missionHasCombat([{ type: 'RECON', attribute: 'perception' }, { type: 'COMBAT' }])).toBe(
      true,
    )
  })

  test('false when no event is COMBAT', () => {
    expect(
      missionHasCombat([
        { type: 'RECON', attribute: 'perception' },
        { type: 'BREACH', attribute: 'learning' },
      ]),
    ).toBe(false)
  })

  test('false for a mission with no events', () => {
    expect(missionHasCombat([])).toBe(false)
  })
})

describe('missionSkillChecks', () => {
  test('collects each event attribute once, in first-appearance order', () => {
    expect(
      missionSkillChecks([
        { type: 'RECON', attribute: 'perception' },
        { type: 'ENGINEERING', attribute: 'logic' },
        { type: 'RECON', attribute: 'perception' },
      ]),
    ).toEqual(['perception', 'logic'])
  })

  test('excludes COMBAT events -- their attribute is archetype flavor, never a real check', () => {
    expect(
      missionSkillChecks([
        { type: 'COMBAT', attribute: 'agility' },
        { type: 'BREACH', attribute: 'learning' },
      ]),
    ).toEqual(['learning'])
  })

  test('is empty for a COMBAT-only mission', () => {
    expect(missionSkillChecks([{ type: 'COMBAT', attribute: 'might' }])).toEqual([])
  })

  test('excludes REFLECTION events -- they always succeed, never a real check', () => {
    expect(
      missionSkillChecks([
        { type: 'REFLECTION', attribute: 'learning' },
        { type: 'BREACH', attribute: 'logic' },
      ]),
    ).toEqual(['logic'])
  })
})

describe('missionPreCommitmentSummary', () => {
  test('bundles hasCombat, skillChecks, and estimatedDurationMs', () => {
    const difficulty = 'STANDARD'
    const events = [
      { type: 'RECON', attribute: 'perception' },
      { type: 'COMBAT', attribute: 'agility' },
    ]
    expect(missionPreCommitmentSummary(difficulty, events)).toEqual({
      hasCombat: true,
      skillChecks: ['perception'],
      estimatedDurationMs: estimatedMissionDurationMs(difficulty, events.length),
    })
  })
})
