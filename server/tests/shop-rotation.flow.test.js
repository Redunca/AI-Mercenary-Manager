// Integration-style tests for the shop rotation lifecycle: drawing the live
// 5-item rotation from the 16-item master catalog, the 15-minute lazy
// refresh, and stock-based purchase blocking. Unlike shop.service.test.js
// (which mocks client.query with ordered stubs), this runs the real
// shop.service.js against a small fake in-memory Postgres so it exercises
// the actual SQL shapes end-to-end (DELETE+INSERT on refresh, the
// shop_items/shop_rotation join, the stock decrement), the way
// shop-mission.flow.test.js does for the ship/consumable purchase flow.
const ShopService = require('../src/services/shop.service')
const ShipService = require('../src/services/ship.service')
const ConsumableService = require('../src/services/consumable.service')

jest.mock('../src/services/ship.service')
jest.mock('../src/services/consumable.service')

const T0 = new Date('2026-01-01T10:00:00.000Z')          // a 15-min window boundary
const T0_PLUS_5 = new Date('2026-01-01T10:05:00.000Z')    // same window as T0
const T1 = new Date('2026-01-01T10:15:00.000Z')           // next window
const T2 = new Date('2026-01-01T10:30:00.000Z')           // window after that

function buildMasterCatalog() {
  const ships = [
    { name: 'Corsair', type: 'ship', rarity: 'common', price: 5000, max_stock: 1, stats: { speed: 120, durability: 8 } },
    { name: 'Frigate', type: 'ship', rarity: 'rare', price: 12000, max_stock: 1, stats: { speed: 100, durability: 15 } },
    { name: 'Cruiser', type: 'ship', rarity: 'epic', price: 25000, max_stock: 1, stats: { speed: 80, durability: 25 } },
  ]
  const attributeBoosts = Array.from({ length: 10 }, (_, i) => ({
    name: `Attribute Boost ${i}`, type: 'consumable', rarity: 'uncommon', price: 400, max_stock: 3,
    effect: 'ATTRIBUTE_BOOST', effect_data: {},
  }))
  const otherConsumables = [
    { name: 'Trauma Nanites', type: 'consumable', rarity: 'rare', price: 2500, max_stock: 2, effect: 'HEAL', effect_data: {} },
    { name: 'Hull Auto-Patch', type: 'consumable', rarity: 'rare', price: 2000, max_stock: 2, effect: 'REPAIR', effect_data: {} },
    { name: 'Overdrive Injector', type: 'consumable', rarity: 'uncommon', price: 1200, max_stock: 3, effect: 'SPEED_BOOST', effect_data: {} },
  ]
  return [...ships, ...attributeBoosts, ...otherConsumables]
}

function createFakeClient(catalog, wallet = 100000) {
  const state = {
    players: [{ id: 1, wallet, shop_refresh_at: null, next_ship_id: 1 }],
    shopItems: catalog.map((item, i) => ({ id: i + 1, description: '', stats: null, effect: null, effect_data: {}, ...item })),
    shopRotation: [],
    purchaseHistory: [],
  }

  const query = jest.fn(async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim()

    if (s === 'SELECT wallet, shop_refresh_at FROM players WHERE id = $1 FOR UPDATE') {
      return { rows: state.players.filter(p => p.id === params[0]).map(p => ({ wallet: p.wallet, shop_refresh_at: p.shop_refresh_at })) }
    }
    if (s === 'SELECT shop_refresh_at FROM players WHERE id = $1') {
      return { rows: state.players.filter(p => p.id === params[0]).map(p => ({ shop_refresh_at: p.shop_refresh_at })) }
    }
    if (s === 'UPDATE players SET shop_refresh_at = $1 WHERE id = $2') {
      Object.assign(state.players.find(p => p.id === params[1]), { shop_refresh_at: params[0] })
      return { rows: [] }
    }
    if (s === 'SELECT next_ship_id FROM players WHERE id = $1') {
      return { rows: state.players.filter(p => p.id === params[0]).map(p => ({ next_ship_id: p.next_ship_id })) }
    }
    if (s === 'UPDATE players SET wallet = $1, next_ship_id = next_ship_id + 1 WHERE id = $2') {
      const p = state.players.find(p => p.id === params[1])
      Object.assign(p, { wallet: params[0], next_ship_id: p.next_ship_id + 1 })
      return { rows: [] }
    }
    if (s === 'UPDATE players SET wallet = $1 WHERE id = $2') {
      Object.assign(state.players.find(p => p.id === params[1]), { wallet: params[0] })
      return { rows: [] }
    }

    if (s === 'SELECT * FROM shop_items ORDER BY id') {
      return { rows: state.shopItems }
    }
    if (s === 'DELETE FROM shop_rotation WHERE player_id = $1') {
      state.shopRotation = state.shopRotation.filter(r => r.player_id !== params[0])
      return { rows: [] }
    }
    if (s === 'INSERT INTO shop_rotation (player_id, shop_item_id, remaining_stock) VALUES ($1, $2, $3)') {
      const [player_id, shop_item_id, remaining_stock] = params
      state.shopRotation.push({ player_id, shop_item_id, remaining_stock })
      return { rows: [] }
    }
    if (s.startsWith('SELECT si.*, sr.remaining_stock FROM shop_items si')) {
      const joined = state.shopRotation
        .filter(r => r.player_id === params[0])
        .map(r => ({ ...state.shopItems.find(i => i.id === r.shop_item_id), remaining_stock: r.remaining_stock }))
      const rows = params.length > 1 ? joined.filter(i => i.id === params[1]) : joined
      return { rows }
    }
    if (s === 'UPDATE shop_rotation SET remaining_stock = remaining_stock - 1 WHERE player_id = $1 AND shop_item_id = $2') {
      const [player_id, shop_item_id] = params
      state.shopRotation.find(r => r.player_id === player_id && r.shop_item_id === shop_item_id).remaining_stock -= 1
      return { rows: [] }
    }
    if (s === 'UPDATE shop_rotation SET remaining_stock = remaining_stock - $1 WHERE player_id = $2 AND shop_item_id = $3') {
      const [qty, player_id, shop_item_id] = params
      state.shopRotation.find(r => r.player_id === player_id && r.shop_item_id === shop_item_id).remaining_stock -= qty
      return { rows: [] }
    }
    if (s.includes('INSERT INTO purchase_history')) {
      state.purchaseHistory.push({ player_id: params[0], item_id: params[1], item_type: params[2], price_paid: params[3] })
      return { rows: [] }
    }

    throw new Error(`Query not handled by the fake test client: ${s}`)
  })

  return { client: { query }, state }
}

describe('Shop rotation lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ShipService.createShip.mockResolvedValue({})
    ShipService.getShip.mockResolvedValue({ id: 1 })
    ConsumableService.addToStash.mockResolvedValue({ id: 1 })
  })

  test('exactly 5 items are live after a refresh, drawn from the 16-item master catalog', async () => {
    const { client } = createFakeClient(buildMasterCatalog())

    const items = await ShopService.getShopItems(client, 1, T0)

    expect(items).toHaveLength(5)
  })

  test('the master catalog is never reduced in size across repeated refreshes', async () => {
    const { client, state } = createFakeClient(buildMasterCatalog())
    expect(state.shopItems).toHaveLength(16)

    await ShopService.getShopItems(client, 1, T0)
    expect(state.shopItems).toHaveLength(16)

    await ShopService.getShopItems(client, 1, T1)
    expect(state.shopItems).toHaveLength(16)

    await ShopService.getShopItems(client, 1, T2)
    expect(state.shopItems).toHaveLength(16)
  })

  test('no refresh happens before 15 minutes have elapsed', async () => {
    const { client, state } = createFakeClient(buildMasterCatalog())

    await ShopService.getShopItems(client, 1, T0)
    const rotationAfterFirstRead = [...state.shopRotation]
    const refreshAtAfterFirstRead = state.players[0].shop_refresh_at

    await ShopService.getShopItems(client, 1, T0_PLUS_5) // still within the same 15-min window

    expect(state.players[0].shop_refresh_at).toEqual(refreshAtAfterFirstRead)
    expect(state.shopRotation).toEqual(rotationAfterFirstRead)
  })

  test('once 15 minutes elapse, unbought listings are dropped and replaced, while bought items keep their permanent row and purchase history', async () => {
    const { client, state } = createFakeClient(buildMasterCatalog())

    const initialItems = await ShopService.getShopItems(client, 1, T0)
    const purchasedItem = initialItems.find(i => i.type === 'consumable')

    const buyResult = await ShopService.buyConsumable(client, 1, purchasedItem.id, 1, T0)
    expect(buyResult.success).toBe(true)

    // Cross into the next 15-minute window: refresh should fire on next read.
    const itemsAfterRefresh = await ShopService.getShopItems(client, 1, T1)

    expect(itemsAfterRefresh).toHaveLength(5)
    // The purchased item's shop_items row is untouched (never deleted).
    expect(state.shopItems.find(i => i.id === purchasedItem.id)).toBeDefined()
    // Its purchase_history entry survives the refresh regardless of whether
    // it was drawn again.
    expect(state.purchaseHistory.some(h => h.item_id === purchasedItem.id)).toBe(true)
    // The old rotation rows were fully replaced (delete-then-reinsert), not
    // accumulated: exactly 5 rows live for this player, no stale leftovers.
    expect(state.shopRotation.filter(r => r.player_id === 1)).toHaveLength(5)
  })

  test('a second purchase attempt on an already-purchased (stock-depleted) item is rejected', async () => {
    const { client } = createFakeClient(buildMasterCatalog())

    const items = await ShopService.getShopItems(client, 1, T0)
    const ship = items.find(i => i.type === 'ship') // ships have max_stock 1

    const firstBuy = await ShopService.buyShip(client, 1, ship.id, T0)
    expect(firstBuy.success).toBe(true)

    const secondBuy = await ShopService.buyShip(client, 1, ship.id, T0_PLUS_5)
    expect(secondBuy.error).toBe('Ship already purchased')
  })

  test('a consumable purchase that exceeds remaining stock is rejected without partially succeeding', async () => {
    const { client, state } = createFakeClient(buildMasterCatalog())

    const items = await ShopService.getShopItems(client, 1, T0)
    const rare = items.find(i => i.rarity === 'rare' && i.type === 'consumable') // max_stock 2

    const result = await ShopService.buyConsumable(client, 1, rare.id, 3, T0_PLUS_5)

    expect(result.error).toBe('Not enough stock remaining')
    expect(state.purchaseHistory).toHaveLength(0)
    const rotationRow = state.shopRotation.find(r => r.shop_item_id === rare.id)
    expect(rotationRow.remaining_stock).toBe(2) // untouched
  })
})
