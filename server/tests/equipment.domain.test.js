const { computeArmorGuardBonus } = require('../src/domain/equipment')

describe('computeArmorGuardBonus', () => {
  test('returns 0 when no armor is equipped', () => {
    expect(computeArmorGuardBonus({ fortitude: 5 }, null)).toBe(0)
  });

  test('returns 0 when the wearer\'s Fortitude is below the requirement', () => {
    const armor = { guardBonus: 3, requiredFortitude: 4 }
    expect(computeArmorGuardBonus({ fortitude: 3 }, armor)).toBe(0)
  });

  test('returns the full bonus when Fortitude exactly meets the requirement', () => {
    const armor = { guardBonus: 3, requiredFortitude: 4 }
    expect(computeArmorGuardBonus({ fortitude: 4 }, armor)).toBe(3)
  });

  test('returns the full bonus when Fortitude exceeds the requirement', () => {
    const armor = { guardBonus: 2, requiredFortitude: 0 }
    expect(computeArmorGuardBonus({ fortitude: 10 }, armor)).toBe(2)
  });

  test('treats a missing Fortitude attribute as 0', () => {
    const armor = { guardBonus: 1, requiredFortitude: 0 }
    expect(computeArmorGuardBonus({}, armor)).toBe(1)
  });
});
