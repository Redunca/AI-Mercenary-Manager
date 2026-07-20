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
    test('returns the full catalog + player state', async () => {
      OperaService.getOperaState.mockResolvedValue([{ id: 'tutorial', status: 'in_progress', steps: [] }])

      const res = await request(app).get('/api/opera')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([{ id: 'tutorial', status: 'in_progress', steps: [] }])
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })
  })

  describe('GET /api/opera/:id', () => {
    test('returns the opera with its logs attached', async () => {
      OperaService.getOperaState.mockResolvedValue([{ id: 'tutorial', status: 'in_progress', steps: [] }])
      OperaService.getOperaLogs.mockResolvedValue({ tutorial: [{ tag: '[SYS]', message: 'Welcome' }] })

      const res = await request(app).get('/api/opera/tutorial')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: 'tutorial', status: 'in_progress', steps: [],
        logs: [{ tag: '[SYS]', message: 'Welcome' }],
      })
    })

    test('returns 404 for an unknown opera id', async () => {
      OperaService.getOperaState.mockResolvedValue([])

      const res = await request(app).get('/api/opera/does-not-exist')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Opera not found')
    })
  })

  describe('POST /api/opera/:id/start', () => {
    test('starts an opt-in opera', async () => {
      OperaService.startOpera.mockResolvedValue({ success: true })

      const res = await request(app).post('/api/opera/side-quest/start').send({})

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ success: true })
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
    })

    test('rolls back and returns 400 on error', async () => {
      OperaService.startOpera.mockResolvedValue({ error: 'Opera already started' })

      const res = await request(app).post('/api/opera/tutorial/start').send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Opera already started')
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
    })
  })

  describe('POST /api/opera/command', () => {
    test('records the command and always responds 200', async () => {
      OperaService.recordOperaAction.mockResolvedValue(undefined)

      const res = await request(app).post('/api/opera/command').send({ command: 'split-v', args: [] })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(OperaService.recordOperaAction).toHaveBeenCalledWith(
        mockClient, 1, 'execute_command', { command: 'split-v', args: [] },
      )
    })

    test('ignores a request with no command string', async () => {
      const res = await request(app).post('/api/opera/command').send({})

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(OperaService.recordOperaAction).not.toHaveBeenCalled()
    })
  })
})
