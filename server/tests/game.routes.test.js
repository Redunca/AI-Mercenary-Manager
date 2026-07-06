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
    test("retourne l'état courant de la partie", async () => {
      const mockState = { recruits: [], candidates: [], missions: [] }
      GameService.getGameState.mockResolvedValue(mockState)

      const res = await request(app).get('/api/game/state')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(mockState)
    })

    test('renvoie 500 si le service échoue', async () => {
      GameService.getGameState.mockRejectedValue(new Error('DB indisponible'))

      const res = await request(app).get('/api/game/state')

      expect(res.status).toBe(500)
    })
  })

  describe('POST /api/game/sync', () => {
    test("déclenche la synchronisation et retourne l'état à jour", async () => {
      const mockState = { recruits: [], candidates: [], missions: [] }
      GameService.syncGame.mockResolvedValue(mockState)

      const res = await request(app).post('/api/game/sync')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(mockState)
      expect(GameService.syncGame).toHaveBeenCalledTimes(1)
    })
  })

  describe('POST /api/game/candidates/refresh', () => {
    test('renouvelle les candidats avec le nombre fourni', async () => {
      GameService.refreshCandidates.mockResolvedValue({ state: { candidates: [] } })

      const res = await request(app)
        .post('/api/game/candidates/refresh')
        .send({ count: 3 })

      expect(res.status).toBe(200)
      expect(GameService.refreshCandidates).toHaveBeenCalledWith(3)
    })

    test('utilise 5 par défaut quand aucun compte n\'est fourni', async () => {
      GameService.refreshCandidates.mockResolvedValue({ state: {} })

      await request(app).post('/api/game/candidates/refresh').send({})

      expect(GameService.refreshCandidates).toHaveBeenCalledWith(5)
    })
  })

  describe('PATCH /api/game/recruits/:id', () => {
    test('renomme la recrue', async () => {
      const recruit = { id: '1', name: 'Nouveau Nom' }
      GameService.renameRecruit.mockResolvedValue({ recruit, state: {} })

      const res = await request(app)
        .patch('/api/game/recruits/1')
        .send({ name: 'Nouveau Nom' })

      expect(res.status).toBe(200)
      expect(res.body.recruit).toEqual(recruit)
      expect(GameService.renameRecruit).toHaveBeenCalledWith('1', 'Nouveau Nom')
    })

    test('retourne 400 si la recrue est introuvable', async () => {
      GameService.renameRecruit.mockResolvedValue({ error: 'Recrue introuvable' })

      const res = await request(app)
        .patch('/api/game/recruits/999')
        .send({ name: 'X' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Recrue introuvable')
    })
  })

  describe('POST /api/game/candidates/:id/hire', () => {
    test('recrute le candidat', async () => {
      const recruit = { id: '2', status: 'available' }
      GameService.hireCandidate.mockResolvedValue({ recruit, state: {} })

      const res = await request(app).post('/api/game/candidates/2/hire')

      expect(res.status).toBe(200)
      expect(res.body.recruit).toEqual(recruit)
      expect(GameService.hireCandidate).toHaveBeenCalledWith('2')
    })

    test('retourne 400 quand le recrutement est impossible', async () => {
      GameService.hireCandidate.mockResolvedValue({ error: 'Recrutement impossible' })

      const res = await request(app).post('/api/game/candidates/2/hire')

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Recrutement impossible')
    })
  })

  describe('POST /api/game/missions/:templateId/start', () => {
    test('démarre une mission avec un vaisseau valide', async () => {
      GameService.startMission.mockResolvedValue({ state: {} })

      const res = await request(app)
        .post('/api/game/missions/1/start')
        .send({ shipId: 1 })

      expect(res.status).toBe(200)
      expect(GameService.startMission).toHaveBeenCalledWith(1, 1)
    })

    test('convertit templateId et shipId en nombres', async () => {
      GameService.startMission.mockResolvedValue({ state: {} })

      await request(app).post('/api/game/missions/7/start').send({ shipId: '3' })

      expect(GameService.startMission).toHaveBeenCalledWith(7, 3)
    })

    test('retourne 400 quand le service signale une erreur', async () => {
      GameService.startMission.mockResolvedValue({ error: 'Mission introuvable' })

      const res = await request(app)
        .post('/api/game/missions/999/start')
        .send({ shipId: 1 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Mission introuvable')
    })
  })

  describe('POST /api/game/missions/:templateId/stop', () => {
    test('arrête la mission en cours', async () => {
      GameService.stopMission.mockResolvedValue({ state: {} })

      const res = await request(app).post('/api/game/missions/1/stop')

      expect(res.status).toBe(200)
      expect(GameService.stopMission).toHaveBeenCalledWith(1)
    })

    test('retourne 400 si aucune mission active ne correspond', async () => {
      GameService.stopMission.mockResolvedValue({ error: 'Aucune mission active' })

      const res = await request(app).post('/api/game/missions/1/stop')

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/game/missions/:templateId/logs', () => {
    test('retourne les logs de la mission', async () => {
      const mockLogs = [
        { tag: '[SYS]', message: 'Départ en mission' },
        { tag: '[COMBAT]', message: 'Victoire au combat' },
      ]
      GameService.getMissionLogs.mockResolvedValue(mockLogs)

      const res = await request(app).get('/api/game/missions/1/logs')

      expect(res.status).toBe(200)
      expect(res.body.logs).toEqual(mockLogs)
      expect(GameService.getMissionLogs).toHaveBeenCalledWith(1)
    })

    test('retourne un tableau vide si aucun log', async () => {
      GameService.getMissionLogs.mockResolvedValue([])

      const res = await request(app).get('/api/game/missions/99/logs')

      expect(res.status).toBe(200)
      expect(res.body.logs).toEqual([])
    })
  })

  describe('POST /api/game/missions/:templateId/force-return', () => {
    test('déclenche le retour forcé', async () => {
      GameService.forceReturnMission.mockResolvedValue({ state: {} })

      const res = await request(app).post('/api/game/missions/1/force-return')

      expect(res.status).toBe(200)
      expect(GameService.forceReturnMission).toHaveBeenCalledWith(1)
    })

    test('retourne une erreur si la mission est introuvable', async () => {
      GameService.forceReturnMission.mockResolvedValue({ error: 'Mission introuvable' })

      const res = await request(app).post('/api/game/missions/99/force-return')

      expect(res.status).toBe(400)
      expect(res.body.error).toBeDefined()
    })
  })
})
