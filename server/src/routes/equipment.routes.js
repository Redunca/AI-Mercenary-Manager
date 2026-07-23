const express = require('express')
const { withClient } = require('../db/pool')
const EquipmentService = require('../services/equipment.service')

const router = express.Router()
const PLAYER_ID = 1

router.get(
  '/',
  withClient(async (client, _req, res) => {
    const [stash, equipped] = await Promise.all([
      EquipmentService.listStash(client, PLAYER_ID),
      EquipmentService.listEquipped(client, PLAYER_ID),
    ])
    res.json({ stash, equipped })
  }),
)

router.post(
  '/:id/equip',
  withClient(async (client, req, res) => {
    const recruitId = Number(req.body?.recruitId)
    if (!recruitId) {
      res.status(400).json({ error: 'recruitId is required' })
      return
    }
    await client.query('BEGIN')
    const result = await EquipmentService.equipArmor(
      client,
      PLAYER_ID,
      Number(req.params.id),
      recruitId,
    )
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
  '/:id/unequip',
  withClient(async (client, req, res) => {
    await client.query('BEGIN')
    const result = await EquipmentService.unequipArmor(client, PLAYER_ID, Number(req.params.id))
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
