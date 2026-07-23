const {
  generatePlanetName,
  paletteKeyForTags,
  PLANET_NAME_PALETTES,
} = require('../src/engine/planetNameGenerator')

describe('paletteKeyForTags', () => {
  test.each([
    [['ice', 'isolated'], 'ice'],
    [['cold'], 'ice'], // temperature-only tag still routes to the ice palette
    [['volcanic', 'mining'], 'volcanic'],
    [['hot'], 'volcanic'],
    [['ocean', 'newcolony'], 'ocean'],
    [['jungle', 'colonized'], 'jungle'],
    [['urban', 'megacity', 'corporate'], 'urban'],
    [['corporate'], 'urban'],
    [['arid', 'frontier'], 'arid'],
    [['mining', 'isolated'], 'arid'],
    [['newcolony'], 'default'], // no matching tag anywhere
    [[], 'default'],
  ])('tags %j -> %s palette', (tags, expected) => {
    expect(paletteKeyForTags(tags)).toBe(expected)
  })

  test('priority order: a tag set matching multiple palettes picks the earlier one', () => {
    // 'hot' (volcanic) is checked before 'arid' in PALETTE_TAG_PRIORITY, so a
    // planet tagged both wins volcanic, not arid.
    expect(paletteKeyForTags(['arid', 'hot'])).toBe('volcanic')
  })
})

describe('generatePlanetName', () => {
  test('is deterministic: same tags + systemId + position always produce the same name', () => {
    const a = generatePlanetName(['ice', 'cold'], 'W466875', 2)
    const b = generatePlanetName(['ice', 'cold'], 'W466875', 2)
    expect(a).toBe(b)
  })

  test('is independent of the shared/global RNG state', () => {
    // Calling generatePlanetName should not consume from (or be affected
    // by) Math.random, so results stay stable regardless of how much
    // unrelated randomness has already happened elsewhere.
    const spy = jest.spyOn(global.Math, 'random').mockReturnValue(0.123456)
    const withSpy = generatePlanetName(['ice', 'cold'], 'W466875', 2)
    spy.mockRestore()

    const withoutSpy = generatePlanetName(['ice', 'cold'], 'W466875', 2)
    expect(withSpy).toBe(withoutSpy)
  })

  test('different positions in the same system produce different names', () => {
    const names = new Set()
    for (let position = 1; position <= 8; position++) {
      names.add(generatePlanetName(['ice'], 'W466875', position))
    }
    expect(names.size).toBe(8)
  })

  test('different systems at the same position produce different names', () => {
    const names = new Set()
    for (let i = 0; i < 20; i++) {
      names.add(generatePlanetName(['ice'], `SYS${i}`, 1))
    }
    expect(names.size).toBe(20)
  })

  test('always returns a capitalized, non-empty string', () => {
    for (let position = 1; position <= 8; position++) {
      const name = generatePlanetName(['jungle'], 'A100000', position)
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
      expect(name[0]).toBe(name[0].toUpperCase())
    }
  })

  test('a hyphenated result capitalizes both parts', () => {
    // Sweep enough positions to be confident we hit at least one
    // hyphenated (two-part) result, since the single-word/two-part choice
    // is itself part of the seeded roll.
    let sawHyphenated = false
    for (let position = 1; position <= 8; position++) {
      const name = generatePlanetName(['ocean'], 'HYPHTEST', position)
      if (name.includes('-')) {
        sawHyphenated = true
        const [first, second] = name.split('-')
        expect(first[0]).toBe(first[0].toUpperCase())
        expect(second[0]).toBe(second[0].toUpperCase())
      }
    }
    expect(sawHyphenated).toBe(true)
  })

  test('falls back to the default palette for tags with no dedicated palette', () => {
    expect(PLANET_NAME_PALETTES.default).toBeDefined()
    // Just confirm it doesn't throw and produces a usable name.
    const name = generatePlanetName(['newcolony'], 'W466875', 2)
    expect(typeof name).toBe('string')
    expect(name.length).toBeGreaterThan(0)
  })
})
