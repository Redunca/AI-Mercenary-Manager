const request = require('supertest')
const { app } = require('../index')
const GameService = require('../src/services/game.service')

jest.mock('../src/db/pool')
jest.mock('../src/services/game.service')

describe('Game Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/game/state', () => {
    test("returns the current game state", async () => {
      const mockState = { recruits: [], candidates: [], missions: [] }
      GameService.getGameState.mockResolvedValue(mockState)

      const res = await request(app).get('/api/game/state')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(mockState)
    })

    test('returns 500 if the service fails', async () => {
      GameService.getGameState.mockRejectedValue(new Error('DB unavailable'))

      const res = await request(app).get('/api/game/state')

      expect(res.status).toBe(500)
    })
  })

  describe('POST /api/game/sync', () => {
    test("triggers the sync and returns the updated state", async () => {
      const mockState = { recruits: [], candidates: [], missions: [] }
      GameService.syncGame.mockResolvedValue(mockState)

      const res = await request(app).post('/api/game/sync')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(mockState)
      expect(GameService.syncGame).toHaveBeenCalledTimes(1)
    })
  })

  describe('POST /api/game/candidates/refresh', () => {
    test('refreshes the candidates with the provided count', async () => {
      GameService.refreshCandidates.mockResolvedValue({ state: { candidates: [] } })

      const res = await request(app)
        .post('/api/game/candidates/refresh')
        .send({ count: 3 })

      expect(res.status).toBe(200)
      expect(GameService.refreshCandidates).toHaveBeenCalledWith(3)
    })

    test('uses 5 by default when no count is provided', async () => {
      GameService.refreshCandidates.mockResolvedValue({ state: {} })

      await request(app).post('/api/game/candidates/refresh').send({})

      expect(GameService.refreshCandidates).toHaveBeenCalledWith(5)
    })
  })

  describe('PATCH /api/game/recruits/:id', () => {
    test('renames the recruit', async () => {
      const recruit = { id: '1', name: 'New Name' }
      GameService.renameRecruit.mockResolvedValue({ recruit, state: {} })

      const res = await request(app)
        .patch('/api/game/recruits/1')
        .send({ name: 'New Name' })

      expect(res.status).toBe(200)
      expect(res.body.recruit).toEqual(recruit)
      expect(GameService.renameRecruit).toHaveBeenCalledWith('1', 'New Name')
    })

    test('returns 400 if the recruit cannot be found', async () => {
      GameService.renameRecruit.mockResolvedValue({ error: 'Recruit not found' })

      const res = await request(app)
        .patch('/api/game/recruits/999')
        .send({ name: 'X' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Recruit not found')
    })
  })

  describe('POST /api/game/candidates/:id/hire', () => {
    test('recruits the candidate', async () => {
      const recruit = { id: '2', status: 'available' }
      GameService.hireCandidate.mockResolvedValue({ recruit, state: {} })

      const res = await request(app).post('/api/game/candidates/2/hire')

      expect(res.status).toBe(200)
      expect(res.body.recruit).toEqual(recruit)
      expect(GameService.hireCandidate).toHaveBeenCalledWith('2')
    })

    test('returns 400 when recruitment fails', async () => {
      GameService.hireCandidate.mockResolvedValue({ error: 'Recruitment failed' })

      const res = await request(app).post('/api/game/candidates/2/hire')

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Recruitment failed')
    })
  })

  describe('GET /api/game/missions/history', () => {
    test('returns the full mission history', async () => {
      const mockHistory = [
        { id: 1, name: 'Test Mission', status: 'success', assignedShipId: 5 },
        { id: 2, name: 'Other Mission', status: 'failed', assignedShipId: 7 },
      ]
      GameService.getMissionHistory.mockResolvedValue(mockHistory)

      const res = await request(app).get('/api/game/missions/history')

      expect(res.status).toBe(200)
      expect(res.body.missions).toEqual(mockHistory)
      expect(GameService.getMissionHistory).toHaveBeenCalledTimes(1)
    })

    test('returns 500 if the service fails', async () => {
      GameService.getMissionHistory.mockRejectedValue(new Error('DB unavailable'))

      const res = await request(app).get('/api/game/missions/history')

      expect(res.status).toBe(500)
    })
  })

  describe('POST /api/game/missions/:templateId/start', () => {
    test('starts a mission with a valid ship', async () => {
      GameService.startMission.mockResolvedValue({ state: {} })

      const res = await request(app)
        .post('/api/game/missions/1/start')
        .send({ shipId: 1 })

      expect(res.status).toBe(200)
      expect(GameService.startMission).toHaveBeenCalledWith(1, 1)
    })

    test('converts templateId and shipId to numbers', async () => {
      GameService.startMission.mockResolvedValue({ state: {} })

      await request(app).post('/api/game/missions/7/start').send({ shipId: '3' })

      expect(GameService.startMission).toHaveBeenCalledWith(7, 3)
    })

    test('returns 400 when the service reports an error', async () => {
      GameService.startMission.mockResolvedValue({ error: 'Mission not found' })

      const res = await request(app)
        .post('/api/game/missions/999/start')
        .send({ shipId: 1 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Mission not found')
    })
  })

  describe('POST /api/game/missions/:templateId/stop', () => {
    test('stops the mission in progress', async () => {
      GameService.stopMission.mockResolvedValue({ state: {} })

      const res = await request(app).post('/api/game/missions/1/stop')

      expect(res.status).toBe(200)
      expect(GameService.stopMission).toHaveBeenCalledWith(1)
    })

    test('returns 400 if no active mission matches', async () => {
      GameService.stopMission.mockResolvedValue({ error: 'No active mission' })

      const res = await request(app).post('/api/game/missions/1/stop')

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/game/missions/:templateId/logs', () => {
    test('returns the mission logs', async () => {
      const mockLogs = [
        { tag: '[SYS]', message: 'Mission departure' },
        { tag: '[COMBAT]', message: 'Combat victory' },
      ]
      GameService.getMissionLogs.mockResolvedValue(mockLogs)

      const res = await request(app).get('/api/game/missions/1/logs')

      expect(res.status).toBe(200)
      expect(res.body.logs).toEqual(mockLogs)
      expect(GameService.getMissionLogs).toHaveBeenCalledWith(1)
    })

    test('returns an empty array if there are no logs', async () => {
      GameService.getMissionLogs.mockResolvedValue([])

      const res = await request(app).get('/api/game/missions/99/logs')

      expect(res.status).toBe(200)
      expect(res.body.logs).toEqual([])
    })
  })

  describe('POST /api/game/missions/:templateId/force-return', () => {
    test('triggers the forced return', async () => {
      GameService.forceReturnMission.mockResolvedValue({ state: {} })

      const res = await request(app).post('/api/game/missions/1/force-return')

      expect(res.status).toBe(200)
      expect(GameService.forceReturnMission).toHaveBeenCalledWith(1)
    })

    test('returns an error if the mission cannot be found', async () => {
      GameService.forceReturnMission.mockResolvedValue({ error: 'Mission not found' })

      const res = await request(app).post('/api/game/missions/99/force-return')

      expect(res.status).toBe(400)
      expect(res.body.error).toBeDefined()
    })
  })
})
