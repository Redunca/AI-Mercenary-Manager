const {
  validateGraphDefinition,
  matchesAction,
  compare,
  render,
  extractPlaceholders,
} = require('../src/domain/operaGraph')

function makeDef(overrides = {}) {
  return {
    id: 'sample',
    title: 'Sample',
    nodes: [
      { id: 'start', type: 'start' },
      { id: 'beat', type: 'story', text: 'Something happens.' },
      { id: 'end', type: 'end', outcome: 'success', text: 'Done.' },
    ],
    links: [
      { id: 'start--beat', from: 'start', to: 'beat', conditions: [] },
      { id: 'beat--end', from: 'beat', to: 'end', conditions: [] },
    ],
    ...overrides,
  }
}

describe('validateGraphDefinition', () => {
  test('accepts a well-formed graph', () => {
    expect(() => validateGraphDefinition(makeDef())).not.toThrow()
  })

  test('requires exactly one start node', () => {
    const def = makeDef({
      nodes: [{ id: 'end', type: 'end', outcome: 'success', text: 'Done.' }],
      links: [],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/exactly one start node/)
  })

  test('requires at least one end node', () => {
    const def = makeDef({ nodes: [{ id: 'start', type: 'start' }], links: [] })
    expect(() => validateGraphDefinition(def)).toThrow(/at least one end node/)
  })

  test('rejects an unknown node type', () => {
    const def = makeDef({ nodes: [...makeDef().nodes, { id: 'bad', type: 'not_a_type' }] })
    expect(() => validateGraphDefinition(def)).toThrow(/unknown type/)
  })

  test('rejects duplicate node ids', () => {
    const def = makeDef()
    def.nodes.push({ id: 'start', type: 'story', text: 'dup' })
    expect(() => validateGraphDefinition(def)).toThrow(/duplicate node id/)
  })

  test('rejects a link referencing an unknown node', () => {
    const def = makeDef()
    def.links.push({ id: 'ghost', from: 'beat', to: 'nowhere', conditions: [] })
    expect(() => validateGraphDefinition(def)).toThrow(/unknown "to" node/)
  })

  test('accepts fire_recruit as a valid action_performed actionType', () => {
    const def = makeDef({
      links: [
        { id: 'start--beat', from: 'start', to: 'beat', conditions: [] },
        {
          id: 'beat--end',
          from: 'beat',
          to: 'end',
          conditions: [
            {
              type: 'action_performed',
              params: { actionType: 'fire_recruit', match: { scope: 'any' } },
            },
          ],
        },
      ],
    })
    expect(() => validateGraphDefinition(def)).not.toThrow()
  })

  test('rejects a seed node whose candidate target is missing seedId', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'seed', type: 'seed', seeds: [{ target: 'candidate', params: {} }] },
        { id: 'end', type: 'end', outcome: 'success', text: 'Done.' },
      ],
      links: [
        { id: 'start--seed', from: 'start', to: 'seed', conditions: [] },
        { id: 'seed--end', from: 'seed', to: 'end', conditions: [] },
      ],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/seed target "candidate" requires a seedId/)
  })

  test('rejects a mission node without a title', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'mission', type: 'mission', mission: { difficulty: 'STANDARD' } },
        { id: 'end', type: 'end', outcome: 'success', text: 'Done.' },
      ],
      links: [
        { id: 'start--mission', from: 'start', to: 'mission', conditions: [] },
        { id: 'mission--end', from: 'mission', to: 'end', conditions: [] },
      ],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/requires a non-empty title/)
  })
})

describe('matchesAction', () => {
  test('{"scope":"any"} matches any payload for that action type', () => {
    expect(
      matchesAction({ actionType: 'hire_recruit', match: { scope: 'any' } }, 'hire_recruit', {}),
    ).toBe(true)
  })

  test('does not match a different action type', () => {
    expect(
      matchesAction({ actionType: 'hire_recruit', match: { scope: 'any' } }, 'purchase_item', {}),
    ).toBe(false)
  })

  test('specific itemName match requires an exact match', () => {
    const params = { actionType: 'purchase_quest_item', match: { itemName: 'Encrypted Data Chip' } }
    expect(matchesAction(params, 'purchase_quest_item', { itemName: 'Encrypted Data Chip' })).toBe(
      true,
    )
    expect(
      matchesAction(params, 'purchase_quest_item', { itemName: 'Recruit Training Vest' }),
    ).toBe(false)
  })

  test('execute_command matches on command only when args is absent from match', () => {
    const params = { actionType: 'execute_command', match: { command: 'split-v' } }
    expect(
      matchesAction(params, 'execute_command', { command: 'split-v', args: ['whatever'] }),
    ).toBe(true)
  })

  test('execute_command with args requires an exact args match', () => {
    const params = { actionType: 'execute_command', match: { command: 'ship', args: ['load'] } }
    expect(matchesAction(params, 'execute_command', { command: 'ship', args: ['load'] })).toBe(true)
    expect(matchesAction(params, 'execute_command', { command: 'ship', args: ['assign'] })).toBe(
      false,
    )
  })

  test('seedId match compares against a payload.seedId field directly', () => {
    const params = { actionType: 'hire_recruit', match: { seedId: 'cult-defector' } }
    expect(matchesAction(params, 'hire_recruit', { recruitId: 5, seedId: 'cult-defector' })).toBe(
      true,
    )
    expect(matchesAction(params, 'hire_recruit', { recruitId: 5 })).toBe(false)
  })
})

describe('compare', () => {
  test.each([
    ['>', 5, 3, true],
    ['>', 3, 5, false],
    ['>=', 5, 5, true],
    ['<', 3, 5, true],
    ['<=', 5, 5, true],
    ['==', 5, 5, true],
    ['==', 5, 4, false],
  ])('%s %s %s -> %s', (operator, a, b, expected) => {
    expect(compare(a, operator, b)).toBe(expected)
  })
})

describe('render', () => {
  test('substitutes every known tag', () => {
    const result = render('Contact from {faction} on {planetName}.', {
      faction: 'the Polar Guard',
      planetName: 'K857130-7',
    })
    expect(result.text).toBe('Contact from the Polar Guard on K857130-7.')
    expect(result.missing).toEqual([])
  })

  test('leaves an unresolved tag literal and reports it, never throwing', () => {
    const result = render('{unknownTag} approaches.', {})
    expect(result.text).toBe('{unknownTag} approaches.')
    expect(result.missing).toEqual(['unknownTag'])
  })

  test('passes non-string templates through unchanged', () => {
    expect(render(undefined, {})).toEqual({ text: undefined, missing: [] })
  })
})

describe('extractPlaceholders', () => {
  test('extracts every unique {tag} name', () => {
    expect(extractPlaceholders('{a} meets {b} near {a} again.')).toEqual(['a', 'b'])
  })

  test('returns an empty array for a non-string', () => {
    expect(extractPlaceholders(undefined)).toEqual([])
  })
})
