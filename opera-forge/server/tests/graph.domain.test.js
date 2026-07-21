const { validateGraphDefinition, analyzeGraph, runGeneration, makeRng, matchesAction } = require('../src/domain/graph')

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

  test('accepts a seed node with valid shop and mission seeds', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        {
          id: 'seed-1',
          type: 'seed',
          seeds: [
            { target: 'shop', params: { itemName: 'Recruit Training Vest' } },
            { target: 'mission', params: { templateId: 'derelict-salvage' }, note: 'Guaranteed early mission' },
          ],
        },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
      links: [
        { id: 'l1', from: 'start', to: 'seed-1', priority: 0, conditions: [] },
        { id: 'l2', from: 'seed-1', to: 'end-1', priority: 0, conditions: [] },
      ],
    })
    expect(() => validateGraphDefinition(def)).not.toThrow()
  })

  test('rejects a seed node with an unknown target', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'seed-1', type: 'seed', seeds: [{ target: 'not_a_target', params: {} }] },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/seed\[0\] target must be one of/)
  })

  test('rejects a shop seed with no itemName', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'seed-1', type: 'seed', seeds: [{ target: 'shop', params: {} }] },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/seed target "shop" requires an itemName/)
  })

  test('rejects a mission seed with no templateId', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'seed-1', type: 'seed', seeds: [{ target: 'mission', params: {} }] },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/seed target "mission" requires a templateId/)
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

  test('accepts a start node with text and a story node with completionText', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start', text: 'Welcome, Commander.' },
        { id: 'story-1', type: 'story', text: 'You arrive.', effects: [], completionText: 'Nicely done.' },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
    })
    expect(() => validateGraphDefinition(def)).not.toThrow()
  })

  test('rejects an empty-string start node text', () => {
    const def = makeDef({ nodes: [{ id: 'start', type: 'start', text: '' }, { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' }] })
    expect(() => validateGraphDefinition(def)).toThrow(/start node text/)
  })

  test('rejects an empty-string completionText on a story node', () => {
    const def = makeDef({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'story-1', type: 'story', text: 'hi', completionText: '' },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/completionText/)
  })

  test('accepts an action_performed condition with a scope:any match', () => {
    const def = makeDef({
      links: [{ id: 'l1', from: 'start', to: 'story-1', conditions: [{ type: 'action_performed', params: { actionType: 'hire_recruit', match: { scope: 'any' } } }] }],
    })
    expect(() => validateGraphDefinition(def)).not.toThrow()
  })

  test('accepts an action_performed condition with an itemName match', () => {
    const def = makeDef({
      links: [{ id: 'l1', from: 'start', to: 'story-1', conditions: [{ type: 'action_performed', params: { actionType: 'purchase_quest_item', match: { itemName: 'Recruit Training Vest' } } }] }],
    })
    expect(() => validateGraphDefinition(def)).not.toThrow()
  })

  test('accepts an action_performed condition for execute_command', () => {
    const def = makeDef({
      links: [{ id: 'l1', from: 'start', to: 'story-1', conditions: [{ type: 'action_performed', params: { actionType: 'execute_command', match: { command: 'split-v' } } }] }],
    })
    expect(() => validateGraphDefinition(def)).not.toThrow()
  })

  test('rejects an action_performed condition with an unknown actionType', () => {
    const def = makeDef({
      links: [{ id: 'l1', from: 'start', to: 'story-1', conditions: [{ type: 'action_performed', params: { actionType: 'not_a_real_action', match: { scope: 'any' } } }] }],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/actionType to be one of/)
  })

  test('rejects an execute_command action_performed condition with no command', () => {
    const def = makeDef({
      links: [{ id: 'l1', from: 'start', to: 'story-1', conditions: [{ type: 'action_performed', params: { actionType: 'execute_command', match: {} } }] }],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/requires a "command" string/)
  })

  test('rejects a non-command action_performed condition with neither scope:any nor a specific target', () => {
    const def = makeDef({
      links: [{ id: 'l1', from: 'start', to: 'story-1', conditions: [{ type: 'action_performed', params: { actionType: 'hire_recruit', match: {} } }] }],
    })
    expect(() => validateGraphDefinition(def)).toThrow(/scope.*or a specific target/)
  })
})

describe('matchesAction', () => {
  test('matches scope:any regardless of payload', () => {
    expect(matchesAction({ actionType: 'hire_recruit', match: { scope: 'any' } }, { actionType: 'hire_recruit', payload: { recruitId: 'r1' } })).toBe(true)
  })

  test('matches a specific itemName', () => {
    const params = { actionType: 'purchase_quest_item', match: { itemName: 'Encrypted Data Chip' } }
    expect(matchesAction(params, { actionType: 'purchase_quest_item', payload: { itemName: 'Encrypted Data Chip' } })).toBe(true)
    expect(matchesAction(params, { actionType: 'purchase_quest_item', payload: { itemName: 'Something Else' } })).toBe(false)
  })

  test('rejects a mismatched actionType even with scope:any', () => {
    expect(matchesAction({ actionType: 'hire_recruit', match: { scope: 'any' } }, { actionType: 'complete_quest', payload: {} })).toBe(false)
  })

  test('matches execute_command by command name, ignoring args when args is not specified', () => {
    const params = { actionType: 'execute_command', match: { command: 'split-v' } }
    expect(matchesAction(params, { actionType: 'execute_command', payload: { command: 'split-v', args: ['x'] } })).toBe(true)
  })

  test('matches execute_command args when specified', () => {
    const params = { actionType: 'execute_command', match: { command: 'mission', args: ['start', 'tpl-1'] } }
    expect(matchesAction(params, { actionType: 'execute_command', payload: { command: 'mission', args: ['start', 'tpl-1'] } })).toBe(true)
    expect(matchesAction(params, { actionType: 'execute_command', payload: { command: 'mission', args: ['start', 'tpl-2'] } })).toBe(false)
  })

  test('returns false for a missing entry', () => {
    expect(matchesAction({ actionType: 'hire_recruit', match: { scope: 'any' } }, undefined)).toBe(false)
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

  test('walks through a seed node, surfacing its seeds as a step with no effect on mockState', () => {
    const def = {
      id: 'g',
      title: 'g',
      nodes: [
        { id: 'start', type: 'start' },
        {
          id: 'seed-1',
          type: 'seed',
          seeds: [{ target: 'shop', params: { itemName: 'Recruit Training Vest' } }],
        },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'end' },
      ],
      links: [
        { id: 'l1', from: 'start', to: 'seed-1', priority: 0, conditions: [] },
        { id: 'l2', from: 'seed-1', to: 'end-1', priority: 0, conditions: [] },
      ],
    }
    const result = runGeneration(def, { seed: 'test' })
    expect(result.reason).toBe('end')
    expect(result.path[1]).toMatchObject({
      nodeId: 'seed-1',
      type: 'seed',
      seeds: [{ target: 'shop', params: { itemName: 'Recruit Training Vest' } }],
    })
    expect(result.finalState.items).toEqual([])
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

  test('advances through an action_performed link when the scripted action matches', () => {
    const def = {
      id: 'g',
      title: 'g',
      nodes: [
        { id: 'start', type: 'start', text: 'Welcome.' },
        { id: 'step-1', type: 'story', text: 'Type split-v.', effects: [], completionText: 'Panel split.' },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'Done.' },
      ],
      links: [
        { id: 'l1', from: 'start', to: 'step-1', priority: 0, conditions: [] },
        { id: 'l2', from: 'step-1', to: 'end-1', priority: 0, conditions: [{ type: 'action_performed', params: { actionType: 'execute_command', match: { command: 'split-v' } } }] },
      ],
    }
    const result = runGeneration(def, {
      seed: 'test',
      initialState: { actionsPerformed: [{ actionType: 'execute_command', payload: { command: 'split-v' } }] },
    })
    expect(result.reason).toBe('end')
    expect(result.endedAt).toBe('end-1')
    expect(result.path[0]).toMatchObject({ nodeId: 'start', text: 'Welcome.' })
    expect(result.path[1]).toMatchObject({ nodeId: 'step-1', completionText: 'Panel split.' })
  })

  test('dead-ends at the gated node when the scripted action does not match', () => {
    const def = {
      id: 'g',
      title: 'g',
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'step-1', type: 'story', text: 'Type split-v.', effects: [] },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: 'Done.' },
      ],
      links: [
        { id: 'l1', from: 'start', to: 'step-1', priority: 0, conditions: [] },
        { id: 'l2', from: 'step-1', to: 'end-1', priority: 0, conditions: [{ type: 'action_performed', params: { actionType: 'execute_command', match: { command: 'split-v' } } }] },
      ],
    }
    const result = runGeneration(def, {
      seed: 'test',
      initialState: { actionsPerformed: [{ actionType: 'execute_command', payload: { command: 'split-h' } }] },
    })
    expect(result.reason).toBe('dead_end')
    expect(result.endedAt).toBe('step-1')
  })

  test('the action cursor only advances for the link actually taken, not for rejected candidates', () => {
    // step-1's two outgoing links both gate on action_performed but require
    // different commands; only the second matches the single scripted
    // action. Evaluating (and rejecting) the first candidate must not
    // consume the scripted action.
    const def = {
      id: 'g',
      title: 'g',
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'step-1', type: 'story', text: 'Do a thing.', effects: [] },
        { id: 'wrong', type: 'end', outcome: 'neutral', text: 'wrong' },
        { id: 'right', type: 'end', outcome: 'neutral', text: 'right' },
      ],
      links: [
        { id: 'l1', from: 'start', to: 'step-1', priority: 0, conditions: [] },
        { id: 'l2', from: 'step-1', to: 'wrong', priority: 0, conditions: [{ type: 'action_performed', params: { actionType: 'execute_command', match: { command: 'split-h' } } }] },
        { id: 'l3', from: 'step-1', to: 'right', priority: 1, conditions: [{ type: 'action_performed', params: { actionType: 'execute_command', match: { command: 'split-v' } } }] },
      ],
    }
    const result = runGeneration(def, {
      seed: 'test',
      initialState: { actionsPerformed: [{ actionType: 'execute_command', payload: { command: 'split-v' } }] },
    })
    expect(result.endedAt).toBe('right')
  })

  test('recreates a small tutorial-style linear chain of action-gated steps end to end', () => {
    const def = {
      id: 'mini-tutorial',
      title: 'Mini Tutorial',
      nodes: [
        { id: 'start', type: 'start', text: 'Welcome aboard, Commander.' },
        { id: 'learn-split-v', type: 'story', text: 'Try split-v.', effects: [], completionText: 'Panel split vertically.' },
        { id: 'hire-a-recruit', type: 'story', text: 'Hire a recruit.', effects: [], completionText: 'New recruit hired.' },
        { id: 'buy-vest', type: 'story', text: 'Buy the Recruit Training Vest.', effects: [], completionText: 'Vest purchased.' },
        { id: 'end-1', type: 'end', outcome: 'neutral', text: "Basic training complete. You're on your own from here." },
      ],
      links: [
        { id: 'l0', from: 'start', to: 'learn-split-v', priority: 0, conditions: [] },
        { id: 'l1', from: 'learn-split-v', to: 'hire-a-recruit', priority: 0, conditions: [{ type: 'action_performed', params: { actionType: 'execute_command', match: { command: 'split-v' } } }] },
        { id: 'l2', from: 'hire-a-recruit', to: 'buy-vest', priority: 0, conditions: [{ type: 'action_performed', params: { actionType: 'hire_recruit', match: { scope: 'any' } } }] },
        { id: 'l3', from: 'buy-vest', to: 'end-1', priority: 0, conditions: [{ type: 'action_performed', params: { actionType: 'purchase_quest_item', match: { itemName: 'Recruit Training Vest' } } }] },
      ],
    }
    const result = runGeneration(def, {
      seed: 'test',
      initialState: {
        actionsPerformed: [
          { actionType: 'execute_command', payload: { command: 'split-v' } },
          { actionType: 'hire_recruit', payload: { recruitId: 'r1' } },
          { actionType: 'purchase_quest_item', payload: { itemName: 'Recruit Training Vest' } },
        ],
      },
    })
    expect(result.reason).toBe('end')
    expect(result.endedAt).toBe('end-1')
    expect(result.path.map(p => p.nodeId)).toEqual(['start', 'learn-split-v', 'hire-a-recruit', 'buy-vest', 'end-1'])
  })
})
