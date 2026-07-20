// Exercises opera.service.js against a small in-memory fake Postgres client
// keyed by normalized SQL text, mirroring the style used by self.service.test.js
// and the *.flow.test.js suites. Opera definitions are supplied via a mocked
// operaLoader rather than the real server/data/operas/*.json content, so
// these tests don't drift if the real tutorial content changes.

jest.mock('../src/operaLoader')
const { getOperaDefinition, getAllOperaDefinitions } = require('../src/operaLoader')
const OperaService = require('../src/services/opera.service')

const PLAYER_ID = 1

function makeDefinition(overrides = {}) {
  return {
    id: 'tutorial',
    title: 'Basic Operations',
    description: 'A guided walkthrough.',
    auto_start: true,
    step_order: 'sequential',
    on_start_message: 'Welcome aboard.',
    on_complete_message: 'Training complete.',
    steps: [
      { id: 'step-a', type: 'hire_recruit', description: 'Hire a recruit.', on_start_message: 'Go hire someone.', on_complete_message: 'Recruit hired.', match: { scope: 'any' } },
      { id: 'step-b', type: 'execute_command', description: 'Say help.', on_start_message: 'Type help.', on_complete_message: '', match: { command: 'help' } },
    ],
    ...overrides,
  }
}

function createFakeClient() {
  const state = {
    instances: new Map(), // `${playerId}:${operaId}` -> { status, started_at, completed_at }
    progress: new Set(),  // `${playerId}:${operaId}:${stepId}`
    logs: [],              // { playerId, tag, message, missionId, operaId }
  }

  const query = jest.fn(async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim()

    if (s.startsWith("SELECT * FROM opera_instances WHERE player_id = $1 AND status = 'in_progress'")) {
      const [playerId] = params
      const rows = [...state.instances.entries()]
        .filter(([key, value]) => key.startsWith(`${playerId}:`) && value.status === 'in_progress')
        .map(([key, value]) => ({ player_id: playerId, opera_id: key.split(':')[1], ...value }))
      return { rows }
    }

    if (s.startsWith('SELECT * FROM opera_instances WHERE player_id = $1')) {
      const [playerId] = params
      const rows = [...state.instances.entries()]
        .filter(([key]) => key.startsWith(`${playerId}:`))
        .map(([key, value]) => ({ player_id: playerId, opera_id: key.split(':')[1], ...value }))
      return { rows }
    }

    if (s.startsWith('SELECT 1 FROM opera_instances WHERE player_id = $1 AND opera_id = $2')) {
      const [playerId, operaId] = params
      return { rows: state.instances.has(`${playerId}:${operaId}`) ? [{ '?column?': 1 }] : [] }
    }

    if (s.startsWith('SELECT step_id FROM opera_step_progress WHERE player_id = $1 AND opera_id = $2')) {
      const [playerId, operaId] = params
      const rows = [...state.progress]
        .filter(key => key.startsWith(`${playerId}:${operaId}:`))
        .map(key => ({ step_id: key.split(':')[2] }))
      return { rows }
    }

    if (s.startsWith('SELECT opera_id, step_id FROM opera_step_progress WHERE player_id = $1')) {
      const [playerId] = params
      const rows = [...state.progress]
        .filter(key => key.startsWith(`${playerId}:`))
        .map(key => {
          const [, operaId, stepId] = key.split(':')
          return { opera_id: operaId, step_id: stepId }
        })
      return { rows }
    }

    if (s.startsWith('INSERT INTO opera_instances')) {
      const [playerId, operaId] = params
      const key = `${playerId}:${operaId}`
      if (!state.instances.has(key)) {
        state.instances.set(key, { status: 'in_progress', started_at: new Date(), completed_at: null })
      }
      return { rows: [] }
    }

    if (s.startsWith('INSERT INTO opera_step_progress')) {
      const [playerId, operaId, stepId] = params
      state.progress.add(`${playerId}:${operaId}:${stepId}`)
      return { rows: [] }
    }

    if (s.startsWith("UPDATE opera_instances SET status = 'completed'")) {
      const [playerId, operaId] = params
      const key = `${playerId}:${operaId}`
      const existing = state.instances.get(key)
      state.instances.set(key, { ...existing, status: 'completed', completed_at: new Date() })
      return { rows: [] }
    }

    if (s.startsWith('INSERT INTO log_entries')) {
      const [playerId, tag, message, missionId, operaId] = params
      state.logs.push({ playerId, tag, message, missionId, operaId })
      return { rows: [] }
    }

    if (s.startsWith('SELECT tag, message, opera_id AS "operaId" FROM log_entries')) {
      const [playerId] = params
      const rows = state.logs
        .filter(l => l.playerId === playerId && l.operaId != null)
        .map(l => ({ tag: l.tag, message: l.message, operaId: l.operaId }))
      return { rows }
    }

    throw new Error(`Query not handled by the fake test client: ${s}`)
  })

  return { client: { query }, state }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('ensureOperasForPlayer', () => {
  test('starts every auto_start opera exactly once, logging the opera and first-step start messages', async () => {
    getAllOperaDefinitions.mockReturnValue([makeDefinition()])
    const { client, state } = createFakeClient()

    await OperaService.ensureOperasForPlayer(client, PLAYER_ID)

    expect(state.instances.get(`${PLAYER_ID}:tutorial`).status).toBe('in_progress')
    expect(state.logs.map(l => l.message)).toEqual(['Welcome aboard.', 'Go hire someone.'])
  })

  test('is idempotent: calling twice does not duplicate the instance or logs', async () => {
    getAllOperaDefinitions.mockReturnValue([makeDefinition()])
    const { client, state } = createFakeClient()

    await OperaService.ensureOperasForPlayer(client, PLAYER_ID)
    await OperaService.ensureOperasForPlayer(client, PLAYER_ID)

    expect(state.instances.size).toBe(1)
    expect(state.logs.length).toBe(2)
  })

  test('skips operas with auto_start false', async () => {
    getAllOperaDefinitions.mockReturnValue([makeDefinition({ id: 'side-quest', auto_start: false })])
    const { client, state } = createFakeClient()

    await OperaService.ensureOperasForPlayer(client, PLAYER_ID)

    expect(state.instances.size).toBe(0)
  })

  test('swallows a DB error instead of throwing', async () => {
    getAllOperaDefinitions.mockReturnValue([makeDefinition()])
    const client = { query: jest.fn().mockRejectedValue(new Error('boom')) }

    await expect(OperaService.ensureOperasForPlayer(client, PLAYER_ID)).resolves.toBeUndefined()
  })
})

describe('recordOperaAction', () => {
  test('completes the current sequential step and announces the next one', async () => {
    const definition = makeDefinition()
    getAllOperaDefinitions.mockReturnValue([definition])
    getOperaDefinition.mockReturnValue(definition)
    const { client, state } = createFakeClient()
    await OperaService.ensureOperasForPlayer(client, PLAYER_ID)
    state.logs.length = 0 // isolate this action's log output

    await OperaService.recordOperaAction(client, PLAYER_ID, 'hire_recruit', {})

    expect(state.progress.has(`${PLAYER_ID}:tutorial:step-a`)).toBe(true)
    expect(state.logs.map(l => l.message)).toEqual(['Recruit hired.', 'Type help.'])
  })

  test('ignores an action that does not match the currently listening step', async () => {
    const definition = makeDefinition()
    getAllOperaDefinitions.mockReturnValue([definition])
    getOperaDefinition.mockReturnValue(definition)
    const { client, state } = createFakeClient()
    await OperaService.ensureOperasForPlayer(client, PLAYER_ID)

    // step-a (hire_recruit) is current; execute_command shouldn't match yet.
    await OperaService.recordOperaAction(client, PLAYER_ID, 'execute_command', { command: 'help' })

    expect(state.progress.size).toBe(0)
  })

  test('completes the opera once every step is done, printing no line for an empty on_complete_message', async () => {
    const definition = makeDefinition()
    getAllOperaDefinitions.mockReturnValue([definition])
    getOperaDefinition.mockReturnValue(definition)
    const { client, state } = createFakeClient()
    await OperaService.ensureOperasForPlayer(client, PLAYER_ID)
    await OperaService.recordOperaAction(client, PLAYER_ID, 'hire_recruit', {})
    state.logs.length = 0

    await OperaService.recordOperaAction(client, PLAYER_ID, 'execute_command', { command: 'help' })

    expect(state.instances.get(`${PLAYER_ID}:tutorial`).status).toBe('completed')
    // step-b's on_complete_message is '' (silent); only the opera's closing line prints.
    expect(state.logs.map(l => l.message)).toEqual(['Training complete.'])
  })

  test('never throws, even against a client that rejects every query', async () => {
    getAllOperaDefinitions.mockReturnValue([makeDefinition()])
    getOperaDefinition.mockReturnValue(makeDefinition())
    const client = { query: jest.fn().mockRejectedValue(new Error('boom')) }

    await expect(OperaService.recordOperaAction(client, PLAYER_ID, 'hire_recruit', {})).resolves.toBeUndefined()
  })
})

describe('startOpera', () => {
  test('rejects starting an auto_start opera manually', async () => {
    getOperaDefinition.mockReturnValue(makeDefinition())
    const { client } = createFakeClient()

    const result = await OperaService.startOpera(client, PLAYER_ID, 'tutorial')

    expect(result).toEqual({ error: 'This opera starts automatically' })
  })

  test('rejects an unknown opera id', async () => {
    getOperaDefinition.mockReturnValue(null)
    const { client } = createFakeClient()

    const result = await OperaService.startOpera(client, PLAYER_ID, 'does-not-exist')

    expect(result).toEqual({ error: 'Opera not found' })
  })

  test('starts an opt-in opera and rejects a second start', async () => {
    const definition = makeDefinition({ id: 'side-quest', auto_start: false })
    getOperaDefinition.mockReturnValue(definition)
    const { client, state } = createFakeClient()

    const first = await OperaService.startOpera(client, PLAYER_ID, 'side-quest')
    expect(first).toEqual({ success: true })
    expect(state.instances.get(`${PLAYER_ID}:side-quest`).status).toBe('in_progress')

    const second = await OperaService.startOpera(client, PLAYER_ID, 'side-quest')
    expect(second).toEqual({ error: 'Opera already started' })
  })
})

describe('getOperaState', () => {
  test('reports status "new" for a definition with no instance row yet, and step completion from progress', async () => {
    const definition = makeDefinition({ auto_start: false })
    getAllOperaDefinitions.mockReturnValue([definition])
    getOperaDefinition.mockReturnValue(definition)
    const { client } = createFakeClient()

    const state = await OperaService.getOperaState(client, PLAYER_ID)

    expect(state).toEqual([{
      id: 'tutorial',
      title: 'Basic Operations',
      description: 'A guided walkthrough.',
      autoStart: false,
      stepOrder: 'sequential',
      status: 'new',
      steps: [
        { id: 'step-a', description: 'Hire a recruit.', completed: false },
        { id: 'step-b', description: 'Say help.', completed: false },
      ],
    }])
  })

  test('reflects in_progress status and per-step completion after actions', async () => {
    const definition = makeDefinition()
    getAllOperaDefinitions.mockReturnValue([definition])
    getOperaDefinition.mockReturnValue(definition)
    const { client } = createFakeClient()
    await OperaService.ensureOperasForPlayer(client, PLAYER_ID)
    await OperaService.recordOperaAction(client, PLAYER_ID, 'hire_recruit', {})

    const state = await OperaService.getOperaState(client, PLAYER_ID)

    expect(state[0].status).toBe('in_progress')
    expect(state[0].steps).toEqual([
      { id: 'step-a', description: 'Hire a recruit.', completed: true },
      { id: 'step-b', description: 'Say help.', completed: false },
    ])
  })
})

describe('getOperaLogs', () => {
  test('partitions log_entries by opera_id', async () => {
    const definition = makeDefinition()
    getAllOperaDefinitions.mockReturnValue([definition])
    const { client } = createFakeClient()
    await OperaService.ensureOperasForPlayer(client, PLAYER_ID)

    const logs = await OperaService.getOperaLogs(client, PLAYER_ID)

    expect(logs).toEqual({
      tutorial: [
        { tag: '[SYS]', message: 'Welcome aboard.' },
        { tag: '[SYS]', message: 'Go hire someone.' },
      ],
    })
  })
})
