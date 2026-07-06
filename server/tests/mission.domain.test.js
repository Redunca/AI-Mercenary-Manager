const { DURATION_PER_EVENT_MS, phaseFromProgress, progressFromElapsed } = require('../src/domain/mission')

describe('phaseFromProgress', () => {
  test.each([
    [0, 'EN_ROUTE'],
    [33, 'EN_ROUTE'],
    [34, 'EVENEMENT'],
    [66, 'EVENEMENT'],
    [67, 'RETOUR'],
    [99, 'RETOUR'],
    [100, 'TERMINEE'],
  ])('progress %i maps to phase %s', (progress, expected) => {
    expect(phaseFromProgress(progress)).toBe(expected)
  })
})

describe('progressFromElapsed', () => {
  test('returns 100 when there are no events', () => {
    expect(progressFromElapsed(0, 5000)).toBe(100)
  })

  test('returns 0 at the start of a mission', () => {
    expect(progressFromElapsed(2, 0)).toBe(0)
  })

  test('returns 50 halfway through the mission duration', () => {
    const eventCount = 2
    const halfway = (eventCount * DURATION_PER_EVENT_MS) / 2
    expect(progressFromElapsed(eventCount, halfway)).toBe(50)
  })

  test('caps progress at 100 once elapsed time exceeds the duration', () => {
    const eventCount = 2
    const durationMs = eventCount * DURATION_PER_EVENT_MS
    expect(progressFromElapsed(eventCount, durationMs * 3)).toBe(100)
  })
})
