const {
  validateOperaDefinition,
  matchStep,
  listeningSteps,
  isOperaComplete,
} = require('../src/domain/opera')

function makeDef(overrides = {}) {
  return {
    id: 'tutorial',
    title: 'Basic Operations',
    auto_start: true,
    step_order: 'sequential',
    steps: [
      { id: 'step-a', type: 'hire_recruit', description: 'Hire a recruit.', match: { scope: 'any' } },
      { id: 'step-b', type: 'purchase_quest_item', description: 'Buy the chip.', match: { itemName: 'Encrypted Data Chip' } },
      { id: 'step-c', type: 'execute_command', description: 'Say help.', match: { command: 'help' } },
    ],
    ...overrides,
  }
}

describe('validateOperaDefinition', () => {
  test('accepts a well-formed definition', () => {
    expect(() => validateOperaDefinition(makeDef())).not.toThrow()
  })

  test('rejects an unknown step type', () => {
    const def = makeDef({ steps: [{ id: 'x', type: 'not_a_type', description: 'x', match: { scope: 'any' } }] })
    expect(() => validateOperaDefinition(def)).toThrow(/unknown type/)
  })

  test('rejects duplicate step ids', () => {
    const def = makeDef({
      steps: [
        { id: 'dup', type: 'hire_recruit', description: 'a', match: { scope: 'any' } },
        { id: 'dup', type: 'hire_recruit', description: 'b', match: { scope: 'any' } },
      ],
    })
    expect(() => validateOperaDefinition(def)).toThrow(/duplicate step id/)
  })

  test('rejects execute_command steps without a command in match', () => {
    const def = makeDef({ steps: [{ id: 'x', type: 'execute_command', description: 'x', match: {} }] })
    expect(() => validateOperaDefinition(def)).toThrow(/execute_command match requires/)
  })

  test('rejects an invalid step_order', () => {
    expect(() => validateOperaDefinition(makeDef({ step_order: 'random' }))).toThrow(/step_order/)
  })
})

describe('matchStep', () => {
  test('{"scope":"any"} matches any payload for that action', () => {
    const step = { id: 'a', type: 'hire_recruit', match: { scope: 'any' } }
    expect(matchStep(step, 'hire_recruit', {})).toBe(true)
  })

  test('does not match a different action type', () => {
    const step = { id: 'a', type: 'hire_recruit', match: { scope: 'any' } }
    expect(matchStep(step, 'purchase_item', {})).toBe(false)
  })

  test('specific itemName match requires an exact match', () => {
    const step = { id: 'a', type: 'purchase_quest_item', match: { itemName: 'Encrypted Data Chip' } }
    expect(matchStep(step, 'purchase_quest_item', { itemName: 'Encrypted Data Chip' })).toBe(true)
    expect(matchStep(step, 'purchase_quest_item', { itemName: 'Recruit Training Vest' })).toBe(false)
  })

  test('execute_command matches on command verb only when args is absent from match', () => {
    const step = { id: 'a', type: 'execute_command', match: { command: 'split-v' } }
    expect(matchStep(step, 'execute_command', { command: 'split-v', args: ['whatever'] })).toBe(true)
  })

  test('execute_command with args requires an exact args match', () => {
    const step = { id: 'a', type: 'execute_command', match: { command: 'ship', args: ['load'] } }
    expect(matchStep(step, 'execute_command', { command: 'ship', args: ['load'] })).toBe(true)
    expect(matchStep(step, 'execute_command', { command: 'ship', args: ['assign'] })).toBe(false)
    expect(matchStep(step, 'execute_command', { command: 'ship', args: [] })).toBe(false)
  })

  test('equip_item_to_recruit maps to the equip_item action', () => {
    const step = { id: 'a', type: 'equip_item_to_recruit', match: { recruitId: 5 } }
    expect(matchStep(step, 'equip_item', { recruitId: 5 })).toBe(true)
    expect(matchStep(step, 'equip_item', { recruitId: 6 })).toBe(false)
  })
})

describe('listeningSteps', () => {
  test('sequential mode only returns the earliest incomplete step', () => {
    const def = makeDef()
    const steps = listeningSteps(def, [], 'hire_recruit')
    expect(steps.map(s => s.id)).toEqual(['step-a'])
  })

  test('sequential mode advances once earlier steps complete', () => {
    const def = makeDef()
    const steps = listeningSteps(def, ['step-a'], 'purchase_quest_item')
    expect(steps.map(s => s.id)).toEqual(['step-b'])
  })

  test('sequential mode returns nothing once every step is complete', () => {
    const def = makeDef()
    const steps = listeningSteps(def, ['step-a', 'step-b', 'step-c'], 'hire_recruit')
    expect(steps).toEqual([])
  })

  test('checklist mode returns every incomplete step matching the action', () => {
    const def = makeDef({
      step_order: 'checklist',
      steps: [
        { id: 'x', type: 'purchase_item', description: 'x', match: { scope: 'any' } },
        { id: 'y', type: 'purchase_item', description: 'y', match: { scope: 'any' } },
      ],
    })
    const steps = listeningSteps(def, [], 'purchase_item')
    expect(steps.map(s => s.id).sort()).toEqual(['x', 'y'])
  })
})

describe('isOperaComplete', () => {
  test('false until every step id is present', () => {
    const def = makeDef()
    expect(isOperaComplete(def, ['step-a', 'step-b'])).toBe(false)
    expect(isOperaComplete(def, ['step-a', 'step-b', 'step-c'])).toBe(true)
  })
})
