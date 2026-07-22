// Exercises opera.service.js's reactive entry points (recordOperaAction,
// resolveChoice, maintainOperaSlots) against a small in-memory fake
// Postgres client keyed by normalized SQL text, mirroring the style used by
// self.service.test.js and the old opera.service.test.js. Templates are
// supplied via a mocked operaLoader rather than real files, and kept to
// story/choice/end nodes only (no mission/seed/effect nodes) so the fake
// client's surface stays proportionate to what these flows actually touch --
// the full walk engine (mission injection, seed resolution, tag rendering,
// effects) is exercised end-to-end against a real Postgres instance
// separately, not re-modeled here query-by-query.

jest.mock('../src/operaLoader')
const { getOperaDefinition, getGenerationPoolDefinitions } = require('../src/operaLoader')
const OperaService = require('../src/services/opera.service')

const PLAYER_ID = 1

// A linear graph that never reaches its end node within a single test step,
// so tests can assert on a specific mid-walk gate without also exercising
// finish()/maintainOperaSlots.
function gatedGraph(overrides = {}) {
  return {
    id: 'side-quest',
    title: 'Side Quest',
    nodes: [
      { id: 'start', type: 'start' },
      { id: 'ask', type: 'story', text: 'Do the thing.' },
      { id: 'thanks', type: 'story', text: 'Thanks.' },
      { id: 'end', type: 'end', outcome: 'success', text: 'Done.' },
    ],
    links: [
      { id: 'start--ask', from: 'start', to: 'ask', conditions: [] },
      {
        id: 'ask--thanks', from: 'ask', to: 'thanks',
        conditions: [{ type: 'action_performed', params: { actionType: 'execute_command', match: { command: 'help' } } }],
      },
      // Gated too (on a second, distinct action) so a single 'help' action
      // advances exactly one step and the walk stops predictably at
      // 'thanks' -- an unconditioned link here would auto-advance straight
      // through to 'end' in the same pass, which is correct engine
      // behavior but not what this fixture is meant to isolate.
      {
        id: 'thanks--end', from: 'thanks', to: 'end',
        conditions: [{ type: 'action_performed', params: { actionType: 'execute_command', match: { command: 'bye' } } }],
      },
    ],
    ...overrides,
  }
}

function choiceGraph() {
  return {
    id: 'decision',
    title: 'Decision',
    nodes: [
      { id: 'start', type: 'start' },
      { id: 'pick', type: 'choice', text: 'Choose.', choiceOptions: [{ id: 'a', label: 'Option A' }, { id: 'b', label: 'Option B' }] },
      { id: 'end-a', type: 'end', outcome: 'success', text: 'Took A.' },
      { id: 'end-b', type: 'end', outcome: 'neutral', text: 'Took B.' },
    ],
    links: [
      { id: 'start--pick', from: 'start', to: 'pick', conditions: [] },
      { id: 'pick--a', from: 'pick', to: 'end-a', conditions: [{ type: 'choice_made', params: { optionId: 'a' } }] },
      { id: 'pick--b', from: 'pick', to: 'end-b', conditions: [{ type: 'choice_made', params: { optionId: 'b' } }] },
    ],
  }
}

// A graph whose only path out of start is a seed node gated on the very
// action_performed the seed itself sets up (buy the seeded item) -- the
// shape that left two live templates (two-gangs-one-contract,
// the-machine-messiah) with zero visible tasks: a seed node doesn't push a
// task on its own, so if it's also the walk's stopping point, the opera
// looked completely empty with nothing telling the player what to do.
function seedGraph(id) {
  return {
    id,
    title: id,
    nodes: [
      { id: 'start', type: 'start' },
      { id: 'get-item', type: 'seed', seeds: [{ target: 'shop', params: { itemName: 'Widget' }, note: 'A rare widget appears in the shop.' }] },
      { id: 'end', type: 'end', outcome: 'success', text: 'Done.' },
    ],
    links: [
      { id: 'start--get-item', from: 'start', to: 'get-item', conditions: [] },
      {
        id: 'get-item--end', from: 'get-item', to: 'end',
        conditions: [{ type: 'action_performed', params: { actionType: 'purchase_quest_item', match: { itemName: 'Widget' } } }],
      },
    ],
  }
}

// A graph that reaches its end node immediately (start -> end), used for
// maintainOperaSlots tests so a freshly created instance doesn't itself
// re-trigger maintainOperaSlots recursively.
function instantGraph(id) {
  return {
    id,
    title: id,
    nodes: [{ id: 'start', type: 'start' }, { id: 'end', type: 'end', outcome: 'success', text: 'Done.' }],
    links: [{ id: 'start--end', from: 'start', to: 'end', conditions: [] }],
  }
}

function createFakeClient({ instances = [], players = {} } = {}) {
  const state = {
    instances: instances.map(i => ({ ...i })),
    players: { ...players },
    nextInstanceId: Math.max(0, ...instances.map(i => i.id)) + 1,
  }

  const query = jest.fn(async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim()

    if (s.startsWith("SELECT * FROM opera_instances WHERE player_id = $1 AND status = 'in_progress'")) {
      const [playerId] = params
      return { rows: state.instances.filter(i => i.player_id === playerId && i.status === 'in_progress') }
    }
    if (s.startsWith('SELECT * FROM opera_instances WHERE player_id = $1 AND id = $2')) {
      const [playerId, id] = params
      return { rows: state.instances.filter(i => i.player_id === playerId && i.id === id) }
    }
    if (s.startsWith('UPDATE opera_instances SET state = $1 WHERE id = $2')) {
      const [stateJson, id] = params
      const row = state.instances.find(i => i.id === id)
      if (row) row.state = JSON.parse(stateJson)
      return { rows: [] }
    }
    if (s.startsWith('UPDATE opera_instances SET status = $1, state = $2, completed_at = NOW() WHERE id = $3')) {
      const [status, stateJson, id] = params
      const row = state.instances.find(i => i.id === id)
      if (row) { row.status = status; row.state = JSON.parse(stateJson) }
      return { rows: [] }
    }
    if (s.startsWith(`SELECT status FROM opera_instances WHERE player_id = $1 AND template_id = $2`)) {
      const [playerId, templateId] = params
      return { rows: state.instances.filter(i => i.player_id === playerId && i.template_id === templateId) }
    }
    if (s.startsWith('SELECT slot_index, template_id FROM opera_instances')) {
      const [playerId] = params
      return { rows: state.instances.filter(i => i.player_id === playerId && i.status === 'in_progress' && i.slot_index !== null) }
    }
    if (s.startsWith('INSERT INTO opera_instances')) {
      const [playerId, templateId, slotIndex] = params
      const row = { id: state.nextInstanceId++, player_id: playerId, template_id: templateId, slot_index: slotIndex, status: 'in_progress', state: {} }
      state.instances.push(row)
      return { rows: [row] }
    }
    if (s.startsWith('SELECT opera_slot_capacity FROM players WHERE id = $1')) {
      const [playerId] = params
      return { rows: [{ opera_slot_capacity: state.players[playerId]?.opera_slot_capacity ?? 0 }] }
    }
    if (s.startsWith('SELECT id FROM recruits WHERE player_id = $1 AND deleted_at IS NULL ORDER BY random()')) {
      return { rows: [] }
    }
    if (s.startsWith('INSERT INTO log_entries')) {
      return { rows: [] }
    }
    // Anything else (consumables/equipment has_item lookups, ships
    // crew_threshold lookups, etc.) isn't reached by these narrow test
    // graphs -- default to an empty result rather than growing the fixture
    // to cover the full walk engine's surface here.
    return { rows: [] }
  })

  return { query, state }
}

describe('recordOperaAction', () => {
  test('advances an instance past a matching action_performed gate', async () => {
    getOperaDefinition.mockReturnValue(gatedGraph())
    const client = createFakeClient({
      instances: [{ id: 10, player_id: PLAYER_ID, template_id: 'side-quest', slot_index: 0, status: 'in_progress', state: { currentNodeId: 'ask', tags: {}, log: [], awaiting: 'link' } }],
    })

    await OperaService.recordOperaAction(client, PLAYER_ID, 'execute_command', { command: 'help', args: [] })

    const row = client.state.instances.find(i => i.id === 10)
    expect(row.state.currentNodeId).toBe('thanks')
    expect(row.state.awaiting).toBe('link')
  })

  test('leaves an instance untouched when the action does not match its pending gate', async () => {
    getOperaDefinition.mockReturnValue(gatedGraph())
    const client = createFakeClient({
      instances: [{ id: 10, player_id: PLAYER_ID, template_id: 'side-quest', slot_index: 0, status: 'in_progress', state: { currentNodeId: 'ask', tags: {}, log: [], awaiting: 'link' } }],
    })

    await OperaService.recordOperaAction(client, PLAYER_ID, 'execute_command', { command: 'split-v', args: [] })

    const row = client.state.instances.find(i => i.id === 10)
    expect(row.state.currentNodeId).toBe('ask')
  })

  test('never throws, even when the instance references a removed template', async () => {
    getOperaDefinition.mockReturnValue(null)
    const client = createFakeClient({
      instances: [{ id: 10, player_id: PLAYER_ID, template_id: 'gone', slot_index: 0, status: 'in_progress', state: {} }],
    })

    await expect(
      OperaService.recordOperaAction(client, PLAYER_ID, 'execute_command', { command: 'help' }),
    ).resolves.toBeUndefined()
  })
})

describe('resolveChoice', () => {
  test('rejects when the instance has no pending choice', async () => {
    getOperaDefinition.mockReturnValue(choiceGraph())
    const client = createFakeClient({
      instances: [{ id: 20, player_id: PLAYER_ID, template_id: 'decision', slot_index: 0, status: 'in_progress', state: { currentNodeId: 'start', awaiting: null } }],
    })

    const result = await OperaService.resolveChoice(client, PLAYER_ID, 20, 'a')
    expect(result).toEqual({ error: 'No pending choice' })
  })

  test('rejects an option id that is not on the pending choice', async () => {
    getOperaDefinition.mockReturnValue(choiceGraph())
    const client = createFakeClient({
      instances: [{
        id: 20, player_id: PLAYER_ID, template_id: 'decision', slot_index: 0, status: 'in_progress',
        state: { currentNodeId: 'pick', awaiting: 'choice', pendingChoice: { nodeId: 'pick', text: 'Choose.', options: [{ id: 'a', label: 'Option A' }, { id: 'b', label: 'Option B' }] } },
      }],
    })

    const result = await OperaService.resolveChoice(client, PLAYER_ID, 20, 'c')
    expect(result).toEqual({ error: 'Invalid option' })
  })

  test('resolves a valid choice and advances the walk to the matching ending', async () => {
    getOperaDefinition.mockReturnValue(choiceGraph())
    const client = createFakeClient({
      instances: [{
        id: 20, player_id: PLAYER_ID, template_id: 'decision', slot_index: 0, status: 'in_progress',
        state: { currentNodeId: 'pick', awaiting: 'choice', pendingChoice: { nodeId: 'pick', text: 'Choose.', options: [{ id: 'a', label: 'Option A' }, { id: 'b', label: 'Option B' }] } },
      }],
    })

    const result = await OperaService.resolveChoice(client, PLAYER_ID, 20, 'b')
    expect(result).toEqual({ success: true })
    const row = client.state.instances.find(i => i.id === 20)
    expect(row.status).toBe('completed') // outcome: 'neutral' on end-b -> completed, not failed
    expect(row.state.currentNodeId).toBe('end-b')
  })
})

describe('maintainOperaSlots', () => {
  test('does nothing until the tutorial instance is completed', async () => {
    getGenerationPoolDefinitions.mockReturnValue([instantGraph('template-a')])
    const client = createFakeClient({
      instances: [{ id: 1, player_id: PLAYER_ID, template_id: 'tutorial', slot_index: null, status: 'in_progress', state: {} }],
      players: { [PLAYER_ID]: { opera_slot_capacity: 3 } },
    })

    await OperaService.maintainOperaSlots(client, PLAYER_ID)

    expect(client.state.instances).toHaveLength(1)
  })

  test('fills every empty slot up to capacity once the tutorial is completed', async () => {
    getOperaDefinition.mockImplementation(id => instantGraph(id))
    getGenerationPoolDefinitions.mockReturnValue([instantGraph('template-a'), instantGraph('template-b'), instantGraph('template-c')])
    const client = createFakeClient({
      instances: [{ id: 1, player_id: PLAYER_ID, template_id: 'tutorial', slot_index: null, status: 'completed', state: {} }],
      players: { [PLAYER_ID]: { opera_slot_capacity: 3 } },
    })

    await OperaService.maintainOperaSlots(client, PLAYER_ID)

    const pooled = client.state.instances.filter(i => i.slot_index !== null)
    expect(pooled).toHaveLength(3)
    expect(new Set(pooled.map(i => i.slot_index))).toEqual(new Set([0, 1, 2]))
  })

  test('only fills the empty slots, leaving an already-active one alone', async () => {
    getOperaDefinition.mockImplementation(id => instantGraph(id))
    getGenerationPoolDefinitions.mockReturnValue([instantGraph('template-a'), instantGraph('template-b')])
    const client = createFakeClient({
      instances: [
        { id: 1, player_id: PLAYER_ID, template_id: 'tutorial', slot_index: null, status: 'completed', state: {} },
        { id: 2, player_id: PLAYER_ID, template_id: 'template-a', slot_index: 0, status: 'in_progress', state: { currentNodeId: 'start' } },
      ],
      players: { [PLAYER_ID]: { opera_slot_capacity: 2 } },
    })

    await OperaService.maintainOperaSlots(client, PLAYER_ID)

    const pooled = client.state.instances.filter(i => i.slot_index !== null)
    expect(pooled).toHaveLength(2)
    expect(pooled.find(i => i.slot_index === 0).id).toBe(2) // untouched
    expect(pooled.find(i => i.slot_index === 1)).toBeTruthy() // newly filled
  })

  test('a fresh instance stopped at a gated seed node still has a visible current task', async () => {
    getOperaDefinition.mockImplementation(id => seedGraph(id))
    getGenerationPoolDefinitions.mockReturnValue([seedGraph('template-a')])
    const client = createFakeClient({
      instances: [{ id: 1, player_id: PLAYER_ID, template_id: 'tutorial', slot_index: null, status: 'completed', state: {} }],
      players: { [PLAYER_ID]: { opera_slot_capacity: 1 } },
    })

    await OperaService.maintainOperaSlots(client, PLAYER_ID)

    const pooled = client.state.instances.find(i => i.slot_index === 0)
    expect(pooled.state.awaiting).toBe('link')
    expect(pooled.state.log).toHaveLength(1)
    expect(pooled.state.log[0]).toMatchObject({ type: 'seed', text: 'A rare widget appears in the shop.' })
  })
})
