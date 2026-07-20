const express = require('express')
const GraphService = require('../services/graph.service')
const { analyzeGraph, runGeneration } = require('../domain/graph')

const router = express.Router()

function sendError(res, err) {
  const status = err.statusCode ?? (/must be|missing|unknown|duplicate|requires/.test(err.message) ? 400 : 500)
  res.status(status).json({ error: err.message })
}

router.get('/', async (_req, res, next) => {
  try {
    res.json(await GraphService.listGraphs())
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const def = await GraphService.readGraph(req.params.id)
    if (!def) {
      res.status(404).json({ error: 'Graph not found' })
      return
    }
    res.json(def)
  } catch (err) {
    if (err.statusCode) return sendError(res, err)
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { id, title, description } = req.body ?? {}
    if (typeof id !== 'string' || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ error: 'id and title are required strings' })
      return
    }
    const def = await GraphService.createGraph({ id, title, description })
    res.status(201).json(def)
  } catch (err) {
    if (err.statusCode) return sendError(res, err)
    next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const def = await GraphService.saveGraph(req.params.id, req.body ?? {})
    res.json(def)
  } catch (err) {
    if (err.statusCode || /must be|missing|unknown|duplicate|requires/.test(err.message)) {
      return sendError(res, err)
    }
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await GraphService.deleteGraph(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'Graph not found' })
      return
    }
    res.status(204).end()
  } catch (err) {
    if (err.statusCode) return sendError(res, err)
    next(err)
  }
})

router.get('/:id/analyze', async (req, res, next) => {
  try {
    const def = await GraphService.readGraph(req.params.id)
    if (!def) {
      res.status(404).json({ error: 'Graph not found' })
      return
    }
    res.json({ warnings: analyzeGraph(def) })
  } catch (err) {
    if (err.statusCode) return sendError(res, err)
    next(err)
  }
})

router.post('/:id/generate', async (req, res, next) => {
  try {
    const def = await GraphService.readGraph(req.params.id)
    if (!def) {
      res.status(404).json({ error: 'Graph not found' })
      return
    }
    const { initialState, seed } = req.body ?? {}
    res.json(runGeneration(def, { initialState, seed }))
  } catch (err) {
    if (err.statusCode) return sendError(res, err)
    next(err)
  }
})

module.exports = router
