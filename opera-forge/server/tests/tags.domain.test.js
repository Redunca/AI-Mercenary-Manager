const { TAG_CATALOG, extractPlaceholders, renderPreview, exampleContext, findTag } = require('../src/domain/tags')

describe('extractPlaceholders', () => {
  test('extracts unique {tagName} references', () => {
    expect(extractPlaceholders('{planetName} is near {planetName}, close to {faction}.')).toEqual(['planetName', 'faction'])
  })

  test('returns an empty array for text with no placeholders', () => {
    expect(extractPlaceholders('Nothing to see here.')).toEqual([])
  })

  test('returns an empty array for a non-string template', () => {
    expect(extractPlaceholders(undefined)).toEqual([])
  })
})

describe('renderPreview', () => {
  test('substitutes every resolved tag', () => {
    const { text, missing } = renderPreview('Welcome to {planetName}, courtesy of {faction}.', {
      planetName: 'Kestrel\'s Rest',
      faction: 'the Void Brotherhood',
    })
    expect(text).toBe('Welcome to Kestrel\'s Rest, courtesy of the Void Brotherhood.')
    expect(missing).toEqual([])
  })

  test('leaves unresolved tags untouched and reports them, without throwing', () => {
    const { text, missing } = renderPreview('Welcome to {planetName}.', {})
    expect(text).toBe('Welcome to {planetName}.')
    expect(missing).toEqual(['planetName'])
  })

  test('treats an empty-string context value as unresolved', () => {
    const { missing } = renderPreview('{clientName}', { clientName: '' })
    expect(missing).toEqual(['clientName'])
  })
})

describe('exampleContext / findTag', () => {
  test('exampleContext provides a value for every catalog tag', () => {
    const context = exampleContext()
    for (const group of TAG_CATALOG) {
      for (const tag of group.tags) {
        expect(context[tag.name]).toBe(tag.example)
      }
    }
  })

  test('findTag looks up a tag definition by name across categories', () => {
    expect(findTag('planetName')).toMatchObject({ name: 'planetName' })
    expect(findTag('not-a-tag')).toBeNull()
  })
})
