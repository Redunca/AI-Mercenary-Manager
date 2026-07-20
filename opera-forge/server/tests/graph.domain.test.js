const { validateGraphDefinition, analyzeGraph, runGeneration, makeRng } = require('../src/domain/graph')

function makeDef(overrides = {}) {
  return {
    id: 'a-quest',
    title: 'A Quest',
    nodes: [
      { id: 'start', type: 'start' },
      { id: 'story-1', type: 'story', text: 'You arrive.', effects: [] },
      { id: 'end-1', type: 'end', outcome: 'neutral', text: 'The end.' },
    ],
    links: [
      { id: 'l1', from: 'start', to: 'story-1', priority: 0, conditions: [] },
      { id: 'l2', from: 'story-1', to: 'end-1', priority: 0, conditions: [] },
    ],
    ...overrides,
  }
}

describe('validateGraphDefinition', () => {
  test('accepts a well-formed definition', () => {
    expect(() => validateGraphDefinition(makeDef())).not.toThrow()
  })

  test('rejects an unknown node type', () => {
    const def = makeDef({ nodes: [{ id: 'x', type: 'not_a_type' }] })
    expect(() => validateGraphDefinition(def)).toThrow(/unknown type/)
  })

  test('rejects duplicate node ids', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'start', type: 'start' },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/duplicate node id/)
  })

  test('rejects a definition with no start node', () => {
    const def = makeDef({ nodes: [{ id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' }] })
    expect(() => validateGraphDefinition(def)).toThrow(/exactly one start node/)
  })

  test('rejects a definition with two start nodes', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'start2', type: 'start' },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/exactly one start node/)
  })

  test('rejects a definition with no end node', () => {
    const def = makeDef({ nodes: [{ id: 'start', type: 'start' }] })
    expect(() => validateGraphDefinition(def)).toThrow(/at least one end node/)
  })

  test('rejects a story node with no text', () => {
    const def = makeDef({ nodes: [{ id: 'start', type: 'start' }, { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' }, { id: 's', type: 'story' }] })
    expect(() => validateGraphDefinition(def)).toThrow(/story node requires text/)
  })

  test('rejects an end node with an invalid outcome', () => {
    const def = makeDef({ nodes: [{ id: 'start', type: 'start' }, { id: 'end-1', type: 'end', outcome: 'maybe', text: 'end' }] })
    expect(() => validateGraphDefinition(def)).toThrow(/outcome to be one of/)
  })

  test('rejects a check node missing a roll', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'c', type: 'check' },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/check node requires a roll/)
  })

  test('accepts a check node with a chance roll', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'c', type: 'check', roll: { type: 'chance', params: { percentage: 50 } } },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
      links: [
        { id: 'l1', from: 'start', to: 'c', priority: 0, conditions: [] },
        { id: 'l2', from: 'c', to: 'end-1', priority: 0, conditions: [] },
      ],
    })
    expect(() => validateGraphDefinition(def)).not.toThrow()
  })

  test('rejects a link referencing an unknown node', () => {
    const def = makeDef({ links: [{ id: 'l1', from: 'start', to: 'nowhere' }] })
    expect(() => validateGraphDefinition(def)).toThrow(/unknown "to" node/)
  })

  test('rejects duplicate link ids', () => {
    const def = makeDef({
      links: [
        { id: 'l1', from: 'start', to: 'story-1' },
        { id: 'l1', from: 'story-1', to: 'end-1' },
      ],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/duplicate link id/)
  })

  test('rejects an unknown condition type', () => {
    const def = makeDef({ links: [{ id: 'l1', from: 'start', to: 'story-1', conditions: [{ type: 'not_a_condition' }] }] })
    expect(() => validateGraphDefinition(def)).toThrow(/unknown condition type/)
  })

  test('rejects a has_item condition with no itemName', () => {
    const def = makeDef({ links: [{ id: 'l1', from: 'start', to: 'story-1', conditions: [{ type: 'has_item', params: {} }] }] })
    expect(() => validateGraphDefinition(def)).toThrow(/has_item.*itemName/)
  })

  test('rejects an attribute_threshold condition with a bad operator', () => {
    const def = makeDef({
      links: [{ id: 'l1', from: 'start', to: 'story-1', conditions: [{ type: 'attribute_threshold', params: { attribute: 'agility', operator: '!=', value: 3 } }] }],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/operator to be one of/)
  })

  test('rejects a story node effect of unknown type', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'story-1', type: 'story', text: 'hi', effects: [{ type: 'not_an_effect' }] },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/unknown effect type/)
  })
})

describe('analyzeGraph', () => {
  test('flags a dead end (non-end node with no outgoing links)', () => {
    const def = makeDef({
      links: [{ id: 'l1', from: 'start', to: 'story-1', priority: 0, conditions: [] }],
    })
    const warnings = analyzeGraph(def)
    expect(warnings.some(w => w.includes('dead end'))).toBe(true)
  })

  test('flags an unreachable node', () => {
    const def = makeDef({
      nodes: [...makeDef().nodes, { id: 'orphan', type: 'story', text: 'lost', effects: [] }],
    })
    const warnings = analyzeGraph(def)
    expect(warnings.some(w => w.includes('orphan') && w.includes('unreachable'))).toBe(true)
  })

  test('returns no warnings for a fully connected, reachable graph', () => {
    expect(analyzeGraph(makeDef())).toEqual([])
  })
})

describe('makeRng', () => {
  test('is deterministic for a given seed', () => {
    const a = makeRng('seed-1')
    const b = makeRng('seed-1')
    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  test('produces different sequences for different seeds', () => {
    const a = makeRng('seed-1')
    const b = makeRng('seed-2')
    expect(a()).not.toEqual(b())
  })
})

describe('runGeneration', () => {
  test('walks a linear graph to its end node', () => {
    const result = runGeneration(makeDef(), { seed: 'test' })
    expect(result.reason).toBe('end')
    expect(result.endedAt).toBe('end-1')
    expect(result.path.map(p => p.nodeId)).toEqual(['start', 'story-1', 'end-1'])
  })

  test('applies story-node effects to the working state', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'story-1', type: 'story', text: 'You find a chip.', effects: [{ type: 'give_item', params: { itemName: 'Chip' } }] },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
    })
    const result = runGeneration(def, { seed: 'test' })
    expect(result.finalState.items).toContain('Chip')
  })

  test('a has_item condition sees items granted earlier in the same walk', () => {
    const def = {
      id: 'g',
      title: 'g',
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'give', type: 'story', text: 'You find a key.', effects: [{ type: 'give_item', params: { itemName: 'Key' } }] },
        { id: 'locked', type: 'end', outcome: 'failure', text: 'Still locked.' },
        { id: 'unlocked', type: 'end', outcome: 'success', text: 'Door opens.' },
      ],
      links: [
        { id: 'l1', from: 'start', to: 'give', priority: 0, conditions: [] },
        { id: 'l2', from: 'give', to: 'unlocked', priority: 0, conditions: [{ type: 'has_item', params: { itemName: 'Key' } }] },
        { id: 'l3', from: 'give', to: 'locked', priority: 1, conditions: [] },
      ],
    }
    const result = runGeneration(def, { seed: 'test' })
    expect(result.endedAt).toBe('unlocked')
  })

  test('routes through a check node using previous_outcome', () => {
    const def = {
      id: 'g',
      title: 'g',
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'check', type: 'check', roll: { type: 'chance', params: { percentage: 100 } } },
        { id: 'won', type: 'end', outcome: 'success', text: 'won' },
        { id: 'lost', type: 'end', outcome: 'failure', text: 'lost' },
      ],
      links: [
        { id: 'l1', from: 'start', to: 'check', priority: 0, conditions: [] },
        { id: 'l2', from: 'check', to: 'won', priority: 0, conditions: [{ type: 'previous_outcome', params: { equals: 'success' } }] },
        { id: 'l3', from: 'check', to: 'lost', priority: 1, conditions: [{ type: 'previous_outcome', params: { equals: 'failure' } }] },
      ],
    }
    const result = runGeneration(def, { seed: 'test' })
    expect(result.endedAt).toBe('won')
  })

  test('respects link priority order, picking the first satisfied link', () => {
    const def = {
      id: 'g',
      title: 'g',
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'a', type: 'end', outcome: 'neutral', text: 'a' },
        { id: 'b', type: 'end', outcome: 'neutral', text: 'b' },
      ],
      links: [
        { id: 'l1', from: 'start', to: 'b', priority: 1, conditions: [] },
        { id: 'l2', from: 'start', to: 'a', priority: 0, conditions: [] },
      ],
    }
    const result = runGeneration(def, { seed: 'test' })
    expect(result.endedAt).toBe('a')
  })

  test('reports a dead end when no outgoing link is satisfied', () => {
    const def = {
      id: 'g',
      title: 'g',
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'gate', type: 'story', text: 'A locked door.', effects: [] },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
      links: [
        { id: 'l1', from: 'start', to: 'gate', priority: 0, conditions: [] },
        { id: 'l2', from: 'gate', to: 'end-1', priority: 0, conditions: [{ type: 'has_item', params: { itemName: 'Key' } }] },
      ],
    }
    const result = runGeneration(def, { seed: 'test' })
    expect(result.reason).toBe('dead_end')
    expect(result.endedAt).toBe('gate')
  })

  test('bails out with max_steps_exceeded on a cyclic graph', () => {
    const def = {
      id: 'g',
      title: 'g',
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'loop', type: 'story', text: 'loop', effects: [] },
      ],
      links: [
        { id: 'l1', from: 'start', to: 'loop', priority: 0, conditions: [] },
        { id: 'l2', from: 'loop', to: 'loop', priority: 0, conditions: [] },
      ],
    }
    const result = runGeneration(def, { seed: 'test' })
    expect(result.reason).toBe('max_steps_exceeded')
  })

  test('is deterministic for a given seed with a chance condition', () => {
    const def = {
      id: 'g',
      title: 'g',
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'a', type: 'end', outcome: 'success', text: 'a' },
        { id: 'b', type: 'end', outcome: 'failure', text: 'b' },
      ],
      links: [
        { id: 'l1', from: 'start', to: 'a', priority: 0, conditions: [{ type: 'chance', params: { percentage: 50 } }] },
        { id: 'l2', from: 'start', to: 'b', priority: 1, conditions: [] },
      ],
    }
    const r1 = runGeneration(def, { seed: 'fixed-seed' })
    const r2 = runGeneration(def, { seed: 'fixed-seed' })
    expect(r1.endedAt).toBe(r2.endedAt)
  })
})
