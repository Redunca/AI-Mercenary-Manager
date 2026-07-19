const request = require('supertest')
const { app } = require('../index')
const shop = require('../src/services/shop.service')

jest.mock('../src/services/shop.service')
jest.mock('../src/db/pool', () => {
  const mockClient = { query: jest.fn(), release: jest.fn() }
  return { pool: { connect: jest.fn().mockResolvedValue(mockClient) } }
})

const { pool } = require('../src/db/pool')

describe('Shop Routes', () => {
  let mockClient

  beforeEach(async () => {
    jest.clearAllMocks()
    mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }
    pool.connect.mockResolvedValue(mockClient)
  })

  describe('GET /api/shop/items', () => {
    test('returns the catalog and releases the connection', async () => {
      shop.getShopItems.mockResolvedValue([{ id: 1, name: 'Corsair' }])

      const res = await request(app).get('/api/shop/items')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([{ id: 1, name: 'Corsair' }])
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })
  })

  describe('GET /api/shop/items/:id', () => {
    test("returns the requested item", async () => {
      shop.getShopItem.mockResolvedValue({ id: 1, name: 'Corsair' })

      const res = await request(app).get('/api/shop/items/1')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 1, name: 'Corsair' })
    })

    test('returns 404 if not found', async () => {
      shop.getShopItem.mockResolvedValue(null)

      const res = await request(app).get('/api/shop/items/999')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Item not found')
    })
  })

  describe('POST /api/shop/buy/:itemId', () => {
    test('delegates to buyShip when the item is a ship', async () => {
      shop.getShopItem.mockResolvedValue({ id: 1, type: 'ship' })
      shop.buyShip.mockResolvedValue({ success: true, wallet: 5000 })

      const res = await request(app).post('/api/shop/buy/1').send({})

      expect(res.status).toBe(200)
      expect(shop.buyShip).toHaveBeenCalledWith(mockClient, 1, 1)
      expect(shop.buyConsumable).not.toHaveBeenCalled()
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
    })

    test('delegates to buyConsumable with the provided quantity when it is not a ship', async () => {
      shop.getShopItem.mockResolvedValue({ id: 2, type: 'consumable' })
      shop.buyConsumable.mockResolvedValue({ success: true, wallet: 9500 })

      const res = await request(app).post('/api/shop/buy/2').send({ quantity: 3 })

      expect(res.status).toBe(200)
      expect(shop.buyConsumable).toHaveBeenCalledWith(mockClient, 1, 2, 3)
    })

    test('uses a default quantity of 1', async () => {
      shop.getShopItem.mockResolvedValue({ id: 2, type: 'consumable' })
      shop.buyConsumable.mockResolvedValue({ success: true })

      await request(app).post('/api/shop/buy/2').send({})

      expect(shop.buyConsumable).toHaveBeenCalledWith(mockClient, 1, 2, 1)
    })

    test('returns 404 and rolls back the transaction if the item cannot be found', async () => {
      shop.getShopItem.mockResolvedValue(null)

      const res = await request(app).post('/api/shop/buy/999').send({})

      expect(res.status).toBe(404)
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })

    test('returns 400 and rolls back the transaction when credit is insufficient', async () => {
      shop.getShopItem.mockResolvedValue({ id: 1, type: 'ship' })
      shop.buyShip.mockResolvedValue({ error: 'Insufficient credit' })

      const res = await request(app).post('/api/shop/buy/1').send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Insufficient credit')
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
    })

    test('rolls back the transaction and releases the connection if the service throws', async () => {
      shop.getShopItem.mockRejectedValue(new Error('DB unavailable'))

      const res = await request(app).post('/api/shop/buy/1').send({})

      expect(res.status).toBe(500)
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })
  })

  describe('POST /api/shop/buy/ship/:itemId', () => {
    test('directly buys a ship', async () => {
      shop.buyShip.mockResolvedValue({ success: true, wallet: 5000 })

      const res = await request(app).post('/api/shop/buy/ship/1').send({})

      expect(res.status).toBe(200)
      expect(shop.buyShip).toHaveBeenCalledWith(mockClient, 1, 1)
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
    })

    test('returns 400 and rolls back the transaction on error', async () => {
      shop.buyShip.mockResolvedValue({ error: 'Ship not found' })

      const res = await request(app).post('/api/shop/buy/ship/999').send({})

      expect(res.status).toBe(400)
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
    })
  })

  describe('POST /api/shop/buy/consumable/:itemId', () => {
    test('directly buys a consumable with the provided quantity', async () => {
      shop.buyConsumable.mockResolvedValue({ success: true, wallet: 9000 })

      const res = await request(app).post('/api/shop/buy/consumable/2').send({ quantity: 2 })

      expect(res.status).toBe(200)
      expect(shop.buyConsumable).toHaveBeenCalledWith(mockClient, 1, 2, 2)
    })

    test('returns 400 and rolls back the transaction on error', async () => {
      shop.buyConsumable.mockResolvedValue({ error: 'Insufficient credit' })

      const res = await request(app).post('/api/shop/buy/consumable/2').send({})

      expect(res.status).toBe(400)
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
    })
  })
})
