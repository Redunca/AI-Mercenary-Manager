const express = require('express')
const { pool } = require('../db/pool')
const shop = require('../services/shop.service')

const router = express.Router()
const PLAYER_ID = 1

router.get('/items', async (_req, res, next) => {
  const client = await pool.connect()
  try {
    const items = await shop.getShopItems(client)
    res.json(items)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.get('/items/:id', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const item = await shop.getShopItem(client, Number(req.params.id))
    if (!item) {
      res.status(404).json({ error: 'Article introuvable' })
      return
    }
    res.json(item)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.get('/wallet', async (_req, res, next) => {
  const client = await pool.connect()
  try {
    const wallet = await shop.getPlayerWallet(client, PLAYER_ID)
    res.json(wallet)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.post('/buy/ship/:itemId', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await shop.buyShip(client, PLAYER_ID, Number(req.params.itemId))
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

router.post('/buy/equipment/:itemId', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const quantity = Number(req.body?.quantity ?? 1)
    const result = await shop.buyEquipment(client, PLAYER_ID, Number(req.params.itemId), quantity)
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
