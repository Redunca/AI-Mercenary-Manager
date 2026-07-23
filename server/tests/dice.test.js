const { rollDie, rollDice, rollAction, rollInRange } = require('../src/services/dice.service')

describe('Dice Service', () => {
  test('rollDie returns a number between 1 and sides', () => {
    const result = rollDie(20)

    expect(result).toBeGreaterThanOrEqual(1)
    expect(result).toBeLessThanOrEqual(20)
  })

  test('rollDie can be mocked for deterministic tests', () => {
    jest.spyOn(global.Math, 'random').mockReturnValue(0.5)

    const result = rollDie(20)
    expect(result).toBe(11) // Math.floor(0.5 * 20) + 1

    jest.restoreAllMocks()
  })

  test('rollInRange returns a number within the specified range', () => {
    for (let i = 0; i < 100; i++) {
      const result = rollInRange(5, 15)
      expect(result).toBeGreaterThanOrEqual(5)
      expect(result).toBeLessThanOrEqual(15)
    }
  })
})

describe('rollDice', () => {
  test('returns no bonus dice for a score of 0', () => {
    const result = rollDice(0)
    expect(result).toEqual({ sum: 0, notation: '—' })
  })

  test.each([
    [1, 1, 4],
    [2, 1, 6],
    [3, 1, 8],
    [4, 1, 10],
    [5, 2, 6],
    [6, 2, 8],
    [7, 2, 10],
    [8, 3, 8],
    [9, 3, 10],
    [10, 4, 8],
  ])('score %i rolls %id%i and stays within bounds', (score, count, sides) => {
    const result = rollDice(score)
    expect(result.notation).toBe(`${count}d${sides}`)
    expect(result.sum).toBeGreaterThanOrEqual(count)
    expect(result.sum).toBeLessThanOrEqual(count * sides)
  })

  test('clamps scores above 10 to the score-10 table entry', () => {
    const result = rollDice(15)
    expect(result.notation).toBe('4d8')
  })

  test('clamps negative scores to the score-0 table entry', () => {
    const result = rollDice(-3)
    expect(result).toEqual({ sum: 0, notation: '—' })
  })
})

describe('rollAction', () => {
  test('combines a d20 roll with the score bonus dice', () => {
    jest
      .spyOn(global.Math, 'random')
      .mockReturnValueOnce(0.5) // d20 -> 11
      .mockReturnValueOnce(0.5) // 1d4 -> 3 (score 1)

    const result = rollAction(1)

    expect(result.d20).toBe(11)
    expect(result.bonus).toBe(3)
    expect(result.diceNotation).toBe('1d4')
    expect(result.total).toBe(14)

    jest.restoreAllMocks()
  })

  test('total is always d20 plus the bonus dice sum', () => {
    for (let i = 0; i < 50; i++) {
      const score = Math.floor(Math.random() * 12) - 1
      const result = rollAction(score)
      expect(result.total).toBe(result.d20 + result.bonus)
      expect(result.d20).toBeGreaterThanOrEqual(1)
      expect(result.d20).toBeLessThanOrEqual(20)
    }
  })

  test('a score of 0 yields no bonus', () => {
    const result = rollAction(0)
    expect(result.bonus).toBe(0)
    expect(result.diceNotation).toBe('—')
  })
})

describe('advantage', () => {
  test('rollDice with advantage 1 rolls one extra die and drops the lowest', () => {
    const rolls = [1, 2, 6] // score 5 -> base 2d6, +1 for advantage 1 -> 3d6, rolled in this order
    let i = 0
    jest.spyOn(global.Math, 'random').mockImplementation(() => (rolls[i++] - 1) / 6)

    const result = rollDice(5, 1)

    expect(result.notation).toBe('3d6 drop lowest 1')
    expect(result.sum).toBe(2 + 6) // sorted [1,2,6], drops the lowest (1), keeps the rest
  })

  test('rollDice with advantage 0 behaves exactly like a normal roll', () => {
    jest.spyOn(global.Math, 'random').mockReturnValue(0.5)
    expect(rollDice(5, 0)).toEqual(rollDice(5))
  })

  test('a score of 0 with advantage rerolls the d20 and keeps the higher result', () => {
    jest
      .spyOn(global.Math, 'random')
      .mockReturnValueOnce(0.5) // d20 -> 11
      .mockReturnValueOnce(0.9) // d20 -> 19, kept

    const result = rollAction(0, 1)

    expect(result.d20).toBe(19)
    expect(result.bonus).toBe(0)
    expect(result.total).toBe(19)
  })

  test('rollDice with advantage 2 rolls two extra dice and drops the two lowest', () => {
    const rolls = [2, 6, 4] // score 4 -> base 1d10, +2 for advantage 2 -> 3d10, rolled in this order
    let i = 0
    jest.spyOn(global.Math, 'random').mockImplementation(() => (rolls[i++] - 1) / 10)

    const result = rollDice(4, 2)

    expect(result.notation).toBe('3d10 drop lowest 2')
    expect(result.sum).toBe(6) // sorted [2,4,6], drop the two lowest, keep the highest
  })
})
