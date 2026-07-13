const { pool } = require('../db/pool')

async function getPlayerConsumables(client, playerId, unassignedOnly = false) {
  let query = 'SELECT * FROM consumables WHERE player_id = $1'
  const params = [playerId]

  if (unassignedOnly) {
    query += ' AND assigned_to_ship IS NULL'
  }

  query += ' ORDER BY created_at'

  const result = await client.query(query, params)
  return result.rows
}

async function getConsumable(client, consumableId) {
  const result = await client.query(
    'SELECT * FROM consumables WHERE id = $1',
    [consumableId]
  )
  return result.rows[0]
}

async function getShipInventory(client, shipId) {
  const result = await client.query(
    'SELECT * FROM consumables WHERE assigned_to_ship = $1 ORDER BY created_at',
    [shipId]
  )
  return result.rows
}

// Purchased consumables land in the player's stash (assigned_to_ship IS NULL),
// merging into an existing stack of the same item rather than creating a
// duplicate row.
async function addToStash(client, playerId, { name, description, rarity, price, effect, effectData, quantity = 1 }) {
  const existing = await client.query(
    'SELECT * FROM consumables WHERE player_id = $1 AND name = $2 AND assigned_to_ship IS NULL',
    [playerId, name]
  )

  if (existing.rows.length > 0) {
    const updated = await client.query(
      'UPDATE consumables SET quantity = quantity + $1 WHERE id = $2 RETURNING *',
      [quantity, existing.rows[0].id]
    )
    return updated.rows[0]
  }

  const inserted = await client.query(
    `INSERT INTO consumables (player_id, name, description, rarity, price, effect, effect_data, quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [playerId, name, description, rarity, price, effect, JSON.stringify(effectData ?? {}), quantity]
  )
  return inserted.rows[0]
}

async function moveStack(client, playerId, consumableId, destinationShipId, quantity = 1) {
  const source = await getConsumable(client, consumableId)
  if (!source || source.player_id !== playerId || source.quantity < quantity) return null

  if (source.quantity === quantity) {
    await client.query('DELETE FROM consumables WHERE id = $1', [source.id])
  } else {
    await client.query('UPDATE consumables SET quantity = quantity - $1 WHERE id = $2', [quantity, source.id])
  }

  const destinationQuery = destinationShipId === null
    ? client.query(
      'SELECT * FROM consumables WHERE player_id = $1 AND name = $2 AND assigned_to_ship IS NULL',
      [playerId, source.name]
    )
    : client.query(
      'SELECT * FROM consumables WHERE player_id = $1 AND name = $2 AND assigned_to_ship = $3',
      [playerId, source.name, destinationShipId]
    )
  const destination = await destinationQuery

  if (destination.rows.length > 0) {
    const updated = await client.query(
      'UPDATE consumables SET quantity = quantity + $1 WHERE id = $2 RETURNING *',
      [quantity, destination.rows[0].id]
    )
    return updated.rows[0]
  }

  const inserted = await client.query(
    `INSERT INTO consumables (player_id, name, description, rarity, price, effect, effect_data, quantity, assigned_to_ship)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [playerId, source.name, source.description, source.rarity, source.price, source.effect,
      JSON.stringify(source.effect_data ?? {}), quantity, destinationShipId]
  )
  return inserted.rows[0]
}

function assignToShip(client, playerId, consumableId, shipId, quantity = 1) {
  return moveStack(client, playerId, consumableId, shipId, quantity)
}

function unassignFromShip(client, playerId, consumableId, quantity = 1) {
  return moveStack(client, playerId, consumableId, null, quantity)
}

// Looks up and spends one matching consumable from a ship's own inventory.
// Used for effects that trigger automatically during a mission (attribute
// advantage, auto-heal, auto-repair) rather than being explicitly "used" by
// the player. Returns the pre-spend row, or null if nothing matched.
async function consumeFromShipInventory(client, shipId, effect, matchEffectData) {
  const result = await client.query(
    'SELECT * FROM consumables WHERE assigned_to_ship = $1 AND effect = $2 ORDER BY id',
    [shipId, effect]
  )
  const match = matchEffectData ? result.rows.find(row => matchEffectData(row.effect_data)) : result.rows[0]
  if (!match) return null

  if (match.quantity <= 1) {
    await client.query('DELETE FROM consumables WHERE id = $1', [match.id])
  } else {
    await client.query('UPDATE consumables SET quantity = quantity - 1 WHERE id = $1', [match.id])
  }
  return match
}

module.exports = {
  getPlayerConsumables,
  getConsumable,
  getShipInventory,
  addToStash,
  assignToShip,
  unassignFromShip,
  consumeFromShipInventory,
}
