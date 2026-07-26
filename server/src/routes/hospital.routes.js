const express = require('express')
const { withClient } = require('../db/pool')
const HospitalService = require('../services/hospital.service')

const router = express.Router()
const PLAYER_ID = 1

router.post(
  '/:recruitId/admit',
  withClient(async (client, req, res) => {
    await client.query('BEGIN')
    const result = await HospitalService.admitRecruit(client, PLAYER_ID, Number(req.params.recruitId))
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
  '/:recruitId/discharge',
  withClient(async (client, req, res) => {
    await client.query('BEGIN')
    const result = await HospitalService.dischargeRecruit(
      client,
      PLAYER_ID,
      Number(req.params.recruitId),
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

module.exports = router
