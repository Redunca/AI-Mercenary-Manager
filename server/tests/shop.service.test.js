const shop = require('../src/services/shop.service')
const ShipService = require('../src/services/ship.service')
const ConsumableService = require('../src/services/consumable.service')
const { setSeed, resetSeed } = require('../src/utils/random')

jest.mock('../src/db/pool')
jest.mock('../src/services/ship.service')
jest.mock('../src/services/consumable.service')

const NOT_DUE = new Date('2026-01-01T10:05:00.000Z') // mid-window, so shop_refresh_at at :00 isn't due
const SAME_WINDOW_REFRESH_AT = new Date('2026-01-01T10:00:00.000Z')

describe('Shop Service', () => {
  let mockClient

  beforeEach(() => {
    mockClient = { query: jest.fn() }
    jest.clearAllMocks()
  })

  describe('drawShopRotation', () => {
    const ship1 = { id: 1, type: 'ship', name: 'Corsair' }
    const ship2 = { id: 2, type: 'ship', name: 'Frigate' }
    const ship3 = { id: 3, type: 'ship', name: 'Cruiser' }
    const consumables = Array.from({ length: 13 }, (_, i) => ({
      id: 10 + i,
      type: 'consumable',
      name: `Item ${i}`,
    }))
    const fullPool = [ship1, ship2, ship3, ...consumables]

    afterEach(() => resetSeed())

    test('returns exactly 5 items from a 16-item pool', () => {
      setSeed(1)
      const rotation = shop.drawShopRotation(fullPool)
      expect(rotation).toHaveLength(5)
    })

    test('always includes at least one ship', () => {
      setSeed(1)
      for (let i = 0; i < 20; i++) {
        const rotation = shop.drawShopRotation(fullPool)
        const shipCount = rotation.filter((item) => item.type === 'ship').length
        expect(shipCount).toBeGreaterThanOrEqual(1)
      }
    })

    test('never returns duplicate items', () => {
      setSeed(1)
      for (let i = 0; i < 20; i++) {
        const rotation = shop.drawShopRotation(fullPool)
        const ids = rotation.map((item) => item.id)
        expect(new Set(ids).size).toBe(ids.length)
      }
    })

    test('the remaining 4 slots can include additional ships', () => {
      // With a seed sweep, at least one draw across many attempts should
      // contain 2 ships (1 guaranteed + 1 more drawn from the full pool).
      let sawExtraShip = false
      for (let seed = 1; seed < 200; seed++) {
        setSeed(seed)
        const rotation = shop.drawShopRotation(fullPool)
        if (rotation.filter((item) => item.type === 'ship').length > 1) {
          sawExtraShip = true
          break
        }
      }
      expect(sawExtraShip).toBe(true)
    })

    test('returns an empty array for an empty pool', () => {
      expect(shop.drawShopRotation([])).toEqual([])
      expect(shop.drawShopRotation(null)).toEqual([])
    })

    test('caps at the pool size when the pool is smaller than the rotation size', () => {
      setSeed(1)
      const smallPool = [ship1, consumables[0]]
      const rotation = shop.drawShopRotation(smallPool)
      expect(rotation).toHaveLength(2)
      expect(rotation.some((item) => item.type === 'ship')).toBe(true)
    })

    test('draws only consumables (no ship guarantee) when the pool has no ships', () => {
      setSeed(1)
      const rotation = shop.drawShopRotation(consumables.slice(0, 6))
      expect(rotation).toHaveLength(5)
      expect(rotation.every((item) => item.type === 'consumable')).toBe(true)
    })
  })

  describe('ensureShopRotation / refreshShopRotation', () => {
    test('does nothing if the refresh is not due yet', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { shop_refresh_at: SAME_WINDOW_REFRESH_AT, shop_refresh_interval_ms: 15 * 60 * 1000 },
        ],
      })

      await shop.ensureShopRotation(mockClient, 1, NOT_DUE)

      expect(mockClient.query).toHaveBeenCalledTimes(1) // only the shop_refresh_at/interval lookup
    })

    test('draws a fresh rotation if nothing has ever been refreshed', async () => {
      const pool = [
        { id: 1, type: 'ship', max_stock: 1 },
        { id: 2, type: 'consumable', max_stock: 3 },
      ]
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ shop_refresh_at: null, shop_refresh_interval_ms: 15 * 60 * 1000 }],
        }) // lookup
        .mockResolvedValueOnce({
          rows: [{ shop_rotation_size: 5, shop_refresh_interval_ms: 15 * 60 * 1000 }],
        }) // refreshShopRotation's player lookup
        .mockResolvedValueOnce({ rows: pool }) // SELECT * FROM shop_items
        .mockResolvedValueOnce({ rows: [] }) // DELETE FROM shop_rotation
        .mockResolvedValue({ rows: [] }) // INSERTs + UPDATE players

      await shop.ensureShopRotation(mockClient, 1, NOT_DUE)

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM shop_rotation WHERE player_id = $1',
        [1],
      )
      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO shop_rotation (player_id, shop_item_id, remaining_stock) VALUES ($1, $2, $3)',
        [1, 1, 1],
      )
      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO shop_rotation (player_id, shop_item_id, remaining_stock) VALUES ($1, $2, $3)',
        [1, 2, 3],
      )
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE players SET shop_refresh_at = $1 WHERE id = $2',
        [expect.any(Date), 1],
      )
    })

    test('draws a fresh rotation once the 15-minute wall-clock boundary has moved on', async () => {
      const previousWindow = new Date('2026-01-01T09:45:00.000Z')
      const pool = [{ id: 1, type: 'ship', max_stock: 1 }]
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ shop_refresh_at: previousWindow, shop_refresh_interval_ms: 15 * 60 * 1000 }],
        })
        .mockResolvedValueOnce({
          rows: [{ shop_rotation_size: 5, shop_refresh_interval_ms: 15 * 60 * 1000 }],
        })
        .mockResolvedValueOnce({ rows: pool })
        .mockResolvedValue({ rows: [] })

      await shop.ensureShopRotation(mockClient, 1, NOT_DUE) // NOT_DUE is 10:05, a new 15-min window vs 09:45

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM shop_rotation WHERE player_id = $1',
        [1],
      )
    })

    test("uses the player's shop_rotation_size instead of the historical default", async () => {
      const pool = [
        { id: 1, type: 'ship', max_stock: 1 },
        ...Array.from({ length: 8 }, (_, i) => ({ id: 10 + i, type: 'consumable', max_stock: 3 })),
      ]
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ shop_rotation_size: 8, shop_refresh_interval_ms: 15 * 60 * 1000 }],
        })
        .mockResolvedValueOnce({ rows: pool })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValue({ rows: [] })

      await shop.refreshShopRotation(mockClient, 1, NOT_DUE)

      const insertCalls = mockClient.query.mock.calls.filter(
        ([sql]) =>
          sql ===
          'INSERT INTO shop_rotation (player_id, shop_item_id, remaining_stock) VALUES ($1, $2, $3)',
      )
      expect(insertCalls).toHaveLength(8)
    })

    test("uses the player's shop_refresh_interval_ms instead of the historical default when computing the next boundary", async () => {
      const pool = [{ id: 1, type: 'ship', max_stock: 1 }]
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ shop_rotation_size: 5, shop_refresh_interval_ms: 10 * 60 * 1000 }],
        })
        .mockResolvedValueOnce({ rows: pool })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValue({ rows: [] })

      const refreshedAt = await shop.refreshShopRotation(
        mockClient,
        1,
        new Date('2026-01-01T10:05:00.000Z'),
      )

      // Floored to a 10-minute boundary (:00/:10/:20/...), not the historical 15-minute one.
      expect(refreshedAt.toISOString()).toBe('2026-01-01T10:00:00.000Z')
    })
  })

  describe('getShopItems', () => {
    test('ensures the rotation is fresh, then returns the live 5 items via the join', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            { shop_refresh_at: SAME_WINDOW_REFRESH_AT, shop_refresh_interval_ms: 15 * 60 * 1000 },
          ],
        }) // ensureShopRotation lookup (not due)
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Corsair' }] }) // join query

      const result = await shop.getShopItems(mockClient, 1, NOT_DUE)

      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining('JOIN shop_rotation sr ON sr.shop_item_id = si.id'),
        [1],
      )
      expect(result).toEqual([{ id: 1, name: 'Corsair' }])
    })
  })

  describe('getShopItem', () => {
    test('returns null if the item is not in the current rotation', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            { shop_refresh_at: SAME_WINDOW_REFRESH_AT, shop_refresh_interval_ms: 15 * 60 * 1000 },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })

      const result = await shop.getShopItem(mockClient, 999, 1, NOT_DUE)
      expect(result).toBeNull()
    })

    test('returns the item if it is live', async () => {
      const item = { id: 1, name: 'Corsair', type: 'ship', price: 5000, remaining_stock: 1 }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            { shop_refresh_at: SAME_WINDOW_REFRESH_AT, shop_refresh_interval_ms: 15 * 60 * 1000 },
          ],
        })
        .mockResolvedValueOnce({ rows: [item] })

      const result = await shop.getShopItem(mockClient, 1, 1, NOT_DUE)
      expect(result).toEqual(item)
    })
  })

  describe('buyShip', () => {
    test('returns an error if the player cannot be found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }) // player lookup FOR UPDATE
      const result = await shop.buyShip(mockClient, 1, 1, NOT_DUE)
      expect(result.error).toBe('Player not found')
    })

    test('returns an error if the ship is not in the current rotation', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        }) // player FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // lockRotationItem → not found

      const result = await shop.buyShip(mockClient, 1, 99, NOT_DUE)
      expect(result.error).toBe('Ship not found')
    })

    test('returns an error if the item is not a ship', async () => {
      const item = { id: 1, type: 'consumable', remaining_stock: 3 }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [item] })

      const result = await shop.buyShip(mockClient, 1, 1, NOT_DUE)
      expect(result.error).toBe('Ship not found')
    })

    test('rejects a second purchase of an already-purchased ship', async () => {
      const item = {
        id: 1,
        type: 'ship',
        price: 5000,
        name: 'Corsair',
        rarity: 'common',
        stats: {},
        remaining_stock: 0,
      }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [item] })

      const result = await shop.buyShip(mockClient, 1, 1, NOT_DUE)
      expect(result.error).toBe('Ship already purchased')
    })

    test('returns an error if credit is insufficient', async () => {
      const item = {
        id: 1,
        type: 'ship',
        price: 5000,
        name: 'Corsair',
        rarity: 'common',
        stats: {},
        remaining_stock: 1,
      }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 100,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [item] })

      const result = await shop.buyShip(mockClient, 1, 1, NOT_DUE)
      expect(result.error).toBe('Insufficient credit')
    })

    test('rejects a purchase when the docking capacity is already full', async () => {
      const item = {
        id: 1,
        type: 'ship',
        price: 5000,
        name: 'Corsair',
        rarity: 'common',
        stats: {},
        remaining_stock: 1,
      }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        }) // player FOR UPDATE
        .mockResolvedValueOnce({ rows: [item] }) // lockRotationItem
        .mockResolvedValueOnce({ rows: [{ count: 5 }] }) // ships owned
        .mockResolvedValueOnce({ rows: [{ capacity: 5 }] }) // SUM(docking_stations.capacity)

      const result = await shop.buyShip(mockClient, 1, 1, NOT_DUE)
      expect(result.error).toBe('Docking capacity full')
      expect(ShipService.createShip).not.toHaveBeenCalled()
    })

    test('buys a ship successfully, deducts the wallet, and closes out its stock', async () => {
      const item = {
        id: 1,
        type: 'ship',
        price: 5000,
        name: 'Corsair',
        rarity: 'common',
        stats: { speed: 120, durability: 8 },
        remaining_stock: 1,
      }
      const createdShip = { id: 2, name: 'Corsair' }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        }) // player FOR UPDATE
        .mockResolvedValueOnce({ rows: [item] }) // lockRotationItem
        .mockResolvedValueOnce({ rows: [{ count: 1 }] }) // ships owned
        .mockResolvedValueOnce({ rows: [{ capacity: 5 }] }) // SUM(docking_stations.capacity)
        .mockResolvedValueOnce({ rows: [{ next_ship_id: 2 }] }) // SELECT next_ship_id
        .mockResolvedValue({ rows: [] }) // UPDATE wallet, INSERT purchase_history, UPDATE shop_rotation

      ShipService.createShip.mockResolvedValue({})
      ShipService.getShip.mockResolvedValue(createdShip)

      const result = await shop.buyShip(mockClient, 1, 1, NOT_DUE)
      expect(result.success).toBe(true)
      expect(result.wallet).toBe(5000)
      expect(result.ship).toEqual(createdShip)
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE shop_rotation SET remaining_stock = remaining_stock - $1 WHERE player_id = $2 AND shop_item_id = $3',
        [1, 1, 1],
      )
    })

    test('calls createShip with the correct data, filling in max_durability', async () => {
      const item = {
        id: 1,
        type: 'ship',
        price: 5000,
        name: 'Corsair',
        rarity: 'common',
        stats: { speed: 120, durability: 8 },
        remaining_stock: 1,
      }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [item] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [{ capacity: 5 }] })
        .mockResolvedValueOnce({ rows: [{ next_ship_id: 3 }] })
        .mockResolvedValue({ rows: [] })

      ShipService.createShip.mockResolvedValue({})
      ShipService.getShip.mockResolvedValue({ id: 3 })

      await shop.buyShip(mockClient, 1, 1, NOT_DUE)

      expect(ShipService.createShip).toHaveBeenCalledWith(
        mockClient,
        1,
        expect.objectContaining({
          id: 3,
          name: 'Corsair',
          rarity: 'common',
          stats: expect.objectContaining({ durability: 8, max_durability: 8 }),
        }),
      )
    })

    test('keeps an explicit max_durability from the shop listing instead of overwriting it', async () => {
      const item = {
        id: 1,
        type: 'ship',
        price: 5000,
        name: 'Corsair',
        rarity: 'common',
        stats: { durability: 8, max_durability: 20 },
        remaining_stock: 1,
      }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [item] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [{ capacity: 5 }] })
        .mockResolvedValueOnce({ rows: [{ next_ship_id: 3 }] })
        .mockResolvedValue({ rows: [] })

      ShipService.createShip.mockResolvedValue({})
      ShipService.getShip.mockResolvedValue({ id: 3 })

      await shop.buyShip(mockClient, 1, 1, NOT_DUE)

      expect(ShipService.createShip).toHaveBeenCalledWith(
        mockClient,
        1,
        expect.objectContaining({ stats: expect.objectContaining({ max_durability: 20 }) }),
      )
    })
  })

  describe('buyConsumable', () => {
    test('returns an error if the consumable is not in the current rotation', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // lockRotationItem → not found

      const result = await shop.buyConsumable(mockClient, 1, 99, 1, NOT_DUE)
      expect(result.error).toBe('Consumable not found')
    })

    test('returns an error if credit is insufficient', async () => {
      const item = {
        id: 2,
        type: 'consumable',
        price: 1000,
        name: 'Hull Auto-Patch',
        rarity: 'rare',
        effect: 'REPAIR',
        remaining_stock: 2,
      }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 100,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [item] })

      const result = await shop.buyConsumable(mockClient, 1, 2, 1, NOT_DUE)
      expect(result.error).toBe('Insufficient credit')
    })

    test('rejects a purchase that would exceed remaining stock', async () => {
      const item = {
        id: 2,
        type: 'consumable',
        price: 400,
        name: 'Agility Stimpack',
        rarity: 'uncommon',
        remaining_stock: 1,
      }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [item] })

      const result = await shop.buyConsumable(mockClient, 1, 2, 2, NOT_DUE) // asking for 2, only 1 left
      expect(result.error).toBe('Not enough stock remaining')
    })

    test('rejects a purchase once stock is fully depleted', async () => {
      const item = {
        id: 2,
        type: 'consumable',
        price: 400,
        name: 'Agility Stimpack',
        rarity: 'uncommon',
        remaining_stock: 0,
      }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [item] })

      const result = await shop.buyConsumable(mockClient, 1, 2, 1, NOT_DUE)
      expect(result.error).toBe('Not enough stock remaining')
    })

    test('adds the consumable to the player stash, deducts the wallet, and reduces stock', async () => {
      const item = {
        id: 2,
        type: 'consumable',
        price: 500,
        name: 'Agility Stimpack',
        rarity: 'uncommon',
        effect: 'ATTRIBUTE_BOOST',
        effect_data: { attribute: 'agility', advantage: 1 },
        remaining_stock: 3,
      }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        }) // player FOR UPDATE
        .mockResolvedValueOnce({ rows: [item] }) // lockRotationItem
        .mockResolvedValue({ rows: [] }) // UPDATE wallet, INSERT purchase_history, UPDATE shop_rotation

      ConsumableService.addToStash.mockResolvedValue({
        id: 10,
        name: 'Agility Stimpack',
        quantity: 1,
      })

      const result = await shop.buyConsumable(mockClient, 1, 2, 1, NOT_DUE)

      expect(result.success).toBe(true)
      expect(result.wallet).toBe(9500)
      expect(ConsumableService.addToStash).toHaveBeenCalledWith(
        mockClient,
        1,
        expect.objectContaining({ name: 'Agility Stimpack', effect: 'ATTRIBUTE_BOOST' }),
      )
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE shop_rotation SET remaining_stock = remaining_stock - $1 WHERE player_id = $2 AND shop_item_id = $3',
        [1, 1, 2],
      )
    })

    test('rejects a purchase when the stash has no room for a new stack, without charging the wallet', async () => {
      const item = {
        id: 2,
        type: 'consumable',
        price: 500,
        name: 'Agility Stimpack',
        rarity: 'uncommon',
        remaining_stock: 3,
      }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [item] })

      ConsumableService.addToStash.mockResolvedValue(null) // stash full, no matching stack to merge into

      const result = await shop.buyConsumable(mockClient, 1, 2, 1, NOT_DUE)

      expect(result.error).toBe('Stash is full')
      expect(mockClient.query).not.toHaveBeenCalledWith(
        'UPDATE players SET wallet = $1 WHERE id = $2',
        expect.any(Array),
      )
    })

    test('honors the requested quantity for the total cost and stock decrement', async () => {
      const item = {
        id: 2,
        type: 'consumable',
        price: 500,
        name: 'Agility Stimpack',
        rarity: 'uncommon',
        remaining_stock: 3,
      }
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              wallet: 10000,
              shop_refresh_at: SAME_WINDOW_REFRESH_AT,
              shop_refresh_interval_ms: 15 * 60 * 1000,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [item] })
        .mockResolvedValue({ rows: [] })

      ConsumableService.addToStash.mockResolvedValue({ id: 10, quantity: 3 })

      const result = await shop.buyConsumable(mockClient, 1, 2, 3, NOT_DUE)
      expect(result.wallet).toBe(8500) // 10000 - (500 * 3)
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE shop_rotation SET remaining_stock = remaining_stock - $1 WHERE player_id = $2 AND shop_item_id = $3',
        [3, 1, 2],
      )
    })
  })

  describe('seedShopItems', () => {
    test('inserts the 3 default ships and 13 default consumable items from the catalog', async () => {
      mockClient.query.mockResolvedValue({ rows: [] })

      await shop.seedShopItems(mockClient)

      const shipCalls = mockClient.query.mock.calls.filter(
        ([sql]) => sql.includes('stats, available, max_stock') && sql.includes('TRUE, 1)'),
      )
      const consumableCalls = mockClient.query.mock.calls.filter(([sql]) =>
        sql.includes('effect, effect_data, available, max_stock'),
      )
      expect(shipCalls).toHaveLength(3)
      expect(consumableCalls).toHaveLength(13) // 10 attribute boosts + HEAL + REPAIR + SPEED_BOOST
    })

    test('uses ON CONFLICT DO NOTHING to remain idempotent', async () => {
      mockClient.query.mockResolvedValue({ rows: [] })

      await shop.seedShopItems(mockClient)

      for (const [sql] of mockClient.query.mock.calls) {
        expect(sql).toContain('ON CONFLICT DO NOTHING')
      }
    })

    test('sets max_stock to 3 for uncommon consumables and 2 for rare consumables', async () => {
      mockClient.query.mockResolvedValue({ rows: [] })

      await shop.seedShopItems(mockClient)

      const consumableCalls = mockClient.query.mock.calls.filter(([sql]) =>
        sql.includes('effect, effect_data, available, max_stock'),
      )

      const uncommonCalls = consumableCalls.filter(([, params]) => params[3] === 'uncommon')
      const rareCalls = consumableCalls.filter(([, params]) => params[3] === 'rare')

      expect(uncommonCalls.every(([, params]) => params[7] === 3)).toBe(true)
      expect(rareCalls.every(([, params]) => params[7] === 2)).toBe(true)
    })

    test('sets max_stock to 1 for all ships', async () => {
      mockClient.query.mockResolvedValue({ rows: [] })

      await shop.seedShopItems(mockClient)

      const shipCalls = mockClient.query.mock.calls.filter(
        ([sql]) => sql.includes('stats, available, max_stock') && sql.includes('TRUE, 1)'),
      )
      expect(shipCalls).toHaveLength(3)
      for (const [sql] of shipCalls) {
        expect(sql).toContain('VALUES ($1, $2, $3, $4, $5, $6, TRUE, 1)')
      }
    })

    test('inserts the 5 default armor items from the Open Legend armor table', async () => {
      mockClient.query.mockResolvedValue({ rows: [] })

      await shop.seedShopItems(mockClient)

      const armorCalls = mockClient.query.mock.calls.filter(([sql]) => sql.includes("'armor'"))
      expect(armorCalls).toHaveLength(5)
      for (const [, params] of armorCalls) {
        const stats = JSON.parse(params[4])
        expect(['light', 'medium', 'heavy']).toContain(stats.armorType)
        expect(typeof stats.guardBonus).toBe('number')
        expect(typeof stats.requiredFortitude).toBe('number')
      }
    })
  })
})
