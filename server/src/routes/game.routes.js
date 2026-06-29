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

router.post('/candidates/refresh', async (req, res, next) => {
  try {
    const count = Number(req.body?.count ?? 5)
    const result = await game.refreshCandidates(count)
    res.json(result)
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

router.post('/missions/:templateId/start', async (req, res, next) => {
  try {
    const recruitId = Number(req.body.recruitId)
    const result = await game.startMission(Number(req.params.templateId), recruitId)
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

module.exports = router
