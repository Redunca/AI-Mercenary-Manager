// Hospital: the only way a recruit heals now that passive regen is gone
// (see game.service.js's former regenerateRecruits, replaced by
// regenerateHospitalizedRecruits below). A recruit must be manually
// admitted -- which also pulls them off whatever ship crew they're on,
// mirroring recruit.service.js's fireRecruit -- and occupies one of the
// player's hospital_slots (grown by the "Hospital Beds" self-upgrade) until
// they're back to full HP or manually discharged early.

const OperaService = require('./opera.service')

async function admitRecruit(client, playerId, recruitId) {
  const recruit = (
    await client.query('SELECT * FROM recruits WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL', [
      playerId,
      recruitId,
    ])
  ).rows[0]
  if (!recruit) return { error: 'Recruit not found' }
  if (recruit.status === 'dead') return { error: 'Recruit is dead' }
  if (recruit.status === 'hospitalized') return { error: 'Recruit is already hospitalized' }
  if (recruit.hp >= recruit.max_hp) return { error: 'Recruit is already at full HP' }

  const player = (
    await client.query('SELECT hospital_slots FROM players WHERE id = $1', [playerId])
  ).rows[0]
  const occupied = (
    await client.query(
      "SELECT COUNT(*)::int AS count FROM recruits WHERE player_id = $1 AND status = 'hospitalized'",
      [playerId],
    )
  ).rows[0].count
  if (occupied >= player.hospital_slots) return { error: 'Hospital is full' }

  await client.query(
    `UPDATE ships SET crew = array_remove(crew, $2)
     WHERE player_id = $1 AND deleted_at IS NULL AND $2 = ANY(crew)`,
    [playerId, recruitId],
  )

  const result = await client.query(
    `UPDATE recruits SET status = 'hospitalized', last_hospital_heal_at = NOW()
     WHERE player_id = $1 AND id = $2
     RETURNING *`,
    [playerId, recruitId],
  )

  await OperaService.recordOperaAction(client, playerId, 'assign_recruit_to_hospital', {
    recruitId,
  })

  return { success: true, recruit: result.rows[0] }
}

async function dischargeRecruit(client, playerId, recruitId) {
  const result = await client.query(
    `UPDATE recruits SET status = 'available'
     WHERE player_id = $1 AND id = $2 AND status = 'hospitalized'
     RETURNING *`,
    [playerId, recruitId],
  )
  if (!result.rows[0]) return { error: 'Recruit is not hospitalized' }
  return { success: true, recruit: result.rows[0] }
}

// Computed lazily at sync time, same as every other refresh/regen in this
// codebase: +1 HP per players.hospital_heal_interval_ms elapsed since
// last_hospital_heal_at, advanced by whole ticks so a leftover fractional
// tick isn't lost to poll-cadence rounding. A recruit who reaches full HP is
// auto-discharged so their slot frees up without a manual step.
async function regenerateHospitalizedRecruits(client, playerId, now = new Date()) {
  const player = (
    await client.query('SELECT hospital_heal_interval_ms FROM players WHERE id = $1', [playerId])
  ).rows[0]
  const intervalMs = player.hospital_heal_interval_ms

  const recruits = (
    await client.query(
      `SELECT * FROM recruits
       WHERE player_id = $1 AND status = 'hospitalized' AND hp < max_hp`,
      [playerId],
    )
  ).rows

  for (const row of recruits) {
    const lastHealAt = new Date(row.last_hospital_heal_at)
    const ticks = Math.floor((now - lastHealAt) / intervalMs)
    if (ticks <= 0) continue

    const newHp = Math.min(row.max_hp, row.hp + ticks)
    const newLastHealAt = new Date(lastHealAt.getTime() + ticks * intervalMs)
    const fullyHealed = newHp >= row.max_hp

    await client.query(
      `UPDATE recruits SET hp = $1, last_hospital_heal_at = $2, status = $3
       WHERE player_id = $4 AND id = $5`,
      [newHp, newLastHealAt, fullyHealed ? 'available' : 'hospitalized', playerId, row.id],
    )
  }
}

module.exports = {
  admitRecruit,
  dischargeRecruit,
  regenerateHospitalizedRecruits,
}
