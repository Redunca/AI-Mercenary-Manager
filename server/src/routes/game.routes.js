const express = require('express')
const game = require('../services/game.service')

const router = express.Router()

router.get('/state', async (_req, res, next) => {
  try {
    const state = await game.getGameState()
    res.json(state)
  } catch (err) {
    next(err)
  }
})

router.post('/sync', async (_req, res, next) => {
  try {
    const state = await game.syncGame()
    res.json(state)
  } catch (err) {
    next(err)
  }
})

router.patch('/recruits/:id', async (req, res, next) => {
  try {
    const result = await game.renameRecruit(req.params.id, req.body.name)
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.post('/candidates/:id/hire', async (req, res, next) => {
  try {
    const result = await game.hireCandidate(req.params.id)
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.post('/recruits/:id/fire', async (req, res, next) => {
  try {
    const result = await game.fireRecruit(req.params.id)
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// Full mission history (every template ever started, regardless of the
// batch it belonged to) — kept as its own endpoint rather than folded into
// /state or /sync since it's fetched on demand by `mission list --completed`
// and can grow unbounded, unlike the constant-size live sync payload.
router.get('/missions/history', async (_req, res, next) => {
  try {
    const missions = await game.getMissionHistory()
    res.json({ missions })
  } catch (err) {
    next(err)
  }
})

router.post('/missions/:templateId/start', async (req, res, next) => {
  try {
    const shipId = Number(req.body.shipId)
    const result = req.body.speedConsumableId
      ? await game.startMission(Number(req.params.templateId), shipId, Number(req.body.speedConsumableId))
      : await game.startMission(Number(req.params.templateId), shipId)
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.post('/missions/:templateId/stop', async (req, res, next) => {
  try {
    const result = await game.stopMission(Number(req.params.templateId))
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.get('/missions/:templateId/logs', async (req, res, next) => {
  try {
    const logs = await game.getMissionLogs(Number(req.params.templateId))
    res.json({ logs })
  } catch (err) {
    next(err)
  }
})

router.post('/missions/:templateId/force-return', async (req, res, next) => {
  try {
    const result = await game.forceReturnMission(Number(req.params.templateId))
    if (result.error) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// --- Dev/testing endpoints ---
// Force-refresh missions/shop/candidates, set credits/tokens directly, or
// wipe and restart the game — for easy manual testing, not player-facing.

router.post('/dev/refresh', async (_req, res, next) => {
  try {
    const result = await game.devRefresh()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.post('/dev/credits', async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount)
    if (!Number.isFinite(amount)) {
      res.status(400).json({ error: 'Invalid amount' })
      return
    }
    const result = await game.devSetCredits(amount)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.post('/dev/tokens', async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount)
    if (!Number.isFinite(amount)) {
      res.status(400).json({ error: 'Invalid amount' })
      return
    }
    const result = await game.devSetTokens(amount)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.post('/dev/reboot', async (_req, res, next) => {
  try {
    const result = await game.devReboot()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

module.exports = router
