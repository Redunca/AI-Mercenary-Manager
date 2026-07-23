const fs = require('fs')
const path = require('path')
const TagContext = require('../src/engine/context')
const {
  generatePlanet,
  generateSystemId,
  generateHabitability,
  generatePopulation,
  generateTechnology,
  temperatureTagForPosition,
  habitabilityTag,
  populationTag,
  technologyTag,
  buildIdentifier,
  buildDisplayName,
  qualifiesForNickname,
  MAX_SYSTEM_POSITION,
} = require('../src/engine/planetGenerator')

const DATA_DIR = path.join(__dirname, '../data')
function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'))
}

// A tiny, self-contained fixture so most tests don't depend on game content.
const FIXTURE_PLANETS = [
  {
    id: 'fixture_desert_hot',
    tags: ['desert', 'hot'],
    provides: { climate: 'scorching' },
    approachTemplates: ['approach {planetName}'],
    aftermathTemplates: ['leaving {planetName}'],
  },
  {
    id: 'fixture_desert_cold',
    tags: ['desert', 'cold'],
    provides: { climate: 'freezing' },
    approachTemplates: ['approach {planetName}'],
    aftermathTemplates: ['leaving {planetName}'],
  },
]
const FIXTURE_ENTITY_NAMES = {
  categories: {},
}

function mockRandomSequence(...values) {
  const spy = jest.spyOn(global.Math, 'random')
  values.forEach((v) => spy.mockReturnValueOnce(v))
  return spy
}

// Forces the next randGaussianInt() roll to clamp to its max bound
// (u tiny -> huge magnitude, v = 0 -> cos = +1 -> positive swing).
const ROLL_MAX = [0.0001, 0]
// Forces the next randGaussianInt() roll to clamp to its min bound
// (v = 0.5 -> cos = -1 -> negative swing).
const ROLL_MIN = [0.0001, 0.5]

describe('descriptive tag lookups', () => {
  test.each([
    [0, 'barren'],
    [1, 'hostile'],
    [2, 'marginal'],
    [3, 'habitable'],
    [4, 'lush'],
    [5, 'thriving'],
  ])('habitability %i -> %s', (level, tag) => {
    expect(habitabilityTag(level)).toBe(tag)
  })

  test.each([
    [0, 'uninhabited'],
    [1, 'outpost'],
    [2, 'settled'],
    [3, 'populous'],
    [4, 'crowded'],
    [5, 'overpopulated'],
  ])('population %i -> %s', (level, tag) => {
    expect(populationTag(level)).toBe(tag)
  })

  test.each([
    [1, 'primitive'],
    [2, 'industrial'],
    [3, 'developed'],
    [4, 'spacefaring'],
    [5, 'advanced'],
  ])('technology %i -> %s', (level, tag) => {
    expect(technologyTag(level)).toBe(tag)
  })

  test('technology 0 has no tag (covered by "uninhabited" instead)', () => {
    expect(technologyTag(0)).toBeNull()
  })
})

describe('temperatureTagForPosition', () => {
  test.each([
    [1, 'hot'],
    [2, 'hot'],
    [3, null],
    [4, 'cold'],
    [5, 'cold'],
    [8, 'cold'],
  ])('position %i -> %s', (position, expected) => {
    expect(temperatureTagForPosition(position)).toBe(expected)
  })
})

describe('generateSystemId', () => {
  test('is one uppercase letter followed by 6 digits', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateSystemId()).toMatch(/^[A-Z]\d{6}$/)
    }
  })
})

describe('buildIdentifier / buildDisplayName', () => {
  test('identifier joins systemId and position with a dash', () => {
    expect(buildIdentifier('W466875', 2)).toBe('W466875-2')
  })

  test('display name is the identifier alone when there is no nickname', () => {
    expect(buildDisplayName('W466875-2', null)).toBe('W466875-2')
  })

  test('display name appends the quoted nickname when present', () => {
    expect(buildDisplayName('W466875-2', 'Earth')).toBe('W466875-2 "Earth"')
  })
})

describe('qualifiesForNickname', () => {
  test.each([
    [4, 4, true],
    [5, 5, true],
    [3, 5, false], // population not strictly above 3
    [5, 3, false], // technology not strictly above 3
    [0, 0, false],
    [3, 3, false],
  ])('population %i, technology %i -> %s', (population, technology, expected) => {
    expect(qualifiesForNickname(population, technology)).toBe(expected)
  })
})

describe('generateHabitability', () => {
  test('clamps to 5 on an extreme-high roll', () => {
    mockRandomSequence(...ROLL_MAX)
    expect(generateHabitability()).toBe(5)
    jest.restoreAllMocks()
  })

  test('clamps to 0 on an extreme-low roll', () => {
    mockRandomSequence(...ROLL_MIN)
    expect(generateHabitability()).toBe(0)
    jest.restoreAllMocks()
  })

  test('always stays within [0, 5] across many rolls', () => {
    for (let i = 0; i < 500; i++) {
      const h = generateHabitability()
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(5)
    }
  })
})

describe('generatePopulation', () => {
  test('never exceeds the given habitability, even on an extreme-high roll', () => {
    mockRandomSequence(...ROLL_MAX)
    expect(generatePopulation(2)).toBe(2)
    jest.restoreAllMocks()
  })

  test('clamps to 0 on an extreme-low roll regardless of habitability', () => {
    mockRandomSequence(...ROLL_MIN)
    expect(generatePopulation(5)).toBe(0)
    jest.restoreAllMocks()
  })

  test('is always between 0 and habitability across many rolls, for every habitability value', () => {
    for (let habitability = 0; habitability <= 5; habitability++) {
      for (let i = 0; i < 200; i++) {
        const population = generatePopulation(habitability)
        expect(population).toBeGreaterThanOrEqual(0)
        expect(population).toBeLessThanOrEqual(habitability)
      }
    }
  })
})

describe('generateTechnology', () => {
  test('is always 0 when population is 0', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTechnology(0)).toBe(0)
    }
  })

  test('is never 0 when population is above 0', () => {
    for (let population = 1; population <= 5; population++) {
      for (let i = 0; i < 200; i++) {
        expect(generateTechnology(population)).toBeGreaterThanOrEqual(1)
      }
    }
  })

  test('can reach 5 (very advanced) even for a population of 1 (small research outpost)', () => {
    mockRandomSequence(...ROLL_MAX)
    expect(generateTechnology(1)).toBe(5)
    jest.restoreAllMocks()
  })

  test('stays within [0, 5] across many rolls', () => {
    for (let population = 0; population <= 5; population++) {
      for (let i = 0; i < 200; i++) {
        const technology = generateTechnology(population)
        expect(technology).toBeGreaterThanOrEqual(0)
        expect(technology).toBeLessThanOrEqual(5)
      }
    }
  })
})

describe('generatePlanet', () => {
  test('produces a "SystemId-Position" identifier and no nickname when stats are low', () => {
    mockRandomSequence(
      ...ROLL_MIN, // habitability -> 0
      ...ROLL_MIN, // population -> 0 (clamped by habitability anyway)
      // technology: population is 0, so generateTechnology short-circuits
      // to 0 without consuming any Math.random calls.
    ).mockReturnValue(0.5) // fallback for template pickOne calls

    const context = new TagContext()
    const planet = generatePlanet(FIXTURE_PLANETS, FIXTURE_ENTITY_NAMES, context, {
      systemId: 'W466875',
      position: 2,
    })

    expect(planet.habitability).toBe(0)
    expect(planet.population).toBe(0)
    expect(planet.technology).toBe(0)
    expect(planet.identifier).toBe('W466875-2')
    expect(planet.nickname).toBeNull()
    expect(planet.name).toBe('W466875-2')
    expect(context.get('planetName')).toBe('W466875-2')
    expect(context.get('planetIdentifier')).toBe('W466875-2')
    expect(context.get('planetNickname')).toBeNull()

    jest.restoreAllMocks()
  })

  test('produces a deterministic, sound-based nickname once population and technology both exceed 3', () => {
    mockRandomSequence(
      ...ROLL_MAX, // habitability -> 5
      ...ROLL_MAX, // population -> 5
      ...ROLL_MAX, // technology -> 5
    ).mockReturnValue(0.5) // fallback for template pickOne calls

    const context = new TagContext()
    const planet = generatePlanet(FIXTURE_PLANETS, FIXTURE_ENTITY_NAMES, context, {
      systemId: 'W466875',
      position: 2,
    })

    expect(planet.population).toBe(5)
    expect(planet.technology).toBe(5)
    expect(planet.identifier).toBe('W466875-2')
    // Nicknames no longer come from a fixed list — they're procedurally
    // built from sound syllables, deterministically seeded by
    // systemId+position (see planetNameGenerator.test.js for generator-level
    // coverage). This asserts the exact string generatePlanet wires through,
    // not just "some string".
    expect(planet.nickname).toBe('Moragmora')
    expect(planet.name).toBe('W466875-2 "Moragmora"')
    expect(context.get('planetName')).toBe('W466875-2 "Moragmora"')
    expect(context.get('planetNickname')).toBe('Moragmora')

    jest.restoreAllMocks()
  })

  test('merges habitability/population/technology descriptor tags into the returned tags', () => {
    mockRandomSequence(...ROLL_MIN, ...ROLL_MIN).mockReturnValue(0.5)

    const context = new TagContext()
    const planet = generatePlanet(FIXTURE_PLANETS, FIXTURE_ENTITY_NAMES, context, {
      systemId: 'W466875',
      position: 3, // temperate: no hot/cold tag
    })

    expect(planet.tags).toEqual(expect.arrayContaining(['barren', 'uninhabited']))

    jest.restoreAllMocks()
  })

  test('a hot position (1-2) prefers a "hot"-tagged template over a same-tag "cold" one', () => {
    const context = new TagContext()
    const planet = generatePlanet(FIXTURE_PLANETS, FIXTURE_ENTITY_NAMES, context, {
      tags: ['desert'],
      systemId: 'W466875',
      position: 1,
    })

    expect(planet.id).toBe('fixture_desert_hot')
  })

  test('a cold position (4+) prefers a "cold"-tagged template over a same-tag "hot" one', () => {
    const context = new TagContext()
    const planet = generatePlanet(FIXTURE_PLANETS, FIXTURE_ENTITY_NAMES, context, {
      tags: ['desert'],
      systemId: 'W466875',
      position: 5,
    })

    expect(planet.id).toBe('fixture_desert_cold')
  })

  test('the caller-requested tags are never diluted by unrelated stat/position tags', () => {
    // Neither fixture template matches a "jungle" request, so the original
    // "fall back to the whole pool" behaviour must still apply, regardless
    // of what habitability/population/technology/position rolled.
    const context = new TagContext()
    const planet = generatePlanet(FIXTURE_PLANETS, FIXTURE_ENTITY_NAMES, context, {
      tags: ['jungle'],
      systemId: 'W466875',
      position: 1,
    })

    expect(['fixture_desert_hot', 'fixture_desert_cold']).toContain(planet.id)
  })

  test('defaults position to within [1, MAX_SYSTEM_POSITION] and systemId to the standard format when omitted', () => {
    const context = new TagContext()
    const planet = generatePlanet(FIXTURE_PLANETS, FIXTURE_ENTITY_NAMES, context)

    expect(planet.position).toBeGreaterThanOrEqual(1)
    expect(planet.position).toBeLessThanOrEqual(MAX_SYSTEM_POSITION)
    expect(planet.systemId).toMatch(/^[A-Z]\d{6}$/)
    expect(planet.identifier).toBe(`${planet.systemId}-${planet.position}`)
  })

  test('still publishes the template\'s "provides" fields into the context, unchanged', () => {
    const context = new TagContext()
    generatePlanet(FIXTURE_PLANETS, FIXTURE_ENTITY_NAMES, context, {
      tags: ['desert'],
      position: 1,
    })

    expect(context.get('climate')).toBe('scorching')
  })
})

describe('generatePlanet against the real game data', () => {
  const entityNames = loadJson('entity-names.json')
  const planets = loadJson('planets.json')

  test('every generated planet respects all invariants, across many rolls', () => {
    for (let i = 0; i < 300; i++) {
      const context = new TagContext()
      const planet = generatePlanet(planets, entityNames, context)

      expect(planet.habitability).toBeGreaterThanOrEqual(0)
      expect(planet.habitability).toBeLessThanOrEqual(5)

      expect(planet.population).toBeGreaterThanOrEqual(0)
      expect(planet.population).toBeLessThanOrEqual(planet.habitability)

      expect(planet.technology).toBeGreaterThanOrEqual(0)
      expect(planet.technology).toBeLessThanOrEqual(5)
      expect(planet.population === 0).toBe(planet.technology === 0)

      expect(planet.identifier).toMatch(/^[A-Z]\d{6}-[1-8]$/)
      expect(planet.name.startsWith(planet.identifier)).toBe(true)

      if (planet.population > 3 && planet.technology > 3) {
        expect(planet.nickname).toEqual(expect.any(String))
        expect(planet.name).toBe(`${planet.identifier} "${planet.nickname}"`)
      } else {
        expect(planet.nickname).toBeNull()
        expect(planet.name).toBe(planet.identifier)
      }

      // context always has a usable planetName, whether or not a nickname exists.
      expect(context.get('planetName')).toBe(planet.name)
    }
  })
})
