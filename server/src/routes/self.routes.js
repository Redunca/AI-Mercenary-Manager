const express = require('express')
const { withClient } = require('../db/pool')
const SelfService = require('../services/self.service')
const OperaService = require('../services/opera.service')

const router = express.Router()
const PLAYER_ID = 1

router.get(
  '/upgrades',
  withClient(async (client, _req, res) => {
    const catalog = await SelfService.getUpgradeCatalog(client, PLAYER_ID)
    res.json(catalog)
  }),
)

router.post(
  '/upgrades/:id/buy',
  withClient(async (client, req, res) => {
    await client.query('BEGIN')
    const result = await SelfService.buyUpgrade(client, PLAYER_ID, Number(req.params.id))
    if (result.error) {
      await client.query('ROLLBACK')
      res.status(400).json(result)
      return
    }
    // Cheap no-op for every upgrade except Concurrent Operas -- immediately
    // fills a newly-bought slot instead of waiting for the next bootstrap.
    await OperaService.maintainOperaSlots(client, PLAYER_ID)
    await client.query('COMMIT')
    res.json(result)
  }),
)

module.exports = router
