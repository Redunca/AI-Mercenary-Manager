// SelfService reads its catalog straight from server/data/upgrades.json (no
// mocking of that file — it's the source of truth for tier/cost shape), and
// talks to the DB via a small fake in-memory client keyed by SQL text,
// mirroring the style used by the *.flow.test.js suites: this keeps these
// tests robust to the exact query ordering inside getUpgradeCatalog/
// buyUpgrade rather than pinning brittle mockResolvedValueOnce chains.
//
// Ids mirror server/data/upgrades.json: 1 recruits, 2 missionList,
// 3 dockedShips, 4 shopItems, 5 inventorySpace, 6 shopRefreshSpeed,
// 7 missionRefreshSpeed, 8 hpRegenSpeed.
const SelfService = require('../src/services/self.service')

const RECRUITS = 1
const MISSION_LIST = 2
const DOCKED_SHIPS = 3
const SHOP_ITEMS = 4
const INVENTORY_SPACE = 5
const SHOP_REFRESH_SPEED = 6
const MISSION_REFRESH_SPEED = 7
const HP_REGEN_SPEED = 8

function createFakeClient({
  tokens = 1000,
  tiers = {},
  shopCatalogCount = 16,
  consumableCatalogCount = 13,
  playerExists = true,
} = {}) {
  const state = { tokens, tiers: { ...tiers }, dockingStationInserts: [], columnUpdates: {} }

  const query = jest.fn(async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim()

    if (
      s === 'SELECT tokens FROM players WHERE id = $1' ||
      s === 'SELECT tokens FROM players WHERE id = $1 FOR UPDATE'
    ) {
      return { rows: playerExists ? [{ tokens: state.tokens }] : [] }
    }
    if (s === 'SELECT upgrade_id, tier FROM player_upgrades WHERE player_id = $1') {
      return {
        rows: Object.entries(state.tiers).map(([upgrade_id, tier]) => ({
          upgrade_id: Number(upgrade_id),
          tier,
        })),
      }
    }
    if (s === 'SELECT tier FROM player_upgrades WHERE player_id = $1 AND upgrade_id = $2') {
      return { rows: [{ tier: state.tiers[params[1]] ?? 0 }] }
    }
    if (s === 'SELECT COUNT(*)::int AS count FROM shop_items') {
      return { rows: [{ count: shopCatalogCount }] }
    }
    if (s === "SELECT COUNT(*)::int AS count FROM shop_items WHERE type = 'consumable'") {
      return { rows: [{ count: consumableCatalogCount }] }
    }
    if (s === 'UPDATE players SET tokens = tokens - $1 WHERE id = $2') {
      state.tokens -= params[0]
      return { rows: [] }
    }
    const columnMatch = s.match(/^UPDATE players SET (\w+) = \$1 WHERE id = \$2$/)
    if (columnMatch) {
      state.columnUpdates[columnMatch[1]] = params[0]
      return { rows: [] }
    }
    if (s === 'INSERT INTO docking_stations (player_id, capacity) VALUES ($1, 1)') {
      state.dockingStationInserts.push(params[0])
      return { rows: [] }
    }
    if (s.includes('INSERT INTO player_upgrades')) {
      const [, upgradeId] = params
      state.tiers[upgradeId] = (state.tiers[upgradeId] ?? 0) + 1
      return { rows: [] }
    }

    throw new Error(`Query not handled by the fake test client: ${s}`)
  })

  return { client: { query }, state }
}

describe('SelfService', () => {
  describe('getUpgradeCatalog', () => {
    test('returns every upgrade at tier 0 with tokens from the player row', async () => {
      const { client } = createFakeClient({ tokens: 500 })

      const result = await SelfService.getUpgradeCatalog(client, 1)

      expect(result.tokens).toBe(500)
      const recruits = result.upgrades.find((u) => u.id === RECRUITS)
      expect(recruits).toMatchObject({
        tier: 0,
        currentValue: 5,
        maxValue: 20,
        maxed: false,
        nextCost: 50,
      })
    })

    test('reflects an owned tier in currentValue and nextCost', async () => {
      const { client } = createFakeClient({ tiers: { [RECRUITS]: 3 } })

      const result = await SelfService.getUpgradeCatalog(client, 1)

      const recruits = result.upgrades.find((u) => u.id === RECRUITS)
      expect(recruits).toMatchObject({ tier: 3, currentValue: 8, nextCost: 100 }) // costs[3] = 100
    })

    test('marks a static-cap upgrade maxed once its tier reaches maxValue, with no next cost', async () => {
      const { client } = createFakeClient({ tiers: { [DOCKED_SHIPS]: 5 } })

      const result = await SelfService.getUpgradeCatalog(client, 1)

      const dockedShips = result.upgrades.find((u) => u.id === DOCKED_SHIPS)
      expect(dockedShips).toMatchObject({
        tier: 5,
        currentValue: 10,
        maxValue: 10,
        maxed: true,
        nextCost: null,
      })
    })

    test('marks a time-based upgrade maxed once its floor is reached', async () => {
      const { client } = createFakeClient({ tiers: { [SHOP_REFRESH_SPEED]: 10 } })

      const result = await SelfService.getUpgradeCatalog(client, 1)

      const upgrade = result.upgrades.find((u) => u.id === SHOP_REFRESH_SPEED)
      expect(upgrade).toMatchObject({
        currentValue: 600000,
        maxValue: 600000,
        maxed: true,
        nextCost: null,
      })
    })

    test('a time-based upgrade below its floor is not maxed and reports the decremented value', async () => {
      const { client } = createFakeClient({ tiers: { [MISSION_REFRESH_SPEED]: 2 } })

      const result = await SelfService.getUpgradeCatalog(client, 1)

      const upgrade = result.upgrades.find((u) => u.id === MISSION_REFRESH_SPEED)
      expect(upgrade).toMatchObject({ currentValue: 840000, maxed: false, nextCost: 125 }) // 900000 - 2*30000, costs[2]
    })

    test('hpRegenSpeed starts at the 1/minute base rate and floors at 1/10s', async () => {
      const { client } = createFakeClient()

      const result = await SelfService.getUpgradeCatalog(client, 1)

      const upgrade = result.upgrades.find((u) => u.id === HP_REGEN_SPEED)
      expect(upgrade).toMatchObject({
        currentValue: 60000,
        maxValue: 10000,
        maxed: false,
        nextCost: 80,
      })
    })

    test('uses the live shop_items count as the dynamic ceiling for shopItems', async () => {
      const { client } = createFakeClient({ shopCatalogCount: 16 })

      const result = await SelfService.getUpgradeCatalog(client, 1)

      const shopItems = result.upgrades.find((u) => u.id === SHOP_ITEMS)
      expect(shopItems).toMatchObject({ maxValue: 16, maxed: false })
    })

    test('uses the live consumable-only shop_items count as the dynamic ceiling for inventorySpace', async () => {
      const { client } = createFakeClient({ consumableCatalogCount: 13 })

      const result = await SelfService.getUpgradeCatalog(client, 1)

      const inventorySpace = result.upgrades.find((u) => u.id === INVENTORY_SPACE)
      expect(inventorySpace).toMatchObject({ maxValue: 13, maxed: false })
    })

    test('a dynamic-ceiling upgrade is maxed once its tier reaches the live catalog count', async () => {
      const { client } = createFakeClient({ tiers: { [SHOP_ITEMS]: 11 }, shopCatalogCount: 16 })

      const result = await SelfService.getUpgradeCatalog(client, 1)

      const shopItems = result.upgrades.find((u) => u.id === SHOP_ITEMS)
      expect(shopItems).toMatchObject({
        currentValue: 16,
        maxValue: 16,
        maxed: true,
        nextCost: null,
      })
    })
  })

  describe('buyUpgrade', () => {
    test('rejects an unknown upgrade id without touching the database', async () => {
      const { client } = createFakeClient()

      const result = await SelfService.buyUpgrade(client, 1, 999)

      expect(result.error).toBe('Upgrade not found')
      expect(client.query).not.toHaveBeenCalled()
    })

    test('rejects when the player cannot be found', async () => {
      const { client } = createFakeClient({ playerExists: false })

      const result = await SelfService.buyUpgrade(client, 1, RECRUITS)

      expect(result.error).toBe('Player not found')
    })

    test('rejects a purchase with insufficient tokens', async () => {
      const { client, state } = createFakeClient({ tokens: 10 }) // recruits tier 0 costs 50

      const result = await SelfService.buyUpgrade(client, 1, RECRUITS)

      expect(result.error).toBe('Insufficient tokens')
      expect(state.tokens).toBe(10) // untouched
    })

    test('rejects a purchase of an already-maxed upgrade', async () => {
      const { client } = createFakeClient({ tokens: 99999, tiers: { [DOCKED_SHIPS]: 5 } })

      const result = await SelfService.buyUpgrade(client, 1, DOCKED_SHIPS)

      expect(result.error).toBe('Upgrade already maxed')
    })

    test('rejects a purchase of a dynamic-ceiling upgrade once maxed against the live catalog count', async () => {
      const { client } = createFakeClient({
        tokens: 99999,
        tiers: { [SHOP_ITEMS]: 11 },
        shopCatalogCount: 16,
      })

      const result = await SelfService.buyUpgrade(client, 1, SHOP_ITEMS)

      expect(result.error).toBe('Upgrade already maxed')
    })

    test('accepts a numeric-looking string id the same as the number (route params arrive as strings)', async () => {
      const { client, state } = createFakeClient({ tokens: 1000 })

      const result = await SelfService.buyUpgrade(client, 1, String(RECRUITS))

      expect(result.success).toBe(true)
      expect(state.tiers[RECRUITS]).toBe(1)
    })

    test('deducts the tier-0 cost and increments the tier on a successful purchase', async () => {
      const { client, state } = createFakeClient({ tokens: 1000 })

      const result = await SelfService.buyUpgrade(client, 1, RECRUITS)

      expect(result.success).toBe(true)
      expect(result.tokens).toBe(950) // 1000 - 50
      expect(state.tiers[RECRUITS]).toBe(1)
      expect(result.upgrade).toMatchObject({ id: RECRUITS, tier: 1, currentValue: 6 })
    })

    test('applies the recruits effect to players.max_recruits', async () => {
      const { client, state } = createFakeClient({ tokens: 1000 })
      await SelfService.buyUpgrade(client, 1, RECRUITS)
      expect(state.columnUpdates.max_recruits).toBe(6) // baseValue 5 + tier 1
    })

    test('applies the missionList effect to players.max_available_missions', async () => {
      const { client, state } = createFakeClient({ tokens: 1000 })
      await SelfService.buyUpgrade(client, 1, MISSION_LIST)
      expect(state.columnUpdates.max_available_missions).toBe(6)
    })

    test('applies the shopItems effect to players.shop_rotation_size', async () => {
      const { client, state } = createFakeClient({ tokens: 1000 })
      await SelfService.buyUpgrade(client, 1, SHOP_ITEMS)
      expect(state.columnUpdates.shop_rotation_size).toBe(6)
    })

    test('applies the inventorySpace effect to players.inventory_capacity', async () => {
      const { client, state } = createFakeClient({ tokens: 1000 })
      await SelfService.buyUpgrade(client, 1, INVENTORY_SPACE)
      expect(state.columnUpdates.inventory_capacity).toBe(6)
    })

    test('applies the shopRefreshSpeed effect to players.shop_refresh_interval_ms, decremented and floored', async () => {
      const { client, state } = createFakeClient({
        tokens: 1000,
        tiers: { [SHOP_REFRESH_SPEED]: 9 },
      }) // one tier from the floor
      await SelfService.buyUpgrade(client, 1, SHOP_REFRESH_SPEED)
      expect(state.columnUpdates.shop_refresh_interval_ms).toBe(600000) // floored, not 900000 - 10*30000 = 600000 exactly at floor
    })

    test('applies the missionRefreshSpeed effect to players.mission_refresh_interval_ms', async () => {
      const { client, state } = createFakeClient({ tokens: 1000 })
      await SelfService.buyUpgrade(client, 1, MISSION_REFRESH_SPEED)
      expect(state.columnUpdates.mission_refresh_interval_ms).toBe(870000) // 900000 - 1*30000
    })

    test('applies the hpRegenSpeed effect to players.hp_regen_interval_ms, decremented by 5s per tier', async () => {
      const { client, state } = createFakeClient({ tokens: 1000 })
      await SelfService.buyUpgrade(client, 1, HP_REGEN_SPEED)
      expect(state.columnUpdates.hp_regen_interval_ms).toBe(55000) // 60000 - 1*5000
    })

    test('applies the dockedShips effect by inserting a capacity:1 docking_stations row instead of updating a column', async () => {
      const { client, state } = createFakeClient({ tokens: 1000 })

      const result = await SelfService.buyUpgrade(client, 1, DOCKED_SHIPS)

      expect(result.success).toBe(true)
      expect(state.dockingStationInserts).toEqual([1])
      expect(state.columnUpdates.docking_stations).toBeUndefined()
    })

    test('a second purchase of the same upgrade builds on the first tier, not tier 0 again', async () => {
      const { client, state } = createFakeClient({ tokens: 1000 })

      await SelfService.buyUpgrade(client, 1, RECRUITS) // tier 0 -> 1, costs 50
      const second = await SelfService.buyUpgrade(client, 1, RECRUITS) // tier 1 -> 2, costs 65

      expect(second.success).toBe(true)
      expect(state.tiers[RECRUITS]).toBe(2)
      expect(state.tokens).toBe(1000 - 50 - 65)
      expect(state.columnUpdates.max_recruits).toBe(7) // baseValue 5 + tier 2
    })
  })
})
