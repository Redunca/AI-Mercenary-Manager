const request = require('supertest')
const { app } = require('../index')
const OperaService = require('../src/services/opera.service')

jest.mock('../src/services/opera.service')
jest.mock('../src/db/pool', () => {
  const mockClient = { query: jest.fn(), release: jest.fn() }
  return { pool: { connect: jest.fn().mockResolvedValue(mockClient) } }
})

const { pool } = require('../src/db/pool')

describe('Opera Routes', () => {
  let mockClient

  beforeEach(async () => {
    jest.clearAllMocks()
    mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }
    pool.connect.mockResolvedValue(mockClient)
  })

  describe('GET /api/opera', () => {
    test('returns the tutorial + every active slot', async () => {
      OperaService.getOperaState.mockResolvedValue([{ id: '1', templateId: 'tutorial', status: 'in_progress', tasks: [] }])

      const res = await request(app).get('/api/opera')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([{ id: '1', templateId: 'tutorial', status: 'in_progress', tasks: [] }])
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })
  })

  describe('GET /api/opera/:id', () => {
    test('returns the opera with its logs attached', async () => {
      OperaService.getOperaState.mockResolvedValue([{ id: '1', templateId: 'tutorial', status: 'in_progress', tasks: [] }])
      OperaService.getOperaLogs.mockResolvedValue({ 1: [{ tag: '[SYS]', message: 'Welcome' }] })

      const res = await request(app).get('/api/opera/1')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: '1', templateId: 'tutorial', status: 'in_progress', tasks: [],
        logs: [{ tag: '[SYS]', message: 'Welcome' }],
      })
    })

    test('returns 404 for an unknown opera id', async () => {
      OperaService.getOperaState.mockResolvedValue([])

      const res = await request(app).get('/api/opera/999')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Opera not found')
    })
  })

  describe('POST /api/opera/:id/choose', () => {
    test('resolves a pending choice', async () => {
      OperaService.resolveChoice.mockResolvedValue({ success: true })

      const res = await request(app).post('/api/opera/2/choose').send({ optionId: 'alliance' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ success: true })
      expect(OperaService.resolveChoice).toHaveBeenCalledWith(mockClient, 1, 2, 'alliance')
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
    })

    test('rolls back and returns 400 on error', async () => {
      OperaService.resolveChoice.mockResolvedValue({ error: 'No pending choice' })

      const res = await request(app).post('/api/opera/2/choose').send({ optionId: 'alliance' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('No pending choice')
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
    })
  })

  describe('POST /api/opera/command', () => {
    // Returns the fresh opera state/logs (not just {ok:true}) so the client
    // can apply a step this command just completed without waiting on an
    // unrelated sync -- see opera.routes.js's own comment on this route.
    test('records the command, always responds 200, and returns fresh opera state', async () => {
      OperaService.recordOperaAction.mockResolvedValue(undefined)
      OperaService.getOperaState.mockResolvedValue([{ id: '1', templateId: 'tutorial', status: 'in_progress', tasks: [] }])
      OperaService.getOperaLogs.mockResolvedValue({ 1: [{ tag: '[SYS]', message: 'Panel split vertically.' }] })

      const res = await request(app).post('/api/opera/command').send({ command: 'split-v', args: [] })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        ok: true,
        operas: [{ id: '1', templateId: 'tutorial', status: 'in_progress', tasks: [] }],
        operaLogs: { 1: [{ tag: '[SYS]', message: 'Panel split vertically.' }] },
      })
      expect(OperaService.recordOperaAction).toHaveBeenCalledWith(
        mockClient, 1, 'execute_command', { command: 'split-v', args: [] },
      )
    })

    test('ignores a request with no command string, but still returns opera state', async () => {
      OperaService.getOperaState.mockResolvedValue([])
      OperaService.getOperaLogs.mockResolvedValue({})

      const res = await request(app).post('/api/opera/command').send({})

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true, operas: [], operaLogs: {} })
      expect(OperaService.recordOperaAction).not.toHaveBeenCalled()
    })
  })
})
