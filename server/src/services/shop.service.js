const { pool } = require('../db/pool')
const ShipService = require('./ship.service')
const ConsumableService = require('./consumable.service')
const { ATTRIBUTE_KEYS } = require('../domain/recruit')

async function getShopItems(client) {
  const result = await client.query(
    'SELECT * FROM shop_items WHERE available = TRUE ORDER BY type, rarity, price'
  )
  return result.rows
}

async function getShopItem(client, itemId) {
  const result = await client.query(
    'SELECT * FROM shop_items WHERE id = $1 AND available = TRUE',
    [itemId]
  )
  return result.rows[0] || null
}

async function getPlayerWallet(client, playerId) {
  const result = await client.query(
    'SELECT wallet FROM players WHERE id = $1',
    [playerId]
  )
  return result.rows[0]?.wallet || 0
}

async function buyShip(client, playerId, shopItemId) {
  const player = await client.query(
    'SELECT wallet FROM players WHERE id = $1 FOR UPDATE',
    [playerId]
  )
  if (player.rows.length === 0) return { error: 'Player not found' }

  const item = await getShopItem(client, shopItemId)
  if (!item || item.type !== 'ship') {
    return { error: 'Ship not found' }
  }

  if (player.rows[0].wallet < item.price) {
    return { error: 'Insufficient credit' }
  }

  // Create ship from shop item
  const nextShipId = await client.query(
    'SELECT next_ship_id FROM players WHERE id = $1',
    [playerId]
  )
  const shipId = nextShipId.rows[0].next_ship_id

  const stats = item.stats || { speed: 100, capacity: 1, inventory_space: 0, durability: 10, price: 0 }
  const shipData = {
    id: shipId,
    name: item.name,
    rarity: item.rarity,
    stats: { max_durability: stats.durability, ...stats },
  }

  await ShipService.createShip(client, playerId, shipData)

  // Deduct from wallet
  const newWallet = player.rows[0].wallet - item.price
  await client.query(
    'UPDATE players SET wallet = $1, next_ship_id = next_ship_id + 1 WHERE id = $2',
    [newWallet, playerId]
  )

  // Record purchase
  await client.query(
    `INSERT INTO purchase_history (player_id, item_id, item_type, price_paid)
     VALUES ($1, $2, $3, $4)`,
    [playerId, shopItemId, 'ship', item.price]
  )

  return { 
    success: true, 
    ship: await ShipService.getShip(client, playerId, shipId),
    wallet: newWallet
  }
}

async function buyConsumable(client, playerId, shopItemId, quantity = 1) {
  const player = await client.query(
    'SELECT wallet FROM players WHERE id = $1 FOR UPDATE',
    [playerId]
  )
  if (player.rows.length === 0) return { error: 'Player not found' }

  const item = await getShopItem(client, shopItemId)
  if (!item || item.type !== 'consumable') {
    return { error: 'Consumable not found' }
  }

  const totalCost = item.price * quantity
  if (player.rows[0].wallet < totalCost) {
    return { error: 'Insufficient credit' }
  }

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

  // Deduct from wallet
  const newWallet = player.rows[0].wallet - totalCost
  await client.query(
    'UPDATE players SET wallet = $1 WHERE id = $2',
    [newWallet, playerId]
  )

  // Record purchase
  await client.query(
    `INSERT INTO purchase_history (player_id, item_id, item_type, price_paid)
     VALUES ($1, $2, $3, $4)`,
    [playerId, shopItemId, 'consumable', totalCost]
  )

  return {
    success: true,
    consumable,
    wallet: newWallet
  }
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

function buildAttributeConsumables() {
  return ATTRIBUTE_KEYS.map(attribute => ({
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
      stats: { speed: 120, capacity: 2, inventory_space: 10, durability: 8, max_durability: 8, price: 5000 }
    },
    {
      name: 'Frigate',
      description: 'A balanced ship with good capacity',
      type: 'ship',
      rarity: 'rare',
      price: 12000,
      stats: { speed: 100, capacity: 4, inventory_space: 20, durability: 15, max_durability: 15, price: 12000 }
    },
    {
      name: 'Cruiser',
      description: 'A heavy, powerful ship',
      type: 'ship',
      rarity: 'epic',
      price: 25000,
      stats: { speed: 80, capacity: 6, inventory_space: 30, durability: 25, max_durability: 25, price: 25000 }
    }
  ]

  const consumables = [
    ...buildAttributeConsumables(),
    {
      name: 'Trauma Nanites',
      description: 'The instant a crew member would die, revives them to full health. Must be in the ship\'s inventory; consumed automatically.',
      type: 'consumable',
      rarity: 'rare',
      price: 2500,
      effect: 'HEAL',
      effectData: {},
    },
    {
      name: 'Hull Auto-Patch',
      description: 'The instant the ship would break down, repairs it back to full durability. Must be in the ship\'s inventory; consumed automatically.',
      type: 'consumable',
      rarity: 'rare',
      price: 2000,
      effect: 'REPAIR',
      effectData: {},
    },
    {
      name: 'Overdrive Injector',
      description: 'Used when launching a mission: temporarily boosts the ship\'s speed, shortening travel to and from the mission.',
      type: 'consumable',
      rarity: 'uncommon',
      price: 1200,
      effect: 'SPEED_BOOST',
      effectData: { multiplier: 1.5 },
    },
  ]

  for (const ship of ships) {
    await client.query(
      `INSERT INTO shop_items (name, description, type, rarity, price, stats, available)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT DO NOTHING`,
      [ship.name, ship.description, ship.type, ship.rarity, ship.price, JSON.stringify(ship.stats)]
    )
  }

  for (const item of consumables) {
    await client.query(
      `INSERT INTO shop_items (name, description, type, rarity, price, effect, effect_data, available)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       ON CONFLICT DO NOTHING`,
      [item.name, item.description, item.type, item.rarity, item.price, item.effect, JSON.stringify(item.effectData)]
    )
  }
}

module.exports = {
  getShopItems,
  getShopItem,
  getPlayerWallet,
  buyShip,
  buyConsumable,
  seedShopItems,
}