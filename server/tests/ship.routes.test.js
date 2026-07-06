const request = require('supertest')
const { app } = require('../index')
const ShipService = require('../src/services/ship.service')

jest.mock('../src/services/game.service')
jest.mock('../src/services/ship.service')
jest.mock('../src/db/pool', () => {
  const mockClient = { query: jest.fn(), release: jest.fn() }
  return { pool: { connect: jest.fn().mockResolvedValue(mockClient) } }
})

const SHIP = { id: 1, player_id: 1, name: 'Vanguard', crew: [1], status: 'docked', stats: { capacity: 3 } }
const EMPTY_SHIP = { ...SHIP, crew: [] }

describe('Ship Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Rétablir l'implémentation du mock pool après clearAllMocks
    const { pool } = require('../src/db/pool')
    pool.connect.mockResolvedValue({ query: jest.fn(), release: jest.fn() })
  })

  describe('GET /api/ships', () => {
    test('retourne la liste des navires', async () => {
      ShipService.getShips.mockResolvedValue([EMPTY_SHIP])

      const res = await request(app).get('/api/ships')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
    })
  })

  describe('GET /api/ships/:id', () => {
    test('retourne le navire correspondant', async () => {
      ShipService.getShip.mockResolvedValue(EMPTY_SHIP)

      const res = await request(app).get('/api/ships/1')

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(1)
    })

    test('retourne 404 si le navire est introuvable', async () => {
      ShipService.getShip.mockResolvedValue(null)

      const res = await request(app).get('/api/ships/999')

      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/ships/:id/crew', () => {
    test('assigne une recrue à un navire avec équipage vide', async () => {
      ShipService.appendCrewMember.mockResolvedValue(SHIP)

      const res = await request(app)
        .post('/api/ships/1/crew')
        .send({ recruitIds: [1] })

      expect(res.status).toBe(200)
      expect(res.body.crew).toContain(1)
      expect(ShipService.appendCrewMember).toHaveBeenCalledWith(
        expect.anything(), 1, 1, 1
      )
    })

    test('retourne 400 si recruitIds est absent', async () => {
      const res = await request(app)
        .post('/api/ships/1/crew')
        .send({})

      expect(res.status).toBe(400)
    })

    test('retourne 400 si recruitIds est un tableau vide', async () => {
      const res = await request(app)
        .post('/api/ships/1/crew')
        .send({ recruitIds: [] })

      expect(res.status).toBe(400)
    })

    // Reproduit le bug : la recrue est déjà dans l'équipage → appendCrewMember retourne undefined
    // → la route répond 404 "Navire introuvable" alors que le navire existe
    test('retourne 200 si la recrue est déjà dans l\'équipage (idempotent)', async () => {
      ShipService.appendCrewMember.mockResolvedValue(undefined) // déjà présente
      ShipService.getShip.mockResolvedValue(SHIP)               // navire existe quand même

      const res = await request(app)
        .post('/api/ships/1/crew')
        .send({ recruitIds: [1] })

      expect(res.status).toBe(200)
      expect(res.body.crew).toContain(1)
    })

    test('retourne 404 si le navire n\'existe pas', async () => {
      ShipService.appendCrewMember.mockResolvedValue(undefined)
      ShipService.getShip.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/ships/999/crew')
        .send({ recruitIds: [1] })

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/ships/:id/crew/:recruitId', () => {
    test('retire une recrue de l\'équipage', async () => {
      ShipService.removeCrewMember.mockResolvedValue(EMPTY_SHIP)

      const res = await request(app).delete('/api/ships/1/crew/1')

      expect(res.status).toBe(200)
      expect(ShipService.removeCrewMember).toHaveBeenCalledWith(
        expect.anything(), 1, 1, 1
      )
    })

    test('retourne 404 si le navire est introuvable', async () => {
      ShipService.removeCrewMember.mockResolvedValue(undefined)

      const res = await request(app).delete('/api/ships/999/crew/1')

      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/ships/:id', () => {
    test('renomme un navire', async () => {
      ShipService.renameShip.mockResolvedValue({ ...EMPTY_SHIP, name: 'Nouveau Nom' })

      const res = await request(app)
        .patch('/api/ships/1')
        .send({ name: 'Nouveau Nom' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Nouveau Nom')
    })

    test('retourne 400 si le nom est absent', async () => {
      const res = await request(app)
        .patch('/api/ships/1')
        .send({})

      expect(res.status).toBe(400)
    })

    test('retourne 404 si le navire est introuvable', async () => {
      ShipService.renameShip.mockResolvedValue(undefined)

      const res = await request(app)
        .patch('/api/ships/999')
        .send({ name: 'Test' })

      expect(res.status).toBe(404)
    })
  })
})
