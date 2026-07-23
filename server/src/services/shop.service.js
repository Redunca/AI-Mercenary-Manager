const { pool } = require('../db/pool')
const ShipService = require('./ship.service')
const ConsumableService = require('./consumable.service')
const EquipmentService = require('./equipment.service')
const OperaService = require('./opera.service')
const { ATTRIBUTE_KEYS } = require('../domain/recruit')
const { sampleWithCoverage, pickOne } = require('../utils/random')
const { isRefreshDue, currentIntervalBoundary } = require('../utils/refreshWindow')

// The shop only has ever had one player (see V012's comment on
// next_template_id / mission_refresh_at for the same rationale) — this
// constant exists purely so getShopItems()/getShopItem() can be called with
// their old, player-implicit signatures from routes.js.
const DEFAULT_PLAYER_ID = 1

// Historical defaults for the rotation size and refresh interval: as of the
// self-upgrades session these are per-player, stored on players.shop_rotation_size
// / players.shop_refresh_interval_ms (see V015) and grown by the "shopItems"
// / "shopRefreshSpeed" upgrades in self.service.js. These constants now only
// seed those columns' defaults (see V015) — refreshShopRotation() reads the
// live per-player values instead.
const SHOP_ROTATION_SIZE = 5
const SHOP_REFRESH_INTERVAL_MS = 15 * 60 * 1000

/**
 * Draws the next live rotation from the master catalog: exactly one ship
 * (uniform-random among ships in the pool, if any exist), every item
 * flagged is_quest_item (so an Opera step targeting one by name is never
 * stuck waiting on rotation luck), plus enough additional items -
 * uniform-random from the rest of the pool - to fill out the rotation.
 * Capped at the pool size so small pools (e.g. in tests) don't blow up.
 *
 * Pure function of the pool passed in; exported for direct unit testing.
 */
function drawShopRotation(masterPool, rotationSize = SHOP_ROTATION_SIZE) {
  if (!masterPool || masterPool.length === 0) return []

  const ships = masterPool.filter((item) => item.type === 'ship')
  const guaranteedShip = ships.length > 0 ? pickOne(ships) : null

  const guaranteedQuestItems = masterPool.filter(
    (item) => item.is_quest_item && (!guaranteedShip || item.id !== guaranteedShip.id),
  )

  const guaranteed = guaranteedShip
    ? [guaranteedShip, ...guaranteedQuestItems]
    : guaranteedQuestItems
  const guaranteedIds = new Set(guaranteed.map((item) => item.id))

  const remainingSlots = rotationSize - guaranteed.length
  const rest = masterPool.filter((item) => !guaranteedIds.has(item.id))

  const fillers = sampleWithCoverage(rest, Math.min(Math.max(remainingSlots, 0), rest.length))

  return [...guaranteed, ...fillers]
}

// Discards this player's current 5 live listings and draws a fresh set from
// the permanent master catalog (which is never deleted from). Anything
// still unbought in the old rotation is simply dropped from the row set;
// shop_items rows themselves persist regardless (purchase_history.item_id
// has a hard FK to them). The newly drawn rotation starts each item back at
// its full max_stock.
async function refreshShopRotation(client, playerId, now) {
  const playerResult = await client.query(
    'SELECT shop_rotation_size, shop_refresh_interval_ms FROM players WHERE id = $1',
    [playerId],
  )
  const { shop_rotation_size: rotationSize, shop_refresh_interval_ms: refreshIntervalMs } =
    playerResult.rows[0]

  const pool = (await client.query('SELECT * FROM shop_items ORDER BY id')).rows
  const chosen = drawShopRotation(pool, rotationSize)

  await client.query('DELETE FROM shop_rotation WHERE player_id = $1', [playerId])
  for (const item of chosen) {
    await client.query(
      'INSERT INTO shop_rotation (player_id, shop_item_id, remaining_stock) VALUES ($1, $2, $3)',
      [playerId, item.id, item.max_stock],
    )
  }

  const refreshedAt = new Date(currentIntervalBoundary(now, refreshIntervalMs))
  await client.query('UPDATE players SET shop_refresh_at = $1 WHERE id = $2', [
    refreshedAt,
    playerId,
  ])
  return refreshedAt
}

// Computed lazily, at state read/purchase time: no background scheduler. If
// the wall-clock boundary (at the player's current shop_refresh_interval_ms)
// has moved on since the last recorded refresh (or nothing has been drawn
// yet), draw a new rotation.
async function ensureShopRotation(client, playerId, now = new Date()) {
  const result = await client.query(
    'SELECT shop_refresh_at, shop_refresh_interval_ms FROM players WHERE id = $1',
    [playerId],
  )
  const row = result.rows[0]
  if (isRefreshDue(row?.shop_refresh_at, now, row?.shop_refresh_interval_ms)) {
    await refreshShopRotation(client, playerId, now)
  }
}

async function getShopItems(client, playerId = DEFAULT_PLAYER_ID, now = new Date()) {
  await ensureShopRotation(client, playerId, now)
  const result = await client.query(
    `SELECT si.*, sr.remaining_stock FROM shop_items si
     JOIN shop_rotation sr ON sr.shop_item_id = si.id
     WHERE sr.player_id = $1
     ORDER BY si.type, si.rarity, si.price`,
    [playerId],
  )
  return result.rows
}

async function getShopItem(client, itemId, playerId = DEFAULT_PLAYER_ID, now = new Date()) {
  await ensureShopRotation(client, playerId, now)
  const result = await client.query(
    `SELECT si.*, sr.remaining_stock FROM shop_items si
     JOIN shop_rotation sr ON sr.shop_item_id = si.id
     WHERE sr.player_id = $1 AND si.id = $2`,
    [playerId, itemId],
  )
  return result.rows[0] || null
}

// Same as getShopItem, but locks the rotation row (FOR UPDATE) so a
// concurrent purchase of the same listing can't both read stock as
// available before either one writes back the decrement. Only used from
// the buy* functions, which run inside a transaction.
async function lockRotationItem(client, playerId, itemId) {
  const result = await client.query(
    `SELECT si.*, sr.remaining_stock FROM shop_items si
     JOIN shop_rotation sr ON sr.shop_item_id = si.id
     WHERE sr.player_id = $1 AND si.id = $2
     FOR UPDATE OF sr`,
    [playerId, itemId],
  )
  return result.rows[0] || null
}

// Shared purchase flow behind buyShip/buyConsumable/buyArmor: lock the
// player row and refresh the rotation if due, find+lock the listing and
// check its type/stock/price, hand off to `fulfill` for the type-specific
// side effect (create the ship/consumable/equipment; may itself fail, e.g.
// docking capacity or a full stash), then deduct the wallet, record the
// purchase, fire the Opera hooks, and decrement stock. `fulfill`'s return
// value is spread into the final result, so it supplies the response's
// type-specific key (`ship`/`consumable`/`equipment`).
async function purchaseShopItem(
  client,
  playerId,
  shopItemId,
  { itemType, notFoundError, outOfStockError, quantity = 1, now = new Date(), fulfill },
) {
  const player = await client.query(
    'SELECT wallet, shop_refresh_at, shop_refresh_interval_ms FROM players WHERE id = $1 FOR UPDATE',
    [playerId],
  )
  if (player.rows.length === 0) return { error: 'Player not found' }

  if (isRefreshDue(player.rows[0].shop_refresh_at, now, player.rows[0].shop_refresh_interval_ms)) {
    await refreshShopRotation(client, playerId, now)
  }

  const item = await lockRotationItem(client, playerId, shopItemId)
  if (!item || item.type !== itemType) {
    return { error: notFoundError }
  }

  if (item.remaining_stock < quantity) {
    return { error: outOfStockError }
  }

  const totalCost = item.price * quantity
  if (player.rows[0].wallet < totalCost) {
    return { error: 'Insufficient credit' }
  }

  const fulfilled = await fulfill(item)
  if (fulfilled.error) return fulfilled

  // Deduct from wallet
  const newWallet = player.rows[0].wallet - totalCost
  await client.query('UPDATE players SET wallet = $1 WHERE id = $2', [newWallet, playerId])

  // Record purchase
  await client.query(
    `INSERT INTO purchase_history (player_id, item_id, item_type, price_paid)
     VALUES ($1, $2, $3, $4)`,
    [playerId, shopItemId, itemType, totalCost],
  )

  await OperaService.recordOperaAction(client, playerId, 'purchase_item', {
    itemName: item.name,
    itemType: item.type,
  })
  if (item.is_quest_item) {
    await OperaService.recordOperaAction(client, playerId, 'purchase_quest_item', {
      itemName: item.name,
    })
  }

  await client.query(
    'UPDATE shop_rotation SET remaining_stock = remaining_stock - $1 WHERE player_id = $2 AND shop_item_id = $3',
    [quantity, playerId, shopItemId],
  )

  return { success: true, wallet: newWallet, ...fulfilled }
}

async function buyShip(client, playerId, shopItemId, now = new Date()) {
  return purchaseShopItem(client, playerId, shopItemId, {
    itemType: 'ship',
    notFoundError: 'Ship not found',
    outOfStockError: 'Ship already purchased',
    now,
    fulfill: async (item) => {
      // Docked-ship cap is total ships owned (deleted_at IS NULL), not "currently
      // at the station" — there's no separate docked/in-mission distinction for
      // capacity purposes. Effective cap is SUM(docking_stations.capacity),
      // grown by the "dockedShips" self-upgrade (see self.service.js), which
      // inserts an extra capacity:1 row rather than updating a single column.
      const shipCount = (
        await client.query(
          'SELECT COUNT(*)::int AS count FROM ships WHERE player_id = $1 AND deleted_at IS NULL',
          [playerId],
        )
      ).rows[0].count
      const dockingCapacity = (
        await client.query(
          'SELECT COALESCE(SUM(capacity), 0)::int AS capacity FROM docking_stations WHERE player_id = $1',
          [playerId],
        )
      ).rows[0].capacity
      if (shipCount >= dockingCapacity) {
        return { error: 'Docking capacity full' }
      }

      // Create ship from shop item
      const nextShipId = await client.query('SELECT next_ship_id FROM players WHERE id = $1', [
        playerId,
      ])
      const shipId = nextShipId.rows[0].next_ship_id

      const stats = item.stats || {
        speed: 100,
        capacity: 1,
        inventory_space: 0,
        durability: 10,
        price: 0,
      }
      const shipData = {
        id: shipId,
        name: item.name,
        rarity: item.rarity,
        stats: { max_durability: stats.durability, ...stats },
      }

      await ShipService.createShip(client, playerId, shipData)
      await client.query('UPDATE players SET next_ship_id = next_ship_id + 1 WHERE id = $1', [
        playerId,
      ])

      return { ship: await ShipService.getShip(client, playerId, shipId) }
    },
  })
}

async function buyConsumable(client, playerId, shopItemId, quantity = 1, now = new Date()) {
  return purchaseShopItem(client, playerId, shopItemId, {
    itemType: 'consumable',
    notFoundError: 'Consumable not found',
    outOfStockError: 'Not enough stock remaining',
    quantity,
    now,
    fulfill: async (item) => {
      // Purchased consumables start in the player's stash (not assigned to any
      // ship); they only take effect once loaded into a ship's inventory.
      const consumable = await ConsumableService.addToStash(client, playerId, {
        name: item.name,
        description: item.description,
        rarity: item.rarity,
        price: item.price,
        effect: item.effect,
        effectData: item.effect_data,
        quantity,
      })
      if (!consumable) return { error: 'Stash is full' }
      return { consumable }
    },
  })
}

async function buyArmor(client, playerId, shopItemId, now = new Date()) {
  return purchaseShopItem(client, playerId, shopItemId, {
    itemType: 'armor',
    notFoundError: 'Armor not found',
    outOfStockError: 'Armor already purchased',
    now,
    fulfill: async (item) => ({
      equipment: await EquipmentService.buyArmor(client, playerId, item, item.price),
    }),
  })
}

const ATTRIBUTE_ITEM_NAMES = {
  agility: 'Agility Stimpack',
  fortitude: 'Fortitude Draught',
  might: 'Might Injector',
  learning: 'Learning Codex',
  logic: 'Logic Processor',
  perception: 'Perception Lens',
  will: 'Will Anchor',
  deception: 'Deception Mask',
  persuasion: 'Persuasion Chip',
  presence: 'Presence Aura',
}

// Uncommon consumables (the 10 attribute boosts + Overdrive Injector) get 3
// units of stock per rotation cycle; rare consumables (Trauma Nanites, Hull
// Auto-Patch) get 2. Kept in sync with V013__shop_rotation.sql's UPDATEs,
// which backfill the same values for rows seeded before this column existed.
const MAX_STOCK_BY_RARITY = {
  uncommon: 3,
  rare: 2,
}

function buildAttributeConsumables() {
  return ATTRIBUTE_KEYS.map((attribute) => ({
    name: ATTRIBUTE_ITEM_NAMES[attribute],
    description: `Grants Advantage 1 on the next event using ${attribute}. Must be in the ship's inventory; consumed once used.`,
    type: 'consumable',
    rarity: 'uncommon',
    price: 400,
    effect: 'ATTRIBUTE_BOOST',
    effectData: { attribute, advantage: 1 },
  }))
}

async function seedShopItems(client) {
  const ships = [
    {
      name: 'Corsair',
      description: 'A light, fast ship',
      type: 'ship',
      rarity: 'common',
      price: 5000,
      stats: {
        speed: 120,
        capacity: 2,
        inventory_space: 10,
        durability: 8,
        max_durability: 8,
        price: 5000,
      },
    },
    {
      name: 'Frigate',
      description: 'A balanced ship with good capacity',
      type: 'ship',
      rarity: 'rare',
      price: 12000,
      stats: {
        speed: 100,
        capacity: 4,
        inventory_space: 20,
        durability: 15,
        max_durability: 15,
        price: 12000,
      },
    },
    {
      name: 'Cruiser',
      description: 'A heavy, powerful ship',
      type: 'ship',
      rarity: 'epic',
      price: 25000,
      stats: {
        speed: 80,
        capacity: 6,
        inventory_space: 30,
        durability: 25,
        max_durability: 25,
        price: 25000,
      },
    },
  ]

  const consumables = [
    ...buildAttributeConsumables(),
    {
      name: 'Trauma Nanites',
      description:
        "The instant a crew member would die, revives them to full health. Must be in the ship's inventory; consumed automatically.",
      type: 'consumable',
      rarity: 'rare',
      price: 2500,
      effect: 'HEAL',
      effectData: {},
    },
    {
      name: 'Hull Auto-Patch',
      description:
        "The instant the ship would break down, repairs it back to full durability. Must be in the ship's inventory; consumed automatically.",
      type: 'consumable',
      rarity: 'rare',
      price: 2000,
      effect: 'REPAIR',
      effectData: {},
    },
    {
      name: 'Overdrive Injector',
      description:
        "Used when launching a mission: temporarily boosts the ship's speed, shortening travel to and from the mission.",
      type: 'consumable',
      rarity: 'uncommon',
      price: 1200,
      effect: 'SPEED_BOOST',
      effectData: { multiplier: 1.5 },
    },
  ]

  // Open Legend core rules, armor table (06-wealth-equipment): 5 base
  // archetypes seeded as a static catalog, not procedurally generated.
  const armors = [
    {
      name: 'Leather Armor',
      description: 'Light armor. Requires Fortitude 0 to benefit from its protection.',
      rarity: 'common',
      price: 600,
      stats: { armorType: 'light', guardBonus: 1, requiredFortitude: 0, speedPenalty: 0 },
      maxStock: 3,
    },
    {
      name: 'Armored Trench Coat',
      description: 'Medium armor. Requires Fortitude 2 to benefit from its protection.',
      rarity: 'rare',
      price: 3000,
      stats: { armorType: 'medium', guardBonus: 2, requiredFortitude: 2, speedPenalty: 0 },
      maxStock: 2,
    },
    {
      name: 'Chainmail',
      description: 'Medium armor. Requires Fortitude 3 to benefit from its protection.',
      rarity: 'uncommon',
      price: 1800,
      stats: { armorType: 'medium', guardBonus: 2, requiredFortitude: 3, speedPenalty: 0 },
      maxStock: 2,
    },
    {
      name: 'Plate Mail',
      description: 'Heavy armor. Requires Fortitude 3 to benefit from its protection.',
      rarity: 'uncommon',
      price: 2200,
      stats: { armorType: 'heavy', guardBonus: 3, requiredFortitude: 3, speedPenalty: 5 },
      maxStock: 1,
    },
    {
      name: 'Power Armor',
      description: 'Heavy armor. Requires Fortitude 1 to benefit from its protection.',
      rarity: 'epic',
      price: 6000,
      stats: { armorType: 'heavy', guardBonus: 3, requiredFortitude: 1, speedPenalty: 0 },
      maxStock: 1,
    },
  ]

  for (const ship of ships) {
    await client.query(
      `INSERT INTO shop_items (name, description, type, rarity, price, stats, available, max_stock)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, 1)
       ON CONFLICT DO NOTHING`,
      [ship.name, ship.description, ship.type, ship.rarity, ship.price, JSON.stringify(ship.stats)],
    )
  }

  for (const armor of armors) {
    await client.query(
      `INSERT INTO shop_items (name, description, type, rarity, price, stats, available, max_stock)
       VALUES ($1, $2, 'armor', $3, $4, $5, TRUE, $6)
       ON CONFLICT DO NOTHING`,
      [
        armor.name,
        armor.description,
        armor.rarity,
        armor.price,
        JSON.stringify(armor.stats),
        armor.maxStock,
      ],
    )
  }

  for (const item of consumables) {
    const maxStock = MAX_STOCK_BY_RARITY[item.rarity] || 1
    await client.query(
      `INSERT INTO shop_items (name, description, type, rarity, price, effect, effect_data, available, max_stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
       ON CONFLICT DO NOTHING`,
      [
        item.name,
        item.description,
        item.type,
        item.rarity,
        item.price,
        item.effect,
        JSON.stringify(item.effectData),
        maxStock,
      ],
    )
  }
}

module.exports = {
  getShopItems,
  getShopItem,
  buyShip,
  buyConsumable,
  buyArmor,
  seedShopItems,
  drawShopRotation,
  ensureShopRotation,
  refreshShopRotation,
  SHOP_ROTATION_SIZE,
  SHOP_REFRESH_INTERVAL_MS,
}
