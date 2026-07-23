const { calculateTokenReward } = require('../src/utils/tokenReward')
const difficultyTables = require('../data/difficulty-tables.json')

function results(successFlags) {
  return successFlags.map((success) => ({ success }))
}

describe('calculateTokenReward', () => {
  test('full success ratio: tokens = tokenBase * 1.5, rounded', () => {
    expect(calculateTokenReward(10, results([true, true]), 2)).toBe(15) // 10 * 1.5
  })

  test('zero success ratio: tokens = tokenBase * 0.5, rounded', () => {
    expect(calculateTokenReward(10, results([false, false]), 2)).toBe(5) // 10 * 0.5
  })

  test('mixed ratio', () => {
    // 20 * (0.5 + 2/4) = 20 * 1.0 = 20
    expect(calculateTokenReward(20, results([true, true, false, false]), 4)).toBe(20)
  })

  test('rounding behavior: rounds to nearest integer rather than truncating', () => {
    // 20 * (0.5 + 1/3) = 20 * 0.8333... = 16.66... -> rounds to 17, not truncated to 16
    expect(calculateTokenReward(20, results([true, false, false]), 3)).toBe(17)
  })

  test('unreached events (never pushed into eventResults) count toward totalEvents but not successes', () => {
    // Only 1 of 3 events was ever reached/recorded (e.g. FORCED_DEPARTURE cut
    // the mission short); totalEvents still reflects the template's full length.
    // 30 * (0.5 + 1/3) = 25
    expect(calculateTokenReward(30, results([true]), 3)).toBe(25)
  })

  test('totalEvents === 0 guard: returns 0 rather than dividing by zero', () => {
    expect(calculateTokenReward(10, [], 0)).toBe(0)
  })

  test('per-difficulty base values match difficulty-tables.json', () => {
    expect(difficultyTables.ROUTINE.tokenBase).toBe(10)
    expect(difficultyTables.STANDARD.tokenBase).toBe(15)
    expect(difficultyTables.HARD.tokenBase).toBe(20)
    expect(difficultyTables.PERILOUS.tokenBase).toBe(30)
    expect(difficultyTables.EPIC.tokenBase).toBe(40)
  })
})
