// Hospital: the only way a recruit heals now that passive regen is gone
// (see game.service.js's former regenerateRecruits, replaced by
// regenerateHospitalizedRecruits below). A recruit must be manually
// admitted -- which also pulls them off whatever ship crew they're on,
// mirroring recruit.service.js's fireRecruit -- and occupies one of the
// player's hospital_slots (grown by the "Hospital Beds" self-upgrade) until
// they're back to full HP *and* any permanent injury (max_hp < original_max_hp,
// see combat.js's downing branch) is fully mended, or manually discharged
// early. Temp HP and permanent injury heal on independent clocks/rates (the
// latter grown by "Long-Term Ward Care" -- see upgrades.json) so a recruit
// can be at full current HP yet still occupy a bed while their injury heals.

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
  if (recruit.hp >= recruit.max_hp && recruit.max_hp >= recruit.original_max_hp) {
    return { error: 'Recruit is already at full HP' }
  }

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
    `UPDATE recruits SET status = 'hospitalized', last_hospital_heal_at = NOW(), last_permanent_heal_at = NOW()
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
// last_hospital_heal_at, and independently +1 max_hp (mending a permanent
// injury -- see combat.js's downing branch) per players.permanent_heal_interval_ms
// elapsed since last_permanent_heal_at, each advanced by whole ticks so a
// leftover fractional tick isn't lost to poll-cadence rounding. The two
// clocks don't feed each other within the same call -- if a permanent tick
// opens new HP headroom, the HP stream catches up on the next sync, same as
// every other "independent clocks reconciled lazily" mechanic here. A
// recruit who reaches full HP *and* full max_hp is auto-discharged so their
// slot frees up without a manual step; one without the other stays admitted.
async function regenerateHospitalizedRecruits(client, playerId, now = new Date()) {
  const player = (
    await client.query(
      'SELECT hospital_heal_interval_ms, permanent_heal_interval_ms FROM players WHERE id = $1',
      [playerId],
    )
  ).rows[0]
  const hpIntervalMs = player.hospital_heal_interval_ms
  const permanentIntervalMs = player.permanent_heal_interval_ms

  const recruits = (
    await client.query(
      `SELECT * FROM recruits
       WHERE player_id = $1 AND status = 'hospitalized' AND (hp < max_hp OR max_hp < original_max_hp)`,
      [playerId],
    )
  ).rows

  for (const row of recruits) {
    let newHp = row.hp
    let newLastHealAt = row.last_hospital_heal_at
    if (row.hp < row.max_hp) {
      const lastHealAt = new Date(row.last_hospital_heal_at)
      const ticks = Math.floor((now - lastHealAt) / hpIntervalMs)
      if (ticks > 0) {
        newHp = Math.min(row.max_hp, row.hp + ticks)
        newLastHealAt = new Date(lastHealAt.getTime() + ticks * hpIntervalMs)
      }
    }

    let newMaxHp = row.max_hp
    let newLastPermanentHealAt = row.last_permanent_heal_at
    if (row.max_hp < row.original_max_hp) {
      const lastPermanentHealAt = new Date(row.last_permanent_heal_at)
      const permTicks = Math.floor((now - lastPermanentHealAt) / permanentIntervalMs)
      if (permTicks > 0) {
        newMaxHp = Math.min(row.original_max_hp, row.max_hp + permTicks)
        newLastPermanentHealAt = new Date(lastPermanentHealAt.getTime() + permTicks * permanentIntervalMs)
      }
    }

    if (newHp === row.hp && newMaxHp === row.max_hp) continue

    const fullyHealed = newHp >= newMaxHp && newMaxHp >= row.original_max_hp

    await client.query(
      `UPDATE recruits SET hp = $1, max_hp = $2, last_hospital_heal_at = $3, last_permanent_heal_at = $4, status = $5
       WHERE player_id = $6 AND id = $7`,
      [
        newHp,
        newMaxHp,
        newLastHealAt,
        newLastPermanentHealAt,
        fullyHealed ? 'available' : 'hospitalized',
        playerId,
        row.id,
      ],
    )
  }
}

module.exports = {
  admitRecruit,
  dischargeRecruit,
  regenerateHospitalizedRecruits,
}
