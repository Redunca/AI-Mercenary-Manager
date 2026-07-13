const express = require('express')
const { pool } = require('../db/pool')
const ConsumableService = require('../services/consumable.service')

const router = express.Router()
const PLAYER_ID = 1

router.get('/', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const unassignedOnly = req.query.unassigned === 'true'
    const consumables = await ConsumableService.getPlayerConsumables(client, PLAYER_ID, unassignedOnly)
    res.json(consumables)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

module.exports = router
