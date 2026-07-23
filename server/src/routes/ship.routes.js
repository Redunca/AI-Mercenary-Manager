const express = require('express')
const { withClient } = require('../db/pool')
const ShipService = require('../services/ship.service')
const ConsumableService = require('../services/consumable.service')

const router = express.Router()
const PLAYER_ID = 1

router.get(
  '/',
  withClient(async (client, _req, res) => {
    const ships = await ShipService.getShips(client, PLAYER_ID)
    res.json(ships)
  }),
)

router.get(
  '/:id',
  withClient(async (client, req, res) => {
    const ship = await ShipService.getShip(client, PLAYER_ID, Number(req.params.id))
    if (!ship) return res.status(404).json({ error: 'Ship not found' })
    res.json(ship)
  }),
)

router.post(
  '/:id/crew',
  withClient(async (client, req, res) => {
    const { recruitIds } = req.body
    if (!Array.isArray(recruitIds) || recruitIds.length === 0) {
      return res.status(400).json({ error: 'recruitIds required' })
    }
    let ship
    for (const recruitId of recruitIds) {
      const updated = await ShipService.appendCrewMember(
        client,
        PLAYER_ID,
        Number(req.params.id),
        Number(recruitId),
      )
      if (updated) ship = updated
    }
    if (!ship) {
      // No update: all recruits were already part of the crew.
      // Check that the ship really exists before responding.
      ship = await ShipService.getShip(client, PLAYER_ID, Number(req.params.id))
      if (!ship) return res.status(404).json({ error: 'Ship not found' })
    }
    res.json(ship)
  }),
)

router.delete(
  '/:id/crew/:recruitId',
  withClient(async (client, req, res) => {
    const ship = await ShipService.removeCrewMember(
      client,
      PLAYER_ID,
      Number(req.params.id),
      Number(req.params.recruitId),
    )
    if (!ship) return res.status(404).json({ error: 'Ship not found' })
    res.json(ship)
  }),
)

router.patch(
  '/:id',
  withClient(async (client, req, res) => {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })
    const ship = await ShipService.renameShip(client, PLAYER_ID, Number(req.params.id), name)
    if (!ship) return res.status(404).json({ error: 'Ship not found' })
    res.json(ship)
  }),
)

router.get(
  '/:id/inventory',
  withClient(async (client, req, res) => {
    const inventory = await ConsumableService.getShipInventory(client, Number(req.params.id))
    res.json(inventory)
  }),
)

router.post(
  '/:id/inventory',
  withClient(async (client, req, res) => {
    const { consumableId, quantity } = req.body
    if (!consumableId) return res.status(400).json({ error: 'consumableId required' })
    const result = await ConsumableService.assignToShip(
      client,
      PLAYER_ID,
      Number(consumableId),
      Number(req.params.id),
      Number(quantity ?? 1),
    )
    if (!result)
      return res.status(400).json({ error: 'Consumable not found or insufficient quantity' })
    res.json(result)
  }),
)

router.delete(
  '/:id/inventory/:consumableId',
  withClient(async (client, req, res) => {
    const quantity = Number(req.body?.quantity ?? 1)
    const result = await ConsumableService.unassignFromShip(
      client,
      PLAYER_ID,
      Number(req.params.consumableId),
      quantity,
    )
    if (!result)
      return res.status(400).json({ error: 'Consumable not found or insufficient quantity' })
    res.json(result)
  }),
)

module.exports = router
