const express = require('express')
const { withClient } = require('../db/pool')
const shop = require('../services/shop.service')

const router = express.Router()
const PLAYER_ID = 1

router.get(
  '/items',
  withClient(async (client, _req, res) => {
    const items = await shop.getShopItems(client)
    res.json(items)
  }),
)

router.get(
  '/items/:id',
  withClient(async (client, req, res) => {
    const item = await shop.getShopItem(client, Number(req.params.id))
    if (!item) {
      res.status(404).json({ error: 'Item not found' })
      return
    }
    res.json(item)
  }),
)

router.post(
  '/buy/:itemId',
  withClient(async (client, req, res) => {
    await client.query('BEGIN')
    const item = await shop.getShopItem(client, Number(req.params.itemId))
    if (!item) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Item not found' })
      return
    }
    const quantity = Number(req.body?.quantity ?? 1)
    const result =
      item.type === 'ship'
        ? await shop.buyShip(client, PLAYER_ID, Number(req.params.itemId))
        : item.type === 'armor'
          ? await shop.buyArmor(client, PLAYER_ID, Number(req.params.itemId))
          : await shop.buyConsumable(client, PLAYER_ID, Number(req.params.itemId), quantity)
    if (result.error) {
      await client.query('ROLLBACK')
      res.status(400).json(result)
      return
    }
    await client.query('COMMIT')
    res.json(result)
  }),
)

router.post(
  '/buy/ship/:itemId',
  withClient(async (client, req, res) => {
    await client.query('BEGIN')
    const result = await shop.buyShip(client, PLAYER_ID, Number(req.params.itemId))
    if (result.error) {
      await client.query('ROLLBACK')
      res.status(400).json(result)
      return
    }
    await client.query('COMMIT')
    res.json(result)
  }),
)

router.post(
  '/buy/armor/:itemId',
  withClient(async (client, req, res) => {
    await client.query('BEGIN')
    const result = await shop.buyArmor(client, PLAYER_ID, Number(req.params.itemId))
    if (result.error) {
      await client.query('ROLLBACK')
      res.status(400).json(result)
      return
    }
    await client.query('COMMIT')
    res.json(result)
  }),
)

router.post(
  '/buy/consumable/:itemId',
  withClient(async (client, req, res) => {
    await client.query('BEGIN')
    const quantity = Number(req.body?.quantity ?? 1)
    const result = await shop.buyConsumable(client, PLAYER_ID, Number(req.params.itemId), quantity)
    if (result.error) {
      await client.query('ROLLBACK')
      res.status(400).json(result)
      return
    }
    await client.query('COMMIT')
    res.json(result)
  }),
)

module.exports = router
