const { rollDie, rollDice, rollAction, rollInRange } = require('../src/services/dice.service');

describe('Dice Service', () => {
  test('rollDie returns a number between 1 and sides', () => {
    const result = rollDie(20);

    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(20);
  });

  test('rollDie can be mocked for deterministic tests', () => {
    jest.spyOn(global.Math, 'random').mockReturnValue(0.5);
    
    const result = rollDie(20);
    expect(result).toBe(11); // Math.floor(0.5 * 20) + 1

    jest.restoreAllMocks();
  });

  test('rollInRange returns a number within the specified range', () => {
    for (let i = 0; i < 100; i++) {
      const result = rollInRange(5, 15);
      expect(result).toBeGreaterThanOrEqual(5);
      expect(result).toBeLessThanOrEqual(15);
    }
  });
});

describe('rollDice', () => {
  test('returns no bonus dice for a score of 0', () => {
    const result = rollDice(0);
    expect(result).toEqual({ sum: 0, notation: '—' });
  });

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
    const result = rollDice(score);
    expect(result.notation).toBe(`${count}d${sides}`);
    expect(result.sum).toBeGreaterThanOrEqual(count);
    expect(result.sum).toBeLessThanOrEqual(count * sides);
  });

  test('clamps scores above 10 to the score-10 table entry', () => {
    const result = rollDice(15);
    expect(result.notation).toBe('4d8');
  });

  test('clamps negative scores to the score-0 table entry', () => {
    const result = rollDice(-3);
    expect(result).toEqual({ sum: 0, notation: '—' });
  });
});

describe('rollAction', () => {
  test('combines a d20 roll with the score bonus dice', () => {
    jest.spyOn(global.Math, 'random')
      .mockReturnValueOnce(0.5)  // d20 -> 11
      .mockReturnValueOnce(0.5); // 1d4 -> 3 (score 1)

    const result = rollAction(1);

    expect(result.d20).toBe(11);
    expect(result.bonus).toBe(3);
    expect(result.diceNotation).toBe('1d4');
    expect(result.total).toBe(14);

    jest.restoreAllMocks();
  });

  test('total is always d20 plus the bonus dice sum', () => {
    for (let i = 0; i < 50; i++) {
      const score = Math.floor(Math.random() * 12) - 1
      const result = rollAction(score);
      expect(result.total).toBe(result.d20 + result.bonus);
      expect(result.d20).toBeGreaterThanOrEqual(1);
      expect(result.d20).toBeLessThanOrEqual(20);
    }
  });

  test('a score of 0 yields no bonus', () => {
    const result = rollAction(0);
    expect(result.bonus).toBe(0);
    expect(result.diceNotation).toBe('—');
  });
});
