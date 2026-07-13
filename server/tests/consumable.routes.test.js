const request = require('supertest')
const { app } = require('../index')
const ConsumableService = require('../src/services/consumable.service')

jest.mock('../src/services/game.service')
jest.mock('../src/services/consumable.service')
jest.mock('../src/db/pool', () => {
  const mockClient = { query: jest.fn(), release: jest.fn() }
  return { pool: { connect: jest.fn().mockResolvedValue(mockClient) } }
})

describe('Consumable Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const { pool } = require('../src/db/pool')
    pool.connect.mockResolvedValue({ query: jest.fn(), release: jest.fn() })
  })

  describe('GET /api/consumables', () => {
    test('returns the full stash by default', async () => {
      ConsumableService.getPlayerConsumables.mockResolvedValue([{ id: 1 }, { id: 2 }])

      const res = await request(app).get('/api/consumables')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(ConsumableService.getPlayerConsumables).toHaveBeenCalledWith(expect.anything(), 1, false)
    })

    test('filters to unassigned-only when asked', async () => {
      ConsumableService.getPlayerConsumables.mockResolvedValue([])

      await request(app).get('/api/consumables?unassigned=true')

      expect(ConsumableService.getPlayerConsumables).toHaveBeenCalledWith(expect.anything(), 1, true)
    })
  })
})
