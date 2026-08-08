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
        id: 'ask--thanks',
        from: 'ask',
        to: 'thanks',
        conditions: [
          {
            type: 'action_performed',
            params: { actionType: 'execute_command', match: { command: 'help' } },
          },
        ],
      },
      // Gated too (on a second, distinct action) so a single 'help' action
      // advances exactly one step and the walk stops predictably at
      // 'thanks' -- an unconditioned link here would auto-advance straight
      // through to 'end' in the same pass, which is correct engine
      // behavior but not what this fixture is meant to isolate.
      {
        id: 'thanks--end',
        from: 'thanks',
        to: 'end',
        conditions: [
          {
            type: 'action_performed',
            params: { actionType: 'execute_command', match: { command: 'bye' } },
          },
        ],
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
      {
        id: 'pick',
        type: 'choice',
        text: 'Choose.',
        choiceOptions: [
          { id: 'a', label: 'Option A' },
          { id: 'b', label: 'Option B' },
        ],
      },
      { id: 'end-a', type: 'end', outcome: 'success', text: 'Took A.' },
      { id: 'end-b', type: 'end', outcome: 'neutral', text: 'Took B.' },
    ],
    links: [
      { id: 'start--pick', from: 'start', to: 'pick', conditions: [] },
      {
        id: 'pick--a',
        from: 'pick',
        to: 'end-a',
        conditions: [{ type: 'choice_made', params: { optionId: 'a' } }],
      },
      {
        id: 'pick--b',
        from: 'pick',
        to: 'end-b',
        conditions: [{ type: 'choice_made', params: { optionId: 'b' } }],
      },
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
      {
        id: 'get-item',
        type: 'seed',
        seeds: [
          {
            target: 'shop',
            params: { itemName: 'Widget' },
            note: 'A rare widget appears in the shop.',
          },
        ],
      },
      { id: 'end', type: 'end', outcome: 'success', text: 'Done.' },
    ],
    links: [
      { id: 'start--get-item', from: 'start', to: 'get-item', conditions: [] },
      {
        id: 'get-item--end',
        from: 'get-item',
        to: 'end',
        conditions: [
          {
            type: 'action_performed',
            params: { actionType: 'purchase_quest_item', match: { itemName: 'Widget' } },
          },
        ],
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
    nodes: [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end', outcome: 'success', text: 'Done.' },
    ],
    links: [{ id: 'start--end', from: 'start', to: 'end', conditions: [] }],
  }
}

function createFakeClient({
  instances = [],
  players = {},
  shopItems = [],
  consumables = [],
  equipment = [],
} = {}) {
  const state = {
    instances: instances.map((i) => ({ ...i })),
    players: { ...players },
    nextInstanceId: Math.max(0, ...instances.map((i) => i.id)) + 1,
    logEntries: [],
    shopItems: shopItems.map((i) => ({ ...i })),
    consumables: consumables.map((i) => ({ ...i })),
    equipment: equipment.map((i) => ({ ...i })),
  }

  const query = jest.fn(async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim()

    if (
      s.startsWith("SELECT * FROM opera_instances WHERE player_id = $1 AND status = 'in_progress'")
    ) {
      const [playerId] = params
      return {
        rows: state.instances.filter((i) => i.player_id === playerId && i.status === 'in_progress'),
      }
    }
    if (s.startsWith('SELECT * FROM opera_instances WHERE player_id = $1 AND id = $2')) {
      const [playerId, id] = params
      return { rows: state.instances.filter((i) => i.player_id === playerId && i.id === id) }
    }
    if (s.startsWith('SELECT * FROM opera_instances WHERE player_id = $1 AND (status')) {
      const [playerId, tutorialTemplateId] = params
      return {
        rows: state.instances.filter(
          (i) =>
            i.player_id === playerId &&
            (i.status === 'in_progress' || i.template_id === tutorialTemplateId),
        ),
      }
    }
    if (s.startsWith('UPDATE opera_instances SET state = $1 WHERE id = $2')) {
      const [stateJson, id] = params
      const row = state.instances.find((i) => i.id === id)
      if (row) row.state = JSON.parse(stateJson)
      return { rows: [] }
    }
    if (
      s.startsWith(
        'UPDATE opera_instances SET status = $1, state = $2, completed_at = NOW() WHERE id = $3',
      )
    ) {
      const [status, stateJson, id] = params
      const row = state.instances.find((i) => i.id === id)
      if (row) {
        row.status = status
        row.state = JSON.parse(stateJson)
      }
      return { rows: [] }
    }
    if (
      s.startsWith(`SELECT status FROM opera_instances WHERE player_id = $1 AND template_id = $2`)
    ) {
      const [playerId, templateId] = params
      return {
        rows: state.instances.filter(
          (i) => i.player_id === playerId && i.template_id === templateId,
        ),
      }
    }
    if (s.startsWith('SELECT slot_index, template_id FROM opera_instances')) {
      const [playerId] = params
      return {
        rows: state.instances.filter(
          (i) => i.player_id === playerId && i.status === 'in_progress' && i.slot_index !== null,
        ),
      }
    }
    if (s.startsWith('INSERT INTO opera_instances')) {
      const [playerId, templateId, slotIndex] = params
      const row = {
        id: state.nextInstanceId++,
        player_id: playerId,
        template_id: templateId,
        slot_index: slotIndex,
        status: 'in_progress',
        state: {},
      }
      state.instances.push(row)
      return { rows: [row] }
    }
    if (s.startsWith('SELECT opera_slot_capacity FROM players WHERE id = $1')) {
      const [playerId] = params
      return { rows: [{ opera_slot_capacity: state.players[playerId]?.opera_slot_capacity ?? 0 }] }
    }
    if (
      s.startsWith(
        'SELECT id FROM recruits WHERE player_id = $1 AND deleted_at IS NULL ORDER BY random()',
      )
    ) {
      return { rows: [] }
    }
    if (s.startsWith('INSERT INTO log_entries')) {
      const [playerId, tag, message, missionId, operaId] = params
      state.logEntries.push({ playerId, tag, message, missionId, operaId })
      return { rows: [] }
    }
    if (s.startsWith('SELECT 1 FROM opera_instances WHERE player_id = $1 AND template_id = $2')) {
      const [playerId, templateId, excludeId] = params
      return {
        rows: state.instances
          .filter(
            (i) =>
              i.player_id === playerId &&
              i.template_id === templateId &&
              i.status === 'in_progress' &&
              i.id !== excludeId,
          )
          .slice(0, 1),
      }
    }
    if (s.startsWith('SELECT name FROM shop_items WHERE is_quest_item = TRUE')) {
      const [names] = params
      return {
        rows: state.shopItems
          .filter((i) => i.is_quest_item && names.includes(i.name))
          .map((i) => ({ name: i.name })),
      }
    }
    if (s.startsWith('DELETE FROM consumables WHERE player_id = $1 AND name = ANY')) {
      const [playerId, names] = params
      state.consumables = state.consumables.filter(
        (c) => !(c.player_id === playerId && names.includes(c.name)),
      )
      return { rows: [] }
    }
    if (s.startsWith('DELETE FROM equipment WHERE player_id = $1 AND name = ANY')) {
      const [playerId, names] = params
      state.equipment = state.equipment.filter(
        (e) =>
          !(e.player_id === playerId && names.includes(e.name) && e.assigned_to_recruit_id == null),
      )
      return { rows: [] }
    }
    // Anything else (has_item lookups, ships crew_threshold lookups, etc.)
    // isn't reached by these narrow test graphs -- default to an empty
    // result rather than growing the fixture to cover the full walk
    // engine's surface here.
    return { rows: [] }
  })

  return { query, state }
}

describe('recordOperaAction', () => {
  test('advances an instance past a matching action_performed gate', async () => {
    getOperaDefinition.mockReturnValue(gatedGraph())
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'side-quest',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'ask', tags: {}, log: [], awaiting: 'link' },
        },
      ],
    })

    await OperaService.recordOperaAction(client, PLAYER_ID, 'execute_command', {
      command: 'help',
      args: [],
    })

    const row = client.state.instances.find((i) => i.id === 10)
    expect(row.state.currentNodeId).toBe('thanks')
    expect(row.state.awaiting).toBe('link')
  })

  // Regression test for a bug where the mission gate's own resolution
  // nulled `action` before the very same pass's outgoing-link check ran,
  // so an action_performed/complete_quest edge sitting right after a
  // mission node -- the "advance on this mission finishing, scope: any"
  // pattern the-machine-messiah.json uses seven times -- could never be
  // satisfied by its own mission's completion. It only ever looked like it
  // "eventually worked" because scope: any also matches any *other*
  // mission's complete_quest event landing on the same in-progress
  // instance later.
  test('advances past a mission gate in the same pass its own completion satisfies an action_performed edge', async () => {
    getOperaDefinition.mockReturnValue({
      id: 'side-quest',
      title: 'Side Quest',
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'the-job', type: 'mission', mission: { title: 'Do The Job' } },
        { id: 'thanks', type: 'story', text: 'Thanks.' },
      ],
      links: [
        { id: 'start--the-job', from: 'start', to: 'the-job', conditions: [] },
        {
          id: 'the-job--thanks',
          from: 'the-job',
          to: 'thanks',
          conditions: [
            {
              type: 'action_performed',
              params: { actionType: 'complete_quest', match: { scope: 'any' } },
            },
          ],
        },
      ],
    })
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'side-quest',
          slot_index: 0,
          status: 'in_progress',
          state: {
            currentNodeId: 'the-job',
            tags: {},
            log: [],
            awaiting: 'mission',
            pendingMissionTemplateId: 42,
          },
        },
      ],
    })

    // A failed outcome specifically: this is the case that shipped broken --
    // the opera looked like it only ever "eventually" recovered after some
    // unrelated mission completed elsewhere.
    await OperaService.recordOperaAction(client, PLAYER_ID, 'complete_quest', {
      templateId: 42,
      outcome: 'failure',
      outcomeLabel: 'FAILURE',
    })

    const row = client.state.instances.find((i) => i.id === 10)
    expect(row.state.currentNodeId).toBe('thanks')
    expect(row.state.awaiting).toBe('link')
  })

  test('leaves an instance untouched when the action does not match its pending gate', async () => {
    getOperaDefinition.mockReturnValue(gatedGraph())
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'side-quest',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'ask', tags: {}, log: [], awaiting: 'link' },
        },
      ],
    })

    await OperaService.recordOperaAction(client, PLAYER_ID, 'execute_command', {
      command: 'split-v',
      args: [],
    })

    const row = client.state.instances.find((i) => i.id === 10)
    expect(row.state.currentNodeId).toBe('ask')
  })

  test('never throws, even when the instance references a removed template', async () => {
    getOperaDefinition.mockReturnValue(null)
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'gone',
          slot_index: 0,
          status: 'in_progress',
          state: {},
        },
      ],
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
      instances: [
        {
          id: 20,
          player_id: PLAYER_ID,
          template_id: 'decision',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'start', awaiting: null },
        },
      ],
    })

    const result = await OperaService.resolveChoice(client, PLAYER_ID, 20, 'a')
    expect(result).toEqual({ error: 'No pending choice' })
  })

  test('rejects an option id that is not on the pending choice', async () => {
    getOperaDefinition.mockReturnValue(choiceGraph())
    const client = createFakeClient({
      instances: [
        {
          id: 20,
          player_id: PLAYER_ID,
          template_id: 'decision',
          slot_index: 0,
          status: 'in_progress',
          state: {
            currentNodeId: 'pick',
            awaiting: 'choice',
            pendingChoice: {
              nodeId: 'pick',
              text: 'Choose.',
              options: [
                { id: 'a', label: 'Option A' },
                { id: 'b', label: 'Option B' },
              ],
            },
          },
        },
      ],
    })

    const result = await OperaService.resolveChoice(client, PLAYER_ID, 20, 'c')
    expect(result).toEqual({ error: 'Invalid option' })
  })

  test('resolves a valid choice and advances the walk to the matching ending', async () => {
    getOperaDefinition.mockReturnValue(choiceGraph())
    const client = createFakeClient({
      instances: [
        {
          id: 20,
          player_id: PLAYER_ID,
          template_id: 'decision',
          slot_index: 0,
          status: 'in_progress',
          state: {
            currentNodeId: 'pick',
            awaiting: 'choice',
            pendingChoice: {
              nodeId: 'pick',
              text: 'Choose.',
              options: [
                { id: 'a', label: 'Option A' },
                { id: 'b', label: 'Option B' },
              ],
            },
          },
        },
      ],
    })

    const result = await OperaService.resolveChoice(client, PLAYER_ID, 20, 'b')
    expect(result).toEqual({ success: true })
    const row = client.state.instances.find((i) => i.id === 20)
    expect(row.status).toBe('completed') // outcome: 'neutral' on end-b -> completed, not failed
    expect(row.state.currentNodeId).toBe('end-b')
  })
})

describe('getPendingPurchaseNeeds', () => {
  // Two links out of the same node -- a branch, not a single linear gate --
  // so a test can assert both itemNames surface at once.
  function purchaseGatedGraph() {
    return {
      id: 'shopping-quest',
      title: 'Shopping Quest',
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'buy', type: 'story', text: 'Buy something.' },
        { id: 'end', type: 'end', outcome: 'success', text: 'Done.' },
      ],
      links: [
        { id: 'start--buy', from: 'start', to: 'buy', conditions: [] },
        {
          id: 'buy--end-a',
          from: 'buy',
          to: 'end',
          conditions: [
            {
              type: 'action_performed',
              params: { actionType: 'purchase_quest_item', match: { itemName: 'Data Chip' } },
            },
          ],
        },
        {
          id: 'buy--end-b',
          from: 'buy',
          to: 'end',
          conditions: [
            {
              type: 'action_performed',
              params: { actionType: 'purchase_item', match: { itemName: 'Old Ship' } },
            },
          ],
        },
      ],
    }
  }

  test("returns the itemName pending at an instance's current node", async () => {
    getOperaDefinition.mockReturnValue(purchaseGatedGraph())
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'shopping-quest',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'buy' },
        },
      ],
    })

    const needs = await OperaService.getPendingPurchaseNeeds(client, PLAYER_ID)

    expect(needs).toEqual(new Set(['Data Chip', 'Old Ship']))
  })

  test('collects needs across multiple in-progress instances', async () => {
    getOperaDefinition.mockReturnValue(purchaseGatedGraph())
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'shopping-quest',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'buy' },
        },
        {
          id: 11,
          player_id: PLAYER_ID,
          template_id: 'shopping-quest',
          slot_index: 1,
          status: 'in_progress',
          state: { currentNodeId: 'buy' },
        },
      ],
    })

    const needs = await OperaService.getPendingPurchaseNeeds(client, PLAYER_ID)

    expect(needs).toEqual(new Set(['Data Chip', 'Old Ship']))
  })

  test('ignores a node whose gate is not a purchase action', async () => {
    getOperaDefinition.mockReturnValue(gatedGraph()) // gated on execute_command, not a purchase
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'side-quest',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'ask' },
        },
      ],
    })

    const needs = await OperaService.getPendingPurchaseNeeds(client, PLAYER_ID)

    expect(needs).toEqual(new Set())
  })

  test('returns an empty set when there are no in-progress instances', async () => {
    const client = createFakeClient({ instances: [] })

    const needs = await OperaService.getPendingPurchaseNeeds(client, PLAYER_ID)

    expect(needs).toEqual(new Set())
  })

  test('skips an instance whose template can no longer be loaded', async () => {
    getOperaDefinition.mockReturnValue(null)
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'gone',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'buy' },
        },
      ],
    })

    const needs = await OperaService.getPendingPurchaseNeeds(client, PLAYER_ID)

    expect(needs).toEqual(new Set())
  })
})

describe('maintainOperaSlots', () => {
  test('does nothing until the tutorial instance is completed', async () => {
    getGenerationPoolDefinitions.mockReturnValue([instantGraph('template-a')])
    const client = createFakeClient({
      instances: [
        {
          id: 1,
          player_id: PLAYER_ID,
          template_id: 'tutorial',
          slot_index: null,
          status: 'in_progress',
          state: {},
        },
      ],
      players: { [PLAYER_ID]: { opera_slot_capacity: 3 } },
    })

    await OperaService.maintainOperaSlots(client, PLAYER_ID)

    expect(client.state.instances).toHaveLength(1)
  })

  test('fills every empty slot up to capacity once the tutorial is completed', async () => {
    getOperaDefinition.mockImplementation((id) => instantGraph(id))
    getGenerationPoolDefinitions.mockReturnValue([
      instantGraph('template-a'),
      instantGraph('template-b'),
      instantGraph('template-c'),
    ])
    const client = createFakeClient({
      instances: [
        {
          id: 1,
          player_id: PLAYER_ID,
          template_id: 'tutorial',
          slot_index: null,
          status: 'completed',
          state: {},
        },
      ],
      players: { [PLAYER_ID]: { opera_slot_capacity: 3 } },
    })

    await OperaService.maintainOperaSlots(client, PLAYER_ID)

    const pooled = client.state.instances.filter((i) => i.slot_index !== null)
    expect(pooled).toHaveLength(3)
    expect(new Set(pooled.map((i) => i.slot_index))).toEqual(new Set([0, 1, 2]))
  })

  test('only fills the empty slots, leaving an already-active one alone', async () => {
    getOperaDefinition.mockImplementation((id) => instantGraph(id))
    getGenerationPoolDefinitions.mockReturnValue([
      instantGraph('template-a'),
      instantGraph('template-b'),
    ])
    const client = createFakeClient({
      instances: [
        {
          id: 1,
          player_id: PLAYER_ID,
          template_id: 'tutorial',
          slot_index: null,
          status: 'completed',
          state: {},
        },
        {
          id: 2,
          player_id: PLAYER_ID,
          template_id: 'template-a',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'start' },
        },
      ],
      players: { [PLAYER_ID]: { opera_slot_capacity: 2 } },
    })

    await OperaService.maintainOperaSlots(client, PLAYER_ID)

    const pooled = client.state.instances.filter((i) => i.slot_index !== null)
    expect(pooled).toHaveLength(2)
    expect(pooled.find((i) => i.slot_index === 0).id).toBe(2) // untouched
    expect(pooled.find((i) => i.slot_index === 1)).toBeTruthy() // newly filled
  })

  test('a fresh instance stopped at a gated seed node still has a visible current task', async () => {
    getOperaDefinition.mockImplementation((id) => seedGraph(id))
    getGenerationPoolDefinitions.mockReturnValue([seedGraph('template-a')])
    const client = createFakeClient({
      instances: [
        {
          id: 1,
          player_id: PLAYER_ID,
          template_id: 'tutorial',
          slot_index: null,
          status: 'completed',
          state: {},
        },
      ],
      players: { [PLAYER_ID]: { opera_slot_capacity: 1 } },
    })

    await OperaService.maintainOperaSlots(client, PLAYER_ID)

    const pooled = client.state.instances.find((i) => i.slot_index === 0)
    expect(pooled.state.awaiting).toBe('link')
    expect(pooled.state.log).toHaveLength(1)
    expect(pooled.state.log[0]).toMatchObject({
      type: 'seed',
      text: 'A rare widget appears in the shop.',
    }) // task keeps the lore note
    const seedLog = client.state.logEntries.find((e) => e.operaId === String(pooled.id))
    expect(seedLog.message).toBe('New item available in the shop.') // [SYS] log stays dry, not the note
  })
})

describe('quest-item cleanup on opera end', () => {
  // Reuses seedGraph's own 'Widget' seed node -- reaching its end node exits
  // through the exact link the seed's purchase gates, so satisfying that
  // action_performed condition is enough to drive the walk to finish().
  function reachEnd(client) {
    return OperaService.recordOperaAction(client, PLAYER_ID, 'purchase_quest_item', {
      itemName: 'Widget',
    })
  }

  test('removes a leftover quest-item consumable once its opera ends', async () => {
    getOperaDefinition.mockReturnValue(seedGraph('side-quest'))
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'side-quest',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'get-item', tags: {}, log: [], awaiting: 'link' },
        },
      ],
      shopItems: [{ name: 'Widget', is_quest_item: true }],
      consumables: [{ id: 501, player_id: PLAYER_ID, name: 'Widget', assigned_to_ship: null }],
    })

    await reachEnd(client)

    expect(client.state.instances.find((i) => i.id === 10).status).toBe('completed')
    expect(client.state.consumables).toHaveLength(0)
  })

  test('removes an unequipped leftover quest-item piece of equipment', async () => {
    getOperaDefinition.mockReturnValue(seedGraph('side-quest'))
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'side-quest',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'get-item', tags: {}, log: [], awaiting: 'link' },
        },
      ],
      shopItems: [{ name: 'Widget', is_quest_item: true }],
      equipment: [{ id: 601, player_id: PLAYER_ID, name: 'Widget', assigned_to_recruit_id: null }],
    })

    await reachEnd(client)

    expect(client.state.equipment).toHaveLength(0)
  })

  test('leaves an equipped quest item alone -- it is a reward now, not clutter', async () => {
    getOperaDefinition.mockReturnValue(seedGraph('side-quest'))
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'side-quest',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'get-item', tags: {}, log: [], awaiting: 'link' },
        },
      ],
      shopItems: [{ name: 'Widget', is_quest_item: true }],
      equipment: [{ id: 601, player_id: PLAYER_ID, name: 'Widget', assigned_to_recruit_id: 99 }],
    })

    await reachEnd(client)

    expect(client.state.equipment).toHaveLength(1)
  })

  test('leaves items alone whose name only coincidentally matches -- catalog row is not flagged is_quest_item', async () => {
    getOperaDefinition.mockReturnValue(seedGraph('side-quest'))
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'side-quest',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'get-item', tags: {}, log: [], awaiting: 'link' },
        },
      ],
      shopItems: [{ name: 'Widget', is_quest_item: false }],
      consumables: [{ id: 501, player_id: PLAYER_ID, name: 'Widget', assigned_to_ship: null }],
    })

    await reachEnd(client)

    expect(client.state.consumables).toHaveLength(1)
  })

  test('skips the sweep while a sibling in-progress instance of the same template still exists', async () => {
    getOperaDefinition.mockReturnValue(seedGraph('side-quest'))
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'side-quest',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'get-item', tags: {}, log: [], awaiting: 'link' },
        },
        {
          id: 11,
          player_id: PLAYER_ID,
          template_id: 'side-quest',
          slot_index: 1,
          status: 'in_progress',
          // awaiting 'mission' on a templateId this action can never match
          // (it only ever satisfies a 'complete_quest' action) -- keeps this
          // sibling genuinely stuck in place instead of also resolving to
          // 'end' from the very same triggering action, which would leave
          // no sibling left to protect by the time either sweep runs.
          state: {
            currentNodeId: 'get-item',
            tags: {},
            log: [],
            awaiting: 'mission',
            pendingMissionTemplateId: 999,
          },
        },
      ],
      shopItems: [{ name: 'Widget', is_quest_item: true }],
      consumables: [{ id: 501, player_id: PLAYER_ID, name: 'Widget', assigned_to_ship: null }],
    })

    await reachEnd(client)

    expect(client.state.instances.find((i) => i.id === 10).status).toBe('completed')
    expect(client.state.instances.find((i) => i.id === 11).status).toBe('in_progress')
    expect(client.state.consumables).toHaveLength(1) // instance 11 might still need it
  })

  test('a give_item effect authored anywhere in the template counts too, even on a branch this walk never took', async () => {
    getOperaDefinition.mockReturnValue({
      id: 'side-quest',
      title: 'side-quest',
      nodes: [
        { id: 'start', type: 'start' },
        {
          // No incoming link at all -- proves questItemNamesInTemplate scans
          // every authored node, not just ones this particular walk visited.
          id: 'unreached-gift',
          type: 'story',
          text: 'An alternate beat this playthrough never took.',
          effects: [{ type: 'give_item', params: { itemName: 'Gizmo' } }],
        },
        { id: 'end', type: 'end', outcome: 'success', text: 'Done.' },
      ],
      links: [{ id: 'start--end', from: 'start', to: 'end', conditions: [] }],
    })
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'side-quest',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'start', tags: {}, log: [], awaiting: 'link' },
        },
      ],
      shopItems: [{ name: 'Gizmo', is_quest_item: true }],
      consumables: [{ id: 502, player_id: PLAYER_ID, name: 'Gizmo', assigned_to_ship: 7 }],
    })

    await OperaService.recordOperaAction(client, PLAYER_ID, 'execute_command', { command: 'noop' })

    expect(client.state.instances.find((i) => i.id === 10).status).toBe('completed')
    expect(client.state.consumables).toHaveLength(0)
  })

  test('issues no new item queries for a template with no quest items at all', async () => {
    getOperaDefinition.mockReturnValue(instantGraph('plain'))
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'plain',
          slot_index: 0,
          status: 'in_progress',
          state: { currentNodeId: 'start', tags: {}, log: [], awaiting: 'link' },
        },
      ],
    })

    await OperaService.recordOperaAction(client, PLAYER_ID, 'execute_command', { command: 'noop' })

    expect(
      client.query.mock.calls.some(([sql]) => /consumables|equipment|shop_items/.test(sql)),
    ).toBe(false)
  })
})

describe('title variance', () => {
  // gatedGraph (not instantGraph) on purpose: it stops mid-walk instead of
  // completing in the same pass, so the created instance stays 'in_progress'
  // and getOperaState's own filter (see its comment: completed pooled
  // operas drop off the list) doesn't exclude it before the assertion.
  test("falls back to the template's own title when it defines no titles array", async () => {
    const def = gatedGraph({ id: 'template-a', title: 'template-a' })
    getOperaDefinition.mockImplementation((id) => (id === 'template-a' ? def : gatedGraph()))
    getGenerationPoolDefinitions.mockReturnValue([def])
    const client = createFakeClient({
      instances: [
        {
          id: 1,
          player_id: PLAYER_ID,
          template_id: 'tutorial',
          slot_index: null,
          status: 'completed',
          state: {},
        },
      ],
      players: { [PLAYER_ID]: { opera_slot_capacity: 1 } },
    })

    await OperaService.maintainOperaSlots(client, PLAYER_ID)

    const created = client.state.instances.find((i) => i.template_id === 'template-a')
    expect(created.state.title).toBe('template-a')

    const summarized = await OperaService.getOperaState(client, PLAYER_ID)
    expect(summarized.find((o) => o.templateId === 'template-a').title).toBe('template-a')
  })

  test('picks a title from [title, ...titles] at instance creation and keeps it stable', async () => {
    const def = gatedGraph({
      id: 'template-a',
      title: 'template-a',
      titles: ['Alt One', 'Alt Two'],
    })
    getOperaDefinition.mockImplementation((id) => (id === 'template-a' ? def : gatedGraph()))
    getGenerationPoolDefinitions.mockReturnValue([def])
    const client = createFakeClient({
      instances: [
        {
          id: 1,
          player_id: PLAYER_ID,
          template_id: 'tutorial',
          slot_index: null,
          status: 'completed',
          state: {},
        },
      ],
      players: { [PLAYER_ID]: { opera_slot_capacity: 1 } },
    })

    // Forces pickOne's randInt(0, 2) to land on the last candidate.
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      await OperaService.maintainOperaSlots(client, PLAYER_ID)
    } finally {
      randomSpy.mockRestore()
    }

    const created = client.state.instances.find((i) => i.template_id === 'template-a')
    expect(created.state.title).toBe('Alt Two')

    const summarized = await OperaService.getOperaState(client, PLAYER_ID)
    expect(summarized.find((o) => o.templateId === 'template-a').title).toBe('Alt Two')
  })
})

// The task list (state.log, surfaced as `tasks` by summarizeInstance) is meant
// to read as lore -- exactly what the node authors wrote. The separate [SYS]
// log stream (log_entries, surfaced by getOperaLogs) is meant to read like
// the rest of the mission log: dry and mechanical, regardless of how flavorful
// the node's authored text is. These tests pin that split down per node type.
describe('dry [SYS] log text vs. lore-heavy tasks', () => {
  test('a story node logs a dry line while its task keeps the authored lore text', async () => {
    getOperaDefinition.mockReturnValue(gatedGraph())
    const client = createFakeClient({
      instances: [
        {
          id: 10,
          player_id: PLAYER_ID,
          template_id: 'side-quest',
          slot_index: 0,
          status: 'in_progress',
          state: {},
        },
      ],
    })

    // Nothing in gatedGraph's start->ask link is gated, so any action
    // advances the walk exactly as far as the 'ask' story node and stops
    // there (its own outgoing link IS gated, on a different action).
    await OperaService.recordOperaAction(client, PLAYER_ID, 'noop_action', {})

    const row = client.state.instances.find((i) => i.id === 10)
    expect(row.state.log[0]).toMatchObject({ type: 'story', text: 'Do the thing.' })
    const storyLog = client.state.logEntries.find((e) => e.operaId === '10')
    expect(storyLog.message).toBe('Story continues.')
  })

  test('a choice node logs a dry line while its task keeps the authored lore text', async () => {
    getOperaDefinition.mockReturnValue(choiceGraph())
    const client = createFakeClient({
      instances: [
        {
          id: 20,
          player_id: PLAYER_ID,
          template_id: 'decision',
          slot_index: 0,
          status: 'in_progress',
          state: {},
        },
      ],
    })

    await OperaService.recordOperaAction(client, PLAYER_ID, 'noop_action', {})

    const row = client.state.instances.find((i) => i.id === 20)
    expect(row.state.log[0]).toMatchObject({ type: 'choice', text: 'Choose.' })
    const choiceLog = client.state.logEntries.find((e) => e.operaId === '20')
    expect(choiceLog.message).toBe('Decision required.')
  })

  test.each([
    ['a', 'success', 'Opera completed.'],
    ['b', 'neutral', 'Opera concluded.'],
  ])(
    'an end node with outcome %s logs a dry, outcome-specific line while its task keeps the lore text',
    async (optionId, outcome, dryText) => {
      getOperaDefinition.mockReturnValue(choiceGraph())
      const client = createFakeClient({
        instances: [
          {
            id: 20,
            player_id: PLAYER_ID,
            template_id: 'decision',
            slot_index: 0,
            status: 'in_progress',
            state: {
              currentNodeId: 'pick',
              awaiting: 'choice',
              pendingChoice: {
                nodeId: 'pick',
                text: 'Choose.',
                options: [
                  { id: 'a', label: 'Option A' },
                  { id: 'b', label: 'Option B' },
                ],
              },
            },
          },
        ],
      })

      await OperaService.resolveChoice(client, PLAYER_ID, 20, optionId)

      const row = client.state.instances.find((i) => i.id === 20)
      expect(row.state.currentNodeId).toBe(optionId === 'a' ? 'end-a' : 'end-b')
      const endLog = client.state.logEntries.find(
        (e) => e.operaId === '20' && e.message.startsWith('Opera'),
      )
      expect(endLog.message).toBe(dryText)
    },
  )

  test('an end node with outcome "failure" logs "Opera failed."', async () => {
    getOperaDefinition.mockReturnValue({
      id: 'doomed',
      title: 'Doomed',
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'end', type: 'end', outcome: 'failure', text: 'It all went wrong.' },
      ],
      links: [{ id: 'start--end', from: 'start', to: 'end', conditions: [] }],
    })
    const client = createFakeClient({
      instances: [
        {
          id: 30,
          player_id: PLAYER_ID,
          template_id: 'doomed',
          slot_index: 0,
          status: 'in_progress',
          state: {},
        },
      ],
    })

    await OperaService.recordOperaAction(client, PLAYER_ID, 'noop_action', {})

    const row = client.state.instances.find((i) => i.id === 30)
    expect(row.status).toBe('failed')
    const endLog = client.state.logEntries.find((e) => e.operaId === '30')
    expect(endLog.message).toBe('Opera failed.')
  })
})

describe('resolveTags', () => {
  // Exercises the real dataLoader/missionGenerator pipeline (not mocked --
  // operaLoader is the only thing this file mocks, and resolveTags never
  // touches it), against the game's actual mission-types.json. Regression
  // test for the bug where a template's tag only rendered if the one
  // randomly-drawn mission type happened to publish it (e.g. only HEIST
  // out of 6 types published securityGroupName, so a template using it
  // rendered literally ~5 times out of 6). Run repeatedly since the primary
  // draw is random -- every run must independently show full coverage, not
  // just "eventually" across runs.
  const missionTypes = require('../data/mission-types.json')
  const allProvidedKeys = [...new Set(missionTypes.flatMap((mt) => Object.keys(mt.provides)))]

  test('every tag key any mission type can provide is resolved on every run', () => {
    for (let i = 0; i < 20; i++) {
      const tags = OperaService.resolveTags()
      for (const key of allProvidedKeys) {
        expect(tags[key]).toBeTruthy()
      }
    }
  })
})
