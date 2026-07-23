const express = require('express')
const { withClient } = require('../db/pool')
const OperaService = require('../services/opera.service')

const router = express.Router()
const PLAYER_ID = 1

router.get(
  '/',
  withClient(async (client, _req, res) => {
    const operas = await OperaService.getOperaState(client, PLAYER_ID)
    res.json(operas)
  }),
)

router.get(
  '/:id',
  withClient(async (client, req, res) => {
    const operas = await OperaService.getOperaState(client, PLAYER_ID)
    const opera = operas.find((o) => o.id === req.params.id)
    if (!opera) {
      res.status(404).json({ error: 'Opera not found' })
      return
    }
    const logs = await OperaService.getOperaLogs(client, PLAYER_ID)
    res.json({ ...opera, logs: logs[opera.id] ?? [] })
  }),
)

// Nothing is manually "started" anymore -- the tutorial auto-starts by id
// and pooled operas auto-fill via OperaService.maintainOperaSlots -- but a
// pending choice does need an explicit player pick.
router.post(
  '/:id/choose',
  withClient(async (client, req, res) => {
    await client.query('BEGIN')
    const result = await OperaService.resolveChoice(
      client,
      PLAYER_ID,
      Number(req.params.id),
      req.body?.optionId,
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

// Passive/telemetry-style hook: every command the player types is reported
// here (see command.service.ts's routeCommand()) so execute_command opera
// steps can be detected even for commands with no other backend correlate
// (help, split-h, split-v, ...). Always 200 -- this never represents a
// player-facing action succeeding or failing.
//
// Returns the fresh opera state/logs (not just {ok:true}) because these
// execute_command-gated steps are the one class of opera-advancing action
// with no other REST call whose response the client already applies --
// split-v/split-h/self are purely local, UI-side commands. Without this,
// completing one of these steps only became visible after whatever next
// happened to trigger GameSyncService.sync() (which polls only while a
// mission is active or a recruit is regenerating -- neither by default),
// so a step could complete on the server yet sit unrevealed client-side
// until an unrelated action or a manual reload. See opera.service.ts's
// recordCommand(), which applies this response the same fire-and-forget way.
router.post(
  '/command',
  withClient(async (client, req, res) => {
    const { command, args } = req.body ?? {}
    if (typeof command === 'string') {
      await OperaService.recordOperaAction(client, PLAYER_ID, 'execute_command', {
        command,
        args: Array.isArray(args) ? args : [],
      })
    }
    const operas = await OperaService.getOperaState(client, PLAYER_ID)
    const operaLogs = await OperaService.getOperaLogs(client, PLAYER_ID)
    res.json({ ok: true, operas, operaLogs })
  }),
)

module.exports = router
