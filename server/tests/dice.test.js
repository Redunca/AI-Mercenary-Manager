const {
  rollDie,
  rollDice,
  rollAction,
  rollInRange,
  explodeFrom,
  rollExploding,
} = require('../src/services/dice.service')

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
    // No upper bound: dice explode on their max face (see 'exploding dice'
    // below), so the sum is only bounded below by the die count.
    expect(result.sum).toBeGreaterThanOrEqual(count)
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
      // No upper bound on d20: it explodes on a natural max roll too.
      expect(result.d20).toBeGreaterThanOrEqual(1)
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
    const rolls = [1, 2, 5] // score 5 -> base 2d6, +1 for advantage 1 -> 3d6, rolled in this order
    let i = 0
    jest.spyOn(global.Math, 'random').mockImplementation(() => (rolls[i++] - 1) / 6)

    const result = rollDice(5, 1)

    expect(result.notation).toBe('3d6 drop lowest 1')
    expect(result.sum).toBe(2 + 5) // sorted [1,2,5], drops the lowest (1), keeps the rest (none at max, no explosion)
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

describe('disadvantage', () => {
  test('rollDice with disadvantage 1 rolls one extra die and drops the highest', () => {
    const rolls = [1, 2, 6] // score 5 -> base 2d6, +1 extra for disadvantage 1 -> 3d6
    let i = 0
    jest.spyOn(global.Math, 'random').mockImplementation(() => (rolls[i++] - 1) / 6)

    const result = rollDice(5, -1)

    expect(result.notation).toBe('3d6 drop highest 1')
    expect(result.sum).toBe(1 + 2) // sorted [1,2,6], drops the highest (6), keeps the rest
  })

  test('rollDice with disadvantage 2 rolls two extra dice and drops the two highest', () => {
    const rolls = [2, 6, 4] // score 4 -> base 1d10, +2 extra for disadvantage 2 -> 3d10
    let i = 0
    jest.spyOn(global.Math, 'random').mockImplementation(() => (rolls[i++] - 1) / 10)

    const result = rollDice(4, -2)

    expect(result.notation).toBe('3d10 drop highest 2')
    expect(result.sum).toBe(2) // sorted [2,4,6], drops the two highest, keeps the lowest
  })

  test('a score of 0 with disadvantage rerolls the d20 and keeps the lower result', () => {
    jest
      .spyOn(global.Math, 'random')
      .mockReturnValueOnce(0.5) // d20 -> 11, kept
      .mockReturnValueOnce(0.9) // d20 -> 19

    const result = rollAction(0, -1)

    expect(result.d20).toBe(11)
    expect(result.bonus).toBe(0)
    expect(result.total).toBe(11)
  })
})

describe('exploding dice', () => {
  test('explodeFrom returns the value unchanged when it is not at max', () => {
    expect(explodeFrom(3, 6)).toBe(3)
  })

  test('explodeFrom rerolls and adds when given a max value, chaining while it keeps rolling max', () => {
    jest
      .spyOn(global.Math, 'random')
      .mockReturnValueOnce(0.99) // reroll -> 6 (max again, chain continues)
      .mockReturnValueOnce(0.4) // reroll -> 3 (not max, stops)

    expect(explodeFrom(6, 6)).toBe(6 + 6 + 3)

    jest.restoreAllMocks()
  })

  test('rollExploding rolls once then explodes on a max face', () => {
    jest
      .spyOn(global.Math, 'random')
      .mockReturnValueOnce(0.99) // initial roll -> 6 (max)
      .mockReturnValueOnce(0.0) // reroll -> 1 (stops)

    expect(rollExploding(6)).toBe(7)

    jest.restoreAllMocks()
  })

  test('rollDice: a kept max-face die explodes and adds to the sum', () => {
    const rolls = [2, 6, 3] // score 5 -> base 2d6, +1 extra for advantage 1 -> 3d6
    const queue = [...rolls, 4] // 4th value is the reroll triggered by the kept 6
    let i = 0
    jest.spyOn(global.Math, 'random').mockImplementation(() => (queue[i++] - 1) / 6)

    const result = rollDice(5, 1)

    expect(result.notation).toBe('3d6 drop lowest 1')
    // sorted [2,3,6] drops the lowest (2), keeps [3,6]; the kept 6 explodes into +4
    expect(result.sum).toBe(3 + 6 + 4)

    jest.restoreAllMocks()
  })

  test('rollDice: a dropped max-face die does not explode', () => {
    const rolls = [2, 6, 3] // score 5 -> base 2d6, +1 extra for disadvantage 1 -> 3d6
    let i = 0
    jest.spyOn(global.Math, 'random').mockImplementation(() => {
      if (i >= rolls.length) throw new Error('dropped die should not trigger another roll')
      return (rolls[i++] - 1) / 6
    })

    const result = rollDice(5, -1)

    expect(result.notation).toBe('3d6 drop highest 1')
    // sorted [2,3,6] drops the highest (6, at max) before explosion can apply
    expect(result.sum).toBe(2 + 3)

    jest.restoreAllMocks()
  })

  test('rollAction explodes the d20 on a natural max roll', () => {
    jest
      .spyOn(global.Math, 'random')
      .mockReturnValueOnce(0.999) // d20 -> 20 (max)
      .mockReturnValueOnce(0.25) // d20 reroll -> 6 (stops)
      .mockReturnValueOnce(0.5) // bonus die, score 1 -> 1d4 -> 3

    const result = rollAction(1)

    expect(result.d20).toBe(26) // 20 + 6
    expect(result.bonus).toBe(3)
    expect(result.total).toBe(29)

    jest.restoreAllMocks()
  })

  test('the score-0 advantage/disadvantage fallback explodes each of its two d20s independently', () => {
    jest
      .spyOn(global.Math, 'random')
      .mockReturnValueOnce(0.999) // first d20 -> 20 (max), explodes
      .mockReturnValueOnce(0.0) // first d20 reroll -> 1 (stops) -> first total 21
      .mockReturnValueOnce(0.5) // second d20 -> 11, no explosion

    const result = rollAction(0, 1) // advantage -> keep the higher

    expect(result.d20).toBe(21)
    expect(result.total).toBe(21)

    jest.restoreAllMocks()
  })
})
