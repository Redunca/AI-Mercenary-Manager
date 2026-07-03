const { rollDie, rollInRange } = require('../src/services/dice.service');

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
