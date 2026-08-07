const fs = require('fs')
const path = require('path')
const { rollInRange } = require('../src/services/dice.service')
const {
  generateCandidate,
  buildFullName,
  computeMaxHp,
  computeGuard,
  bestCombatStat,
  rowToCandidate,
  rowToRecruit,
  ATTRIBUTE_KEYS,
  levelForExperience,
  maxAttributeForLevel,
  attributePointCost,
} = require('../src/domain/recruit')

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
    const perksflaws = loadJson('perks-flaws.json')
    const r = generateCandidate(1, perksflaws, rollInRange)

    expect(r.name).toBeDefined()
    expect(r.attributes).toBeDefined()
    expect(r.hp).toBeDefined()
  })

  test('computes max HP correctly', () => {
    const attributes = { fortitude: 3, presence: 2, will: 1 }
    const maxHp = computeMaxHp(attributes)

    expect(maxHp).toBe(2 * (3 + 2 + 1) + 10)
    expect(maxHp).toBe(22)
  })

  test('recruit has all required fields', () => {
    const perksflaws = loadJson('perks-flaws.json')
    const r = generateCandidate(1, perksflaws, rollInRange)

    expect(r.id).toBeDefined()
    expect(r.name).toBeDefined()
    expect(r.jobTitle).toBeDefined()
    expect(r.archetype).toBeDefined()
    expect(r.personality).toBeDefined()
  })

  test('assigns every attribute key exactly once, matching the archetype table', () => {
    const perksflaws = loadJson('perks-flaws.json')
    const r = generateCandidate(1, perksflaws, rollInRange)

    expect(Object.keys(r.attributes).sort()).toEqual([...ATTRIBUTE_KEYS].sort())
  })

  test('hp starts equal to maxHp', () => {
    const perksflaws = loadJson('perks-flaws.json')
    const r = generateCandidate(1, perksflaws, rollInRange)

    expect(r.hp).toBe(r.maxHp)
  })

  test('picks at most 2 unique perks and 2 unique flaws', () => {
    const perksflaws = loadJson('perks-flaws.json')
    const r = generateCandidate(1, perksflaws, rollInRange)

    expect(r.perks.length).toBeLessThanOrEqual(2)
    expect(r.flaws.length).toBeLessThanOrEqual(2)
    expect(new Set(r.perks.map((p) => p.name)).size).toBe(r.perks.length)
    expect(new Set(r.flaws.map((f) => f.name)).size).toBe(r.flaws.length)
  })
})

describe('buildFullName', () => {
  // Always picks the first element of whichever array it's asked to roll
  // against, so the resulting name is fully deterministic: first name
  // "Kade", surname "Sorenson", codename "Reaper", letter "A".
  const firstIndex = () => 0

  test('jack-of-all-trades is "{first} {last}"', () => {
    expect(buildFullName('jack-of-all-trades', firstIndex)).toBe('Kade Sorenson')
  })

  test('well-rounded is "{first} {letter}. {last}"', () => {
    expect(buildFullName('well-rounded', firstIndex)).toBe('Kade A. Sorenson')
  })

  test('specialized is \'{first} "{codename}" {last}\'', () => {
    expect(buildFullName('specialized', firstIndex)).toBe('Kade "Reaper" Sorenson')
  })
})

describe('rowToCandidate', () => {
  test('maps a database row to the candidate shape', () => {
    const row = {
      id: 3,
      name: 'Vex',
      job_title: 'Assassin',
      archetype: 'specialized',
      personality: 'Sentinel',
      attributes: { fortitude: 3 },
      hp: 20,
      max_hp: 22,
      perks: [{ name: 'Lucky' }],
      flaws: [],
    }

    expect(rowToCandidate(row)).toEqual({
      id: '3',
      name: 'Vex',
      jobTitle: 'Assassin',
      archetype: 'specialized',
      personality: 'Sentinel',
      attributes: { fortitude: 3 },
      hp: 20,
      maxHp: 22,
      perks: [{ name: 'Lucky' }],
      flaws: [],
      isQuestCandidate: false,
    })
  })

  test('marks a seeded row as a quest candidate', () => {
    const row = {
      id: 3,
      name: 'Vex',
      job_title: 'Assassin',
      archetype: 'specialized',
      personality: 'Sentinel',
      attributes: { fortitude: 3 },
      hp: 20,
      max_hp: 22,
      perks: [],
      flaws: [],
      seed_key: 'quest-defector',
    }

    expect(rowToCandidate(row).isQuestCandidate).toBe(true)
  })
})

describe('rowToRecruit', () => {
  test('maps a database row to the recruit shape', () => {
    const row = {
      id: 7,
      name: 'Kade',
      job_title: 'Elite Soldier',
      personality: 'Analyst',
      attributes: { might: 5 },
      hp: 10,
      max_hp: 22,
      status: 'available',
      perks: [],
      flaws: [{ name: 'Clumsy' }],
    }

    expect(rowToRecruit(row)).toEqual({
      id: '7',
      name: 'Kade',
      jobTitle: 'Elite Soldier',
      personality: 'Analyst',
      attributes: { might: 5 },
      hp: 10,
      maxHp: 22,
      originalMaxHp: 22,
      status: 'available',
      perks: [],
      flaws: [{ name: 'Clumsy' }],
      experience: 0,
      attributePoints: 0,
    })
  })

  test('defaults jobTitle to undefined when absent', () => {
    const row = {
      id: 8,
      name: 'Nash',
      job_title: null,
      personality: 'Diplomat',
      attributes: {},
      hp: 1,
      max_hp: 1,
      status: 'dead',
      perks: [],
      flaws: [],
    }

    expect(rowToRecruit(row).jobTitle).toBeUndefined()
  })
})

describe('computeGuard', () => {
  test('is 10 + Might + Agility', () => {
    expect(computeGuard({ might: 3, agility: 5 })).toBe(18)
  })

  test('treats a missing attribute as 0', () => {
    expect(computeGuard({ might: 4 })).toBe(14)
  })

  test('defaults the armor bonus to 0 when omitted', () => {
    expect(computeGuard({ might: 3, agility: 5 })).toBe(computeGuard({ might: 3, agility: 5 }, 0))
  })

  test('adds an explicit armor bonus on top of the base Guard', () => {
    expect(computeGuard({ might: 3, agility: 5 }, 2)).toBe(20)
  })
})

describe('bestCombatStat', () => {
  test('picks Agility when it is strictly higher than Might', () => {
    expect(bestCombatStat({ might: 2, agility: 5 })).toEqual({ attribute: 'agility', score: 5 })
  })

  test('picks Might when it is strictly higher than Agility', () => {
    expect(bestCombatStat({ might: 6, agility: 3 })).toEqual({ attribute: 'might', score: 6 })
  })

  test('breaks ties in favor of Might', () => {
    expect(bestCombatStat({ might: 4, agility: 4 })).toEqual({ attribute: 'might', score: 4 })
  })
})

describe('levelForExperience', () => {
  test('level 1 at 0 XP, advancing every 3 XP per the Player Character Level Advancement table', () => {
    expect(levelForExperience(0)).toBe(1)
    expect(levelForExperience(2)).toBe(1)
    expect(levelForExperience(3)).toBe(2)
    expect(levelForExperience(6)).toBe(3)
    expect(levelForExperience(27)).toBe(10)
    expect(levelForExperience(30)).toBe(11) // beyond the table -- the rules say to continue the progression
  })
})

describe('maxAttributeForLevel', () => {
  test('follows the tiered Maximum Attribute Score column, every 2 levels', () => {
    expect(maxAttributeForLevel(1)).toBe(5)
    expect(maxAttributeForLevel(2)).toBe(5)
    expect(maxAttributeForLevel(3)).toBe(6)
    expect(maxAttributeForLevel(4)).toBe(6)
    expect(maxAttributeForLevel(5)).toBe(7)
    expect(maxAttributeForLevel(6)).toBe(7)
    expect(maxAttributeForLevel(7)).toBe(8)
    expect(maxAttributeForLevel(8)).toBe(8)
    expect(maxAttributeForLevel(9)).toBe(9)
    expect(maxAttributeForLevel(10)).toBe(9)
  })

  test('never exceeds 9 beyond level 10 -- a score of 10 is never purchasable with attribute points', () => {
    expect(maxAttributeForLevel(15)).toBe(9)
    expect(maxAttributeForLevel(100)).toBe(9)
  })
})

describe('attributePointCost', () => {
  test('costs the new score, per the Attribute Overview table', () => {
    expect(attributePointCost(0)).toBe(1)
    expect(attributePointCost(3)).toBe(4)
    expect(attributePointCost(8)).toBe(9)
  })
})
