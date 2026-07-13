const { pool } = require('../db/pool')
const ShipService = require('./ship.service')
const EquipmentService = require('./equipment.service')
const { createStarterShip } = require('../domain/ship')

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

  const shipData = {
    id: shipId,
    name: item.name,
    rarity: item.rarity,
    stats: item.stats || { speed: 100, capacity: 1, inventory_space: 0, durability: 10, price: 0 }
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

async function buyEquipment(client, playerId, shopItemId, quantity = 1) {
  const player = await client.query(
    'SELECT wallet FROM players WHERE id = $1 FOR UPDATE',
    [playerId]
  )
  if (player.rows.length === 0) return { error: 'Player not found' }

  const item = await getShopItem(client, shopItemId)
  if (!item || item.type !== 'equipment') {
    return { error: 'Equipment not found' }
  }

  const totalCost = item.price * quantity
  if (player.rows[0].wallet < totalCost) {
    return { error: 'Insufficient credit' }
  }

  // Create or update equipment
  const existingEquipment = await client.query(
    'SELECT * FROM equipment WHERE player_id = $1 AND name = $2',
    [playerId, item.name]
  )

  if (existingEquipment.rows.length > 0) {
    // Update quantity
    await client.query(
      'UPDATE equipment SET quantity = quantity + $1 WHERE player_id = $2 AND name = $3',
      [quantity, playerId, item.name]
    )
  } else {
    // Create new equipment
    await client.query(
      `INSERT INTO equipment (player_id, name, description, rarity, price, effect, quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [playerId, item.name, item.description, item.rarity, item.price, item.effect, quantity]
    )
  }

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
    [playerId, shopItemId, 'equipment', totalCost]
  )

  return { 
    success: true, 
    equipment: existingEquipment.rows[0] || await EquipmentService.getPlayerEquipment(client, playerId),
    wallet: newWallet
  }
}

async function seedShopItems(client) {
  const ships = [
    {
      name: 'Corsair',
      description: 'A light, fast ship',
      type: 'ship',
      rarity: 'common',
      price: 5000,
      stats: { speed: 120, capacity: 2, inventory_space: 10, durability: 8, price: 5000 }
    },
    {
      name: 'Frigate',
      description: 'A balanced ship with good capacity',
      type: 'ship',
      rarity: 'rare',
      price: 12000,
      stats: { speed: 100, capacity: 4, inventory_space: 20, durability: 15, price: 12000 }
    },
    {
      name: 'Cruiser',
      description: 'A heavy, powerful ship',
      type: 'ship',
      rarity: 'epic',
      price: 25000,
      stats: { speed: 80, capacity: 6, inventory_space: 30, durability: 25, price: 25000 }
    }
  ]

  const equipment = [
    {
      name: 'Reinforced Armor',
      description: 'Increases the ship\'s durability',
      type: 'equipment',
      rarity: 'common',
      price: 1000,
      effect: 'DURABILITY_BOOST'
    },
    {
      name: 'Turbo Engine',
      description: 'Increases the ship\'s speed',
      type: 'equipment',
      rarity: 'rare',
      price: 3000,
      effect: 'SPEED_BOOST'
    },
    {
      name: 'Storage Expansion',
      description: 'Increases inventory space',
      type: 'equipment',
      rarity: 'common',
      price: 500,
      effect: 'INVENTORY_BOOST'
    }
  ]

  for (const ship of ships) {
    await client.query(
      `INSERT INTO shop_items (name, description, type, rarity, price, stats, available)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT DO NOTHING`,
      [ship.name, ship.description, ship.type, ship.rarity, ship.price, JSON.stringify(ship.stats)]
    )
  }

  for (const item of equipment) {
    await client.query(
      `INSERT INTO shop_items (name, description, type, rarity, price, effect, available)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT DO NOTHING`,
      [item.name, item.description, item.type, item.rarity, item.price, item.effect]
    )
  }
}

module.exports = {
  getShopItems,
  getShopItem,
  getPlayerWallet,
  buyShip,
  buyEquipment,
  seedShopItems,
}