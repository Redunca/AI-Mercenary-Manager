const express = require('express')
const game = require('../services/game.service')
const { asyncRoute } = require('../utils/asyncRoute')

const router = express.Router()

router.get(
  '/state',
  asyncRoute(async (_req, res) => {
    const state = await game.getGameState()
    res.json(state)
  }),
)

router.post(
  '/sync',
  asyncRoute(async (_req, res) => {
    const state = await game.syncGame()
    res.json(state)
  }),
)

router.patch(
  '/recruits/:id',
  asyncRoute(async (req, res) => {
    const result = await game.renameRecruit(req.params.id, req.body.name)
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  }),
)

router.post(
  '/candidates/:id/hire',
  asyncRoute(async (req, res) => {
    const result = await game.hireCandidate(req.params.id)
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  }),
)

router.post(
  '/recruits/:id/fire',
  asyncRoute(async (req, res) => {
    const result = await game.fireRecruit(req.params.id)
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  }),
)

// Full mission history (every template ever started, regardless of the
// batch it belonged to) — kept as its own endpoint rather than folded into
// /state or /sync since it's fetched on demand by `mission list --completed`
// and can grow unbounded, unlike the constant-size live sync payload.
router.get(
  '/missions/history',
  asyncRoute(async (_req, res) => {
    const missions = await game.getMissionHistory()
    res.json({ missions })
  }),
)

router.post(
  '/missions/:templateId/start',
  asyncRoute(async (req, res) => {
    const shipId = Number(req.body.shipId)
    const result = req.body.speedConsumableId
      ? await game.startMission(
          Number(req.params.templateId),
          shipId,
          Number(req.body.speedConsumableId),
        )
      : await game.startMission(Number(req.params.templateId), shipId)
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  }),
)

router.post(
  '/missions/:templateId/stop',
  asyncRoute(async (req, res) => {
    const result = await game.stopMission(Number(req.params.templateId))
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  }),
)

router.get(
  '/missions/:templateId/logs',
  asyncRoute(async (req, res) => {
    const logs = await game.getMissionLogs(Number(req.params.templateId))
    res.json({ logs })
  }),
)

router.post(
  '/missions/:templateId/force-return',
  asyncRoute(async (req, res) => {
    const result = await game.forceReturnMission(Number(req.params.templateId))
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  }),
)

// --- Dev/testing endpoints ---
// Force-refresh missions/shop/candidates, set credits/tokens directly, or
// wipe and restart the game — for easy manual testing, not player-facing.

router.post(
  '/dev/refresh',
  asyncRoute(async (_req, res) => {
    const result = await game.devRefresh()
    res.json(result)
  }),
)

router.post(
  '/dev/credits',
  asyncRoute(async (req, res) => {
    const amount = Number(req.body?.amount)
    if (!Number.isFinite(amount)) {
      res.status(400).json({ error: 'Invalid amount' })
      return
    }
    const result = await game.devSetCredits(amount)
    res.json(result)
  }),
)

router.post(
  '/dev/tokens',
  asyncRoute(async (req, res) => {
    const amount = Number(req.body?.amount)
    if (!Number.isFinite(amount)) {
      res.status(400).json({ error: 'Invalid amount' })
      return
    }
    const result = await game.devSetTokens(amount)
    res.json(result)
  }),
)

router.post(
  '/dev/reboot',
  asyncRoute(async (_req, res) => {
    const result = await game.devReboot()
    res.json(result)
  }),
)

module.exports = router
