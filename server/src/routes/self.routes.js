const express = require('express')
const { pool } = require('../db/pool')
const SelfService = require('../services/self.service')

const router = express.Router()
const PLAYER_ID = 1

router.get('/upgrades', async (_req, res, next) => {
  const client = await pool.connect()
  try {
    const catalog = await SelfService.getUpgradeCatalog(client, PLAYER_ID)
    res.json(catalog)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.post('/upgrades/:id/buy', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await SelfService.buyUpgrade(client, PLAYER_ID, Number(req.params.id))
    if (result.error) {
      await client.query('ROLLBACK')
      res.status(400).json(result)
      return
    }
    await client.query('COMMIT')
    res.json(result)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
})

module.exports = router
