const request = require('supertest')
const { app } = require('../index')
const ShipService = require('../src/services/ship.service')
const ConsumableService = require('../src/services/consumable.service')

jest.mock('../src/services/game.service')
jest.mock('../src/services/ship.service')
jest.mock('../src/services/consumable.service')
jest.mock('../src/db/pool', () => {
  const mockClient = { query: jest.fn(), release: jest.fn() }
  return { pool: { connect: jest.fn().mockResolvedValue(mockClient) } }
})

const SHIP = { id: 1, player_id: 1, name: 'Vanguard', crew: [1], status: 'docked', stats: { capacity: 3 } }
const EMPTY_SHIP = { ...SHIP, crew: [] }

describe('Ship Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Restore the mock pool implementation after clearAllMocks
    const { pool } = require('../src/db/pool')
    pool.connect.mockResolvedValue({ query: jest.fn(), release: jest.fn() })
  })

  describe('GET /api/ships', () => {
    test('returns the list of ships', async () => {
      ShipService.getShips.mockResolvedValue([EMPTY_SHIP])

      const res = await request(app).get('/api/ships')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
    })
  })

  describe('GET /api/ships/:id', () => {
    test('returns the matching ship', async () => {
      ShipService.getShip.mockResolvedValue(EMPTY_SHIP)

      const res = await request(app).get('/api/ships/1')

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(1)
    })

    test('returns 404 if the ship cannot be found', async () => {
      ShipService.getShip.mockResolvedValue(null)

      const res = await request(app).get('/api/ships/999')

      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/ships/:id/crew', () => {
    test('assigns a recruit to a ship with an empty crew', async () => {
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

    test('returns 400 if recruitIds is missing', async () => {
      const res = await request(app)
        .post('/api/ships/1/crew')
        .send({})

      expect(res.status).toBe(400)
    })

    test('returns 400 if recruitIds is an empty array', async () => {
      const res = await request(app)
        .post('/api/ships/1/crew')
        .send({ recruitIds: [] })

      expect(res.status).toBe(400)
    })

    // Reproduces the bug: the recruit is already in the crew → appendCrewMember returns undefined
    // → the route responds 404 "Ship not found" even though the ship exists
    test('returns 200 if the recruit is already in the crew (idempotent)', async () => {
      ShipService.appendCrewMember.mockResolvedValue(undefined) // already present
      ShipService.getShip.mockResolvedValue(SHIP)               // ship still exists

      const res = await request(app)
        .post('/api/ships/1/crew')
        .send({ recruitIds: [1] })

      expect(res.status).toBe(200)
      expect(res.body.crew).toContain(1)
    })

    test('returns 404 if the ship does not exist', async () => {
      ShipService.appendCrewMember.mockResolvedValue(undefined)
      ShipService.getShip.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/ships/999/crew')
        .send({ recruitIds: [1] })

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/ships/:id/crew/:recruitId', () => {
    test('removes a recruit from the crew', async () => {
      ShipService.removeCrewMember.mockResolvedValue(EMPTY_SHIP)

      const res = await request(app).delete('/api/ships/1/crew/1')

      expect(res.status).toBe(200)
      expect(ShipService.removeCrewMember).toHaveBeenCalledWith(
        expect.anything(), 1, 1, 1
      )
    })

    test('returns 404 if the ship cannot be found', async () => {
      ShipService.removeCrewMember.mockResolvedValue(undefined)

      const res = await request(app).delete('/api/ships/999/crew/1')

      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/ships/:id', () => {
    test('renames a ship', async () => {
      ShipService.renameShip.mockResolvedValue({ ...EMPTY_SHIP, name: 'New Name' })

      const res = await request(app)
        .patch('/api/ships/1')
        .send({ name: 'New Name' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('New Name')
    })

    test('returns 400 if the name is missing', async () => {
      const res = await request(app)
        .patch('/api/ships/1')
        .send({})

      expect(res.status).toBe(400)
    })

    test('returns 404 if the ship cannot be found', async () => {
      ShipService.renameShip.mockResolvedValue(undefined)

      const res = await request(app)
        .patch('/api/ships/999')
        .send({ name: 'Test' })

      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/ships/:id/inventory', () => {
    test('lists the consumables assigned to a ship', async () => {
      ConsumableService.getShipInventory.mockResolvedValue([{ id: 1, name: 'Hull Auto-Patch' }])

      const res = await request(app).get('/api/ships/1/inventory')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(ConsumableService.getShipInventory).toHaveBeenCalledWith(expect.anything(), 1)
    })
  })

  describe('POST /api/ships/:id/inventory', () => {
    test('moves a consumable from the stash onto the ship', async () => {
      ConsumableService.assignToShip.mockResolvedValue({ id: 5, assigned_to_ship: 1, quantity: 1 })

      const res = await request(app)
        .post('/api/ships/1/inventory')
        .send({ consumableId: 5 })

      expect(res.status).toBe(200)
      expect(ConsumableService.assignToShip).toHaveBeenCalledWith(expect.anything(), 1, 5, 1, 1)
    })

    test('returns 400 when consumableId is missing', async () => {
      const res = await request(app).post('/api/ships/1/inventory').send({})
      expect(res.status).toBe(400)
    })

    test('returns 400 when the consumable cannot be moved', async () => {
      ConsumableService.assignToShip.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/ships/1/inventory')
        .send({ consumableId: 5 })

      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/ships/:id/inventory/:consumableId', () => {
    test('moves a consumable back to the stash', async () => {
      ConsumableService.unassignFromShip.mockResolvedValue({ id: 5, assigned_to_ship: null })

      const res = await request(app).delete('/api/ships/1/inventory/5')

      expect(res.status).toBe(200)
      expect(ConsumableService.unassignFromShip).toHaveBeenCalledWith(expect.anything(), 1, 5, 1)
    })

    test('returns 400 when the consumable cannot be moved', async () => {
      ConsumableService.unassignFromShip.mockResolvedValue(null)

      const res = await request(app).delete('/api/ships/1/inventory/5')

      expect(res.status).toBe(400)
    })
  })
})
