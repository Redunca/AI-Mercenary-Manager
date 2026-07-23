const express = require('express')
const { withClient } = require('../db/pool')
const ConsumableService = require('../services/consumable.service')

const router = express.Router()
const PLAYER_ID = 1

router.get(
  '/',
  withClient(async (client, req, res) => {
    const unassignedOnly = req.query.unassigned === 'true'
    const consumables = await ConsumableService.getPlayerConsumables(
      client,
      PLAYER_ID,
      unassignedOnly,
    )
    res.json(consumables)
  }),
)

module.exports = router
