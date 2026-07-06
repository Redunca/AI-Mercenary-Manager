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
    test('retourne le catalogue et libère la connexion', async () => {
      shop.getShopItems.mockResolvedValue([{ id: 1, name: 'Corsaire' }])

      const res = await request(app).get('/api/shop/items')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([{ id: 1, name: 'Corsaire' }])
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })
  })

  describe('GET /api/shop/items/:id', () => {
    test("retourne l'article demandé", async () => {
      shop.getShopItem.mockResolvedValue({ id: 1, name: 'Corsaire' })

      const res = await request(app).get('/api/shop/items/1')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 1, name: 'Corsaire' })
    })

    test('retourne 404 si introuvable', async () => {
      shop.getShopItem.mockResolvedValue(null)

      const res = await request(app).get('/api/shop/items/999')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Article introuvable')
    })
  })

  describe('GET /api/shop/wallet', () => {
    test('retourne le solde du joueur par défaut', async () => {
      shop.getPlayerWallet.mockResolvedValue(8000)

      const res = await request(app).get('/api/shop/wallet')

      expect(res.status).toBe(200)
      expect(res.body).toBe(8000)
      expect(shop.getPlayerWallet).toHaveBeenCalledWith(mockClient, 1)
    })
  })

  describe('POST /api/shop/buy/:itemId', () => {
    test('délègue à buyShip quand l\'article est un navire', async () => {
      shop.getShopItem.mockResolvedValue({ id: 1, type: 'ship' })
      shop.buyShip.mockResolvedValue({ success: true, wallet: 5000 })

      const res = await request(app).post('/api/shop/buy/1').send({})

      expect(res.status).toBe(200)
      expect(shop.buyShip).toHaveBeenCalledWith(mockClient, 1, 1)
      expect(shop.buyEquipment).not.toHaveBeenCalled()
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
    })

    test('délègue à buyEquipment avec la quantité fournie quand ce n\'est pas un navire', async () => {
      shop.getShopItem.mockResolvedValue({ id: 2, type: 'equipment' })
      shop.buyEquipment.mockResolvedValue({ success: true, wallet: 9500 })

      const res = await request(app).post('/api/shop/buy/2').send({ quantity: 3 })

      expect(res.status).toBe(200)
      expect(shop.buyEquipment).toHaveBeenCalledWith(mockClient, 1, 2, 3)
    })

    test('utilise une quantité de 1 par défaut', async () => {
      shop.getShopItem.mockResolvedValue({ id: 2, type: 'equipment' })
      shop.buyEquipment.mockResolvedValue({ success: true })

      await request(app).post('/api/shop/buy/2').send({})

      expect(shop.buyEquipment).toHaveBeenCalledWith(mockClient, 1, 2, 1)
    })

    test('retourne 404 et annule la transaction si l\'article est introuvable', async () => {
      shop.getShopItem.mockResolvedValue(null)

      const res = await request(app).post('/api/shop/buy/999').send({})

      expect(res.status).toBe(404)
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })

    test('retourne 400 et annule la transaction quand le crédit est insuffisant', async () => {
      shop.getShopItem.mockResolvedValue({ id: 1, type: 'ship' })
      shop.buyShip.mockResolvedValue({ error: 'Crédit insuffisant' })

      const res = await request(app).post('/api/shop/buy/1').send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Crédit insuffisant')
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
    })

    test('annule la transaction et libère la connexion si le service lève une exception', async () => {
      shop.getShopItem.mockRejectedValue(new Error('DB indisponible'))

      const res = await request(app).post('/api/shop/buy/1').send({})

      expect(res.status).toBe(500)
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })
  })

  describe('POST /api/shop/buy/ship/:itemId', () => {
    test('achète directement un navire', async () => {
      shop.buyShip.mockResolvedValue({ success: true, wallet: 5000 })

      const res = await request(app).post('/api/shop/buy/ship/1').send({})

      expect(res.status).toBe(200)
      expect(shop.buyShip).toHaveBeenCalledWith(mockClient, 1, 1)
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
    })

    test('retourne 400 et annule la transaction en cas d\'erreur', async () => {
      shop.buyShip.mockResolvedValue({ error: 'Navire introuvable' })

      const res = await request(app).post('/api/shop/buy/ship/999').send({})

      expect(res.status).toBe(400)
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
    })
  })

  describe('POST /api/shop/buy/equipment/:itemId', () => {
    test('achète directement un équipement avec la quantité fournie', async () => {
      shop.buyEquipment.mockResolvedValue({ success: true, wallet: 9000 })

      const res = await request(app).post('/api/shop/buy/equipment/2').send({ quantity: 2 })

      expect(res.status).toBe(200)
      expect(shop.buyEquipment).toHaveBeenCalledWith(mockClient, 1, 2, 2)
    })

    test('retourne 400 et annule la transaction en cas d\'erreur', async () => {
      shop.buyEquipment.mockResolvedValue({ error: 'Crédit insuffisant' })

      const res = await request(app).post('/api/shop/buy/equipment/2').send({})

      expect(res.status).toBe(400)
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
    })
  })
})
