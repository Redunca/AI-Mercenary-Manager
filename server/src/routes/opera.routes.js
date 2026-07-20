const express = require('express')
const { pool } = require('../db/pool')
const OperaService = require('../services/opera.service')

const router = express.Router()
const PLAYER_ID = 1

router.get('/', async (_req, res, next) => {
  const client = await pool.connect()
  try {
    const operas = await OperaService.getOperaState(client, PLAYER_ID)
    res.json(operas)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.get('/:id', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const operas = await OperaService.getOperaState(client, PLAYER_ID)
    const opera = operas.find(o => o.id === req.params.id)
    if (!opera) {
      res.status(404).json({ error: 'Opera not found' })
      return
    }
    const logs = await OperaService.getOperaLogs(client, PLAYER_ID)
    res.json({ ...opera, logs: logs[opera.id] ?? [] })
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.post('/:id/start', async (req, res, next) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await OperaService.startOpera(client, PLAYER_ID, req.params.id)
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

// Passive/telemetry-style hook: every command the player types is reported
// here (see command.service.ts's routeCommand()) so execute_command opera
// steps can be detected even for commands with no other backend correlate
// (help, split-h, split-v, ...). Always 200 -- this never represents a
// player-facing action succeeding or failing.
router.post('/command', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const { command, args } = req.body ?? {}
    if (typeof command === 'string') {
      await OperaService.recordOperaAction(client, PLAYER_ID, 'execute_command', {
        command, args: Array.isArray(args) ? args : [],
      })
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

module.exports = router
