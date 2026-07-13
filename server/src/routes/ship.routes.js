const express = require('express')
const { pool } = require('../db/pool')
const ShipService = require('../services/ship.service')
const ConsumableService = require('../services/consumable.service')

const router = express.Router()
const PLAYER_ID = 1

router.get('/', async (_req, res, next) => {
  const client = await pool.connect()
  try {
    const ships = await ShipService.getShips(client, PLAYER_ID)
    res.json(ships)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.get('/:id', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const ship = await ShipService.getShip(client, PLAYER_ID, Number(req.params.id))
    if (!ship) return res.status(404).json({ error: 'Ship not found' })
    res.json(ship)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.post('/:id/crew', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const { recruitIds } = req.body
    if (!Array.isArray(recruitIds) || recruitIds.length === 0) {
      return res.status(400).json({ error: 'recruitIds required' })
    }
    let ship
    for (const recruitId of recruitIds) {
      const updated = await ShipService.appendCrewMember(client, PLAYER_ID, Number(req.params.id), Number(recruitId))
      if (updated) ship = updated
    }
    if (!ship) {
      // No update: all recruits were already part of the crew.
      // Check that the ship really exists before responding.
      ship = await ShipService.getShip(client, PLAYER_ID, Number(req.params.id))
      if (!ship) return res.status(404).json({ error: 'Ship not found' })
    }
    res.json(ship)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.delete('/:id/crew/:recruitId', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const ship = await ShipService.removeCrewMember(
      client, PLAYER_ID, Number(req.params.id), Number(req.params.recruitId)
    )
    if (!ship) return res.status(404).json({ error: 'Ship not found' })
    res.json(ship)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.patch('/:id', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    const ship = await ShipService.renameShip(client, PLAYER_ID, Number(req.params.id), name)
    if (!ship) return res.status(404).json({ error: 'Ship not found' })
    res.json(ship)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.get('/:id/inventory', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const inventory = await ConsumableService.getShipInventory(client, Number(req.params.id))
    res.json(inventory)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.post('/:id/inventory', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const { consumableId, quantity } = req.body
    if (!consumableId) return res.status(400).json({ error: 'consumableId required' })
    const result = await ConsumableService.assignToShip(
      client, PLAYER_ID, Number(consumableId), Number(req.params.id), Number(quantity ?? 1)
    )
    if (!result) return res.status(400).json({ error: 'Consumable not found or insufficient quantity' })
    res.json(result)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.delete('/:id/inventory/:consumableId', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const quantity = Number(req.body?.quantity ?? 1)
    const result = await ConsumableService.unassignFromShip(
      client, PLAYER_ID, Number(req.params.consumableId), quantity
    )
    if (!result) return res.status(400).json({ error: 'Consumable not found or insufficient quantity' })
    res.json(result)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

module.exports = router
