const express = require('express')
const { pool } = require('../db/pool')
const ShipService = require('../services/ship.service')

const router = express.Router()
const PLAYER_ID = 1

router.get('/', async (_req, res, next) => {
  const client = await pool.connect()
  try {
    const ships = await ShipService.getShips(client, PLAYER_ID)
    res.json(ships)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.get('/:id', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const ship = await ShipService.getShip(client, PLAYER_ID, Number(req.params.id))
    if (!ship) return res.status(404).json({ error: 'Navire introuvable' })
    res.json(ship)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.post('/:id/crew', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const { recruitIds } = req.body
    if (!Array.isArray(recruitIds) || recruitIds.length === 0) {
      return res.status(400).json({ error: 'recruitIds requis' })
    }
    let ship
    for (const recruitId of recruitIds) {
      const updated = await ShipService.appendCrewMember(client, PLAYER_ID, Number(req.params.id), Number(recruitId))
      if (updated) ship = updated
    }
    if (!ship) {
      // Aucune mise à jour : toutes les recrues étaient déjà dans l'équipage.
      // On vérifie que le navire existe vraiment avant de répondre.
      ship = await ShipService.getShip(client, PLAYER_ID, Number(req.params.id))
      if (!ship) return res.status(404).json({ error: 'Navire introuvable' })
    }
    res.json(ship)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.delete('/:id/crew/:recruitId', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const ship = await ShipService.removeCrewMember(
      client, PLAYER_ID, Number(req.params.id), Number(req.params.recruitId)
    )
    if (!ship) return res.status(404).json({ error: 'Navire introuvable' })
    res.json(ship)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

router.patch('/:id', async (req, res, next) => {
  const client = await pool.connect()
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name requis' })
    const ship = await ShipService.renameShip(client, PLAYER_ID, Number(req.params.id), name)
    if (!ship) return res.status(404).json({ error: 'Navire introuvable' })
    res.json(ship)
  } catch (err) {
    next(err)
  } finally {
    client.release()
  }
})

module.exports = router
