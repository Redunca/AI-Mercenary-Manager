const { pool } = require('../db/pool')

async function getPlayerEquipment(client, playerId, unassignedOnly = false) {
  let query = 'SELECT * FROM equipment WHERE player_id = $1'
  const params = [playerId]

  if (unassignedOnly) {
    query += ' AND assigned_to_ship IS NULL'
  }

  query += ' ORDER BY created_at'

  const result = await client.query(query, params)
  return result.rows
}

async function getEquipment(client, equipmentId) {
  const result = await client.query(
    'SELECT * FROM equipment WHERE id = $1',
    [equipmentId]
  )
  return result.rows[0]
}

async function createEquipment(client, playerId, equipmentData) {
  const { name, description, rarity, price, effect, quantity = 1 } = equipmentData

  const result = await client.query(
    `INSERT INTO equipment (player_id, name, description, rarity, price, effect, quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [playerId, name, description, rarity, price, effect, quantity]
  )
  return result.rows[0]
}

async function assignEquipmentToShip(client, equipmentId, shipId) {
  const result = await client.query(
    `UPDATE equipment 
     SET assigned_to_ship = $1 
     WHERE id = $2
     RETURNING *`,
    [shipId, equipmentId]
  )
  return result.rows[0]
}

async function unassignEquipmentFromShip(client, equipmentId) {
  const result = await client.query(
    `UPDATE equipment 
     SET assigned_to_ship = NULL 
     WHERE id = $1
     RETURNING *`,
    [equipmentId]
  )
  return result.rows[0]
}

async function consumeEquipment(client, equipmentId) {
  const result = await client.query(
    `UPDATE equipment 
     SET quantity = quantity - 1 
     WHERE id = $1 AND quantity > 0
     RETURNING *`,
    [equipmentId]
  )
  return result.rows[0]
}

async function getShipEquipment(client, shipId) {
  const result = await client.query(
    'SELECT * FROM equipment WHERE assigned_to_ship = $1 ORDER BY created_at',
    [shipId]
  )
  return result.rows
}

module.exports = {
  getPlayerEquipment,
  getEquipment,
  createEquipment,
  assignEquipmentToShip,
  unassignEquipmentFromShip,
  consumeEquipment,
  getShipEquipment,
}