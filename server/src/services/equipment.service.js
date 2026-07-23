const OperaService = require('./opera.service')

// Owned armor lives entirely in the `equipment` table: rows with
// assigned_to_recruit_id IS NULL are "in the stash", rows with it set are
// equipped to that recruit's 'armor' slot. Unlike consumables, equipment is
// never spent by use -- only destroyEquipmentForRecruit (called on death,
// see game.service.js) or the player deletes it.

async function listStash(client, playerId) {
  const result = await client.query(
    'SELECT * FROM equipment WHERE player_id = $1 AND assigned_to_recruit_id IS NULL ORDER BY created_at',
    [playerId],
  )
  return result.rows
}

async function listEquipped(client, playerId) {
  const result = await client.query(
    'SELECT * FROM equipment WHERE player_id = $1 AND assigned_to_recruit_id IS NOT NULL ORDER BY created_at',
    [playerId],
  )
  return result.rows
}

async function getEquipment(client, playerId, equipmentId) {
  const result = await client.query('SELECT * FROM equipment WHERE player_id = $1 AND id = $2', [
    playerId,
    equipmentId,
  ])
  return result.rows[0] || null
}

// Combat's read path: one row per recruit that has armor equipped, keyed
// for O(1) lookup while building runAutoBattle's crew array.
async function getEquippedByRecruitIds(client, playerId, recruitIds) {
  const map = new Map()
  if (!recruitIds || recruitIds.length === 0) return map

  const result = await client.query(
    'SELECT * FROM equipment WHERE player_id = $1 AND assigned_to_recruit_id = ANY($2::int[])',
    [playerId, recruitIds.map(Number)],
  )
  for (const row of result.rows) {
    map.set(String(row.assigned_to_recruit_id), {
      guardBonus: row.guard_bonus,
      requiredFortitude: row.required_fortitude,
    })
  }
  return map
}

// Equips `equipmentId` onto `recruitId`'s armor slot. Whatever was already
// equipped there (if anything) is swapped back to the stash -- death is the
// only thing that destroys armor, not unequipping it.
async function equipArmor(client, playerId, equipmentId, recruitId) {
  const target = await getEquipment(client, playerId, equipmentId)
  if (!target || target.slot !== 'armor') return { error: 'Armor not found' }

  const recruit = await client.query(
    'SELECT status FROM recruits WHERE player_id = $1 AND id = $2',
    [playerId, recruitId],
  )
  if (recruit.rows.length === 0) return { error: 'Recruit not found' }
  if (recruit.rows[0].status === 'dead') return { error: 'Recruit is dead' }

  await client.query(
    `UPDATE equipment SET assigned_to_recruit_id = NULL
     WHERE player_id = $1 AND slot = $2 AND assigned_to_recruit_id = $3`,
    [playerId, target.slot, recruitId],
  )

  const updated = await client.query(
    'UPDATE equipment SET assigned_to_recruit_id = $1 WHERE player_id = $2 AND id = $3 RETURNING *',
    [recruitId, playerId, equipmentId],
  )

  await OperaService.recordOperaAction(client, playerId, 'equip_item', {
    recruitId,
    itemName: target.name,
  })

  return { success: true, equipment: updated.rows[0] }
}

async function unequipArmor(client, playerId, equipmentId) {
  const target = await getEquipment(client, playerId, equipmentId)
  if (!target) return { error: 'Armor not found' }

  const updated = await client.query(
    'UPDATE equipment SET assigned_to_recruit_id = NULL WHERE player_id = $1 AND id = $2 RETURNING *',
    [playerId, equipmentId],
  )
  return { success: true, equipment: updated.rows[0] }
}

// Called when a recruit dies (see damageRecruit / applyCombatResult in
// game.service.js): equipped gear is destroyed, not returned to the stash.
async function destroyEquipmentForRecruit(client, playerId, recruitId) {
  await client.query('DELETE FROM equipment WHERE player_id = $1 AND assigned_to_recruit_id = $2', [
    playerId,
    recruitId,
  ])
}

async function buyArmor(client, playerId, shopItem, price) {
  const stats = shopItem.stats || {}
  const inserted = await client.query(
    `INSERT INTO equipment (player_id, slot, name, description, rarity, armor_type, guard_bonus, required_fortitude, speed_penalty, price)
     VALUES ($1, 'armor', $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      playerId,
      shopItem.name,
      shopItem.description,
      shopItem.rarity,
      stats.armorType,
      stats.guardBonus || 0,
      stats.requiredFortitude || 0,
      stats.speedPenalty || 0,
      price,
    ],
  )
  return inserted.rows[0]
}

module.exports = {
  listStash,
  listEquipped,
  getEquipment,
  getEquippedByRecruitIds,
  equipArmor,
  unequipArmor,
  destroyEquipmentForRecruit,
  buyArmor,
}
