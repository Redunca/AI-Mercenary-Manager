const express = require('express')
const { pool } = require('../db/pool')
const EquipmentService = require('../services/equipment.service')

const router = express.Router()
const PLAYER_ID = 1

router.get('/', async (_req, res, next) => {
  const client = await pool.connect()
  try {
    const [stash, equipped] = await Promise.all([
      EquipmentService.listStash(client, PLAYER_ID),
      EquipmentService.listEquipped(client, PLAYER_ID),
    ])
    res.json({ stash, equipped })
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.post('/:id/equip', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const recruitId = Number(req.body?.recruitId)
    if (!recruitId) {
      res.status(400).json({ error: 'recruitId is required' })
      return
    }
    await client.query('BEGIN')
    const result = await EquipmentService.equipArmor(client, PLAYER_ID, Number(req.params.id), recruitId)
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

router.post('/:id/unequip', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await EquipmentService.unequipArmor(client, PLAYER_ID, Number(req.params.id))
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
