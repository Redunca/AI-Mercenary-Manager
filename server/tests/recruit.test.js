const fs = require('fs');
const path = require('path')
const { rollInRange } = require('../src/services/dice.service')
const { generateCandidate, computeMaxHp } = require('../src/domain/recruit')

const DATA_DIR = path.join(__dirname, '../data')
function loadJson(name) {
  const filePath = path.join(DATA_DIR, name)
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  }
  const fallback = path.join(__dirname, '../../../mercenai/src/app/data', name)
  return JSON.parse(fs.readFileSync(fallback, 'utf8'))
}

describe('Recruit Domain', () => {
  test('creates a recruit with default stats', () => {
    const perksflaws = loadJson('perks-flaws.json');
    const r = generateCandidate(1, perksflaws, rollInRange);
    
    expect(r.name).toBeDefined();
    expect(r.attributes).toBeDefined();
    expect(r.hp).toBeDefined();
  });

  test('computes max HP correctly', () => {
    const attributes = { fortitude: 3, presence: 2, will: 1 };
    const maxHp = computeMaxHp(attributes);

    expect(maxHp).toBe(2 * (3 + 2 + 1) + 10);
    expect(maxHp).toBe(22);
  });

  test('recruit has all required fields', () => {
    const perksflaws = loadJson('perks-flaws.json');
    const r = generateCandidate(1, perksflaws, rollInRange);

    expect(r.id).toBeDefined();
    expect(r.name).toBeDefined();
    expect(r.jobTitle).toBeDefined();
    expect(r.archetype).toBeDefined();
    expect(r.personality).toBeDefined();
  });
});