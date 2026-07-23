const { pool } = require('../db/pool')
const { createStarterShip, generateGalacticId } = require('../domain/ship')
const OperaService = require('./opera.service')

async function getShips(client, playerId) {
  const result = await client.query(
    'SELECT * FROM ships WHERE player_id = $1 AND deleted_at IS NULL ORDER BY created_at',
    [playerId],
  )
  return result.rows
}

async function getShip(client, playerId, shipId) {
  const result = await client.query(
    'SELECT * FROM ships WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL',
    [playerId, shipId],
  )
  return result.rows[0]
}

async function createShip(client, playerId, shipData) {
  const { name, rarity, stats } = shipData
  const galacticId = generateGalacticId()

  const result = await client.query(
    `INSERT INTO ships (player_id, id, name, galactic_id, rarity, stats, crew, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [playerId, shipData.id, name, galacticId, rarity, JSON.stringify(stats), '{}', 'docked'],
  )
  return result.rows[0]
}

async function assignCrewToShip(client, playerId, shipId, recruitIds) {
  const result = await client.query(
    `UPDATE ships 
     SET crew = $1 
     WHERE player_id = $2 AND id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [recruitIds, playerId, shipId],
  )
  return result.rows[0]
}

async function updateShipStatus(client, playerId, shipId, status) {
  const result = await client.query(
    `UPDATE ships 
     SET status = $1 
     WHERE player_id = $2 AND id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [status, playerId, shipId],
  )
  return result.rows[0]
}

async function destroyShip(client, playerId, shipId) {
  const result = await client.query(
    `UPDATE ships
     SET status = 'destroyed', deleted_at = NOW()
     WHERE player_id = $1 AND id = $2
     RETURNING *`,
    [playerId, shipId],
  )
  return result.rows[0]
}

// Reduces durability by `amount`; the ship becomes 'broken' (and unusable for
// missions) once durability hits 0. Returns null if the ship can't be found.
async function damageShip(client, playerId, shipId, amount) {
  const row = await client.query(
    'SELECT * FROM ships WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE',
    [playerId, shipId],
  )
  if (row.rows.length === 0) return null

  const ship = row.rows[0]
  const durability = Math.max(0, ship.stats.durability - amount)
  const stats = { ...ship.stats, durability }
  const status = durability === 0 ? 'broken' : ship.status

  const updated = await client.query(
    'UPDATE ships SET stats = $1, status = $2 WHERE player_id = $3 AND id = $4 RETURNING *',
    [JSON.stringify(stats), status, playerId, shipId],
  )
  return updated.rows[0]
}

// Restores durability to its ceiling and clears a 'broken' status.
async function repairShip(client, playerId, shipId) {
  const row = await client.query(
    'SELECT * FROM ships WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE',
    [playerId, shipId],
  )
  if (row.rows.length === 0) return null

  const ship = row.rows[0]
  const stats = { ...ship.stats, durability: ship.stats.max_durability ?? ship.stats.durability }
  const status = ship.status === 'broken' ? 'docked' : ship.status

  const updated = await client.query(
    'UPDATE ships SET stats = $1, status = $2 WHERE player_id = $3 AND id = $4 RETURNING *',
    [JSON.stringify(stats), status, playerId, shipId],
  )
  return updated.rows[0]
}

async function getHangar(client, playerId) {
  const result = await client.query('SELECT * FROM hangars WHERE player_id = $1', [playerId])
  return result.rows[0]
}

async function createHangar(client, playerId) {
  const result = await client.query(
    `INSERT INTO hangars (player_id, max_ships)
     VALUES ($1, $2)
     RETURNING *`,
    [playerId, 5],
  )
  return result.rows[0]
}

async function getDockingStations(client, playerId) {
  const result = await client.query(
    'SELECT * FROM docking_stations WHERE player_id = $1 ORDER BY id',
    [playerId],
  )
  return result.rows
}

async function createDockingStation(client, playerId, capacity = 5) {
  const result = await client.query(
    `INSERT INTO docking_stations (player_id, capacity)
     VALUES ($1, $2)
     RETURNING *`,
    [playerId, capacity],
  )
  return result.rows[0]
}

async function appendCrewMember(client, playerId, shipId, recruitId) {
  const result = await client.query(
    `UPDATE ships
     SET crew = array_append(crew, $3)
     WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL
       AND NOT ($3 = ANY(crew))
     RETURNING *`,
    [playerId, shipId, recruitId],
  )
  if (result.rows[0]) {
    await OperaService.recordOperaAction(client, playerId, 'assign_crew_to_ship', {
      shipId,
      recruitId,
    })
  }
  return result.rows[0]
}

async function removeCrewMember(client, playerId, shipId, recruitId) {
  const result = await client.query(
    `UPDATE ships
     SET crew = array_remove(crew, $3)
     WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [playerId, shipId, recruitId],
  )
  return result.rows[0]
}

async function renameShip(client, playerId, shipId, name) {
  const result = await client.query(
    `UPDATE ships
     SET name = $3
     WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [playerId, shipId, name],
  )
  return result.rows[0]
}

module.exports = {
  getShips,
  getShip,
  createShip,
  assignCrewToShip,
  appendCrewMember,
  removeCrewMember,
  renameShip,
  updateShipStatus,
  destroyShip,
  damageShip,
  repairShip,
  getHangar,
  createHangar,
  getDockingStations,
  createDockingStation,
}
