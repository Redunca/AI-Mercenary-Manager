const fs = require('fs');
const path = require('path')
const { rollInRange } = require('../src/services/dice.service')
const { generateCandidate, computeMaxHp, rowToCandidate, rowToRecruit, ATTRIBUTE_KEYS } = require('../src/domain/recruit')

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

  test('assigns every attribute key exactly once, matching the archetype table', () => {
    const perksflaws = loadJson('perks-flaws.json');
    const r = generateCandidate(1, perksflaws, rollInRange);

    expect(Object.keys(r.attributes).sort()).toEqual([...ATTRIBUTE_KEYS].sort());
  });

  test('hp starts equal to maxHp', () => {
    const perksflaws = loadJson('perks-flaws.json');
    const r = generateCandidate(1, perksflaws, rollInRange);

    expect(r.hp).toBe(r.maxHp);
  });

  test('picks at most 2 unique perks and 2 unique flaws', () => {
    const perksflaws = loadJson('perks-flaws.json');
    const r = generateCandidate(1, perksflaws, rollInRange);

    expect(r.perks.length).toBeLessThanOrEqual(2);
    expect(r.flaws.length).toBeLessThanOrEqual(2);
    expect(new Set(r.perks.map(p => p.name)).size).toBe(r.perks.length);
    expect(new Set(r.flaws.map(f => f.name)).size).toBe(r.flaws.length);
  });
});

describe('rowToCandidate', () => {
  test('maps a database row to the candidate shape', () => {
    const row = {
      id: 3, name: 'Vex', job_title: 'Assassin', archetype: 'specialized',
      personality: 'Sentinel', attributes: { fortitude: 3 }, hp: 20, max_hp: 22,
      perks: [{ name: 'Lucky' }], flaws: [],
    };

    expect(rowToCandidate(row)).toEqual({
      id: '3', name: 'Vex', jobTitle: 'Assassin', archetype: 'specialized',
      personality: 'Sentinel', attributes: { fortitude: 3 }, hp: 20, maxHp: 22,
      perks: [{ name: 'Lucky' }], flaws: [],
    });
  });
});

describe('rowToRecruit', () => {
  test('maps a database row to the recruit shape', () => {
    const row = {
      id: 7, name: 'Kade', job_title: 'Elite Soldier', personality: 'Analyst',
      attributes: { might: 5 }, hp: 10, max_hp: 22, status: 'available',
      perks: [], flaws: [{ name: 'Clumsy' }],
    };

    expect(rowToRecruit(row)).toEqual({
      id: '7', name: 'Kade', jobTitle: 'Elite Soldier', personality: 'Analyst',
      attributes: { might: 5 }, hp: 10, maxHp: 22, status: 'available',
      perks: [], flaws: [{ name: 'Clumsy' }],
    });
  });

  test('defaults jobTitle to undefined when absent', () => {
    const row = {
      id: 8, name: 'Nash', job_title: null, personality: 'Diplomat',
      attributes: {}, hp: 1, max_hp: 1, status: 'dead', perks: [], flaws: [],
    };

    expect(rowToRecruit(row).jobTitle).toBeUndefined();
  });
});