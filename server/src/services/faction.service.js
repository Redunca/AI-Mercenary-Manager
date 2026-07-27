const { clampScore, reputationTier } = require('../domain/faction')
const { loadData } = require('../dataLoader')

async function getReputation(client, playerId, factionName) {
  const result = await client.query(
    'SELECT score FROM faction_reputation WHERE player_id = $1 AND faction_name = $2',
    [playerId, factionName],
  )
  const score = result.rows[0]?.score ?? 0
  return { score, tier: reputationTier(score) }
}

// Every reputation-holding org (entity-names.json's "faction" + "corporation"
// categories), left-joined with the player's stored scores -- so the
// Factions panel always shows the full roster, including orgs the player
// hasn't crossed paths with yet, rather than only rows that happen to exist
// in the DB.
async function getReputations(client, playerId) {
  const { entityNames } = loadData()
  const orgNames = [
    ...entityNames.categories.faction.map((entry) => entry.value),
    ...entityNames.categories.corporation.map((entry) => entry.value),
  ]

  const result = await client.query(
    'SELECT faction_name, score FROM faction_reputation WHERE player_id = $1',
    [playerId],
  )
  const scoreByName = new Map(result.rows.map((row) => [row.faction_name, row.score]))

  return orgNames.map((name) => {
    const score = scoreByName.get(name) ?? 0
    return { name, score, tier: reputationTier(score) }
  })
}

// Read-then-upsert, clamped to [MIN_SCORE, MAX_SCORE]. Returns before/after
// score and tier so callers can detect a tier change (see
// buildFactionShiftLog in log.service.js) without a second round trip.
async function adjustReputation(client, playerId, factionName, delta) {
  const existing = await client.query(
    'SELECT score FROM faction_reputation WHERE player_id = $1 AND faction_name = $2',
    [playerId, factionName],
  )
  const previousScore = existing.rows[0]?.score ?? 0
  const newScore = clampScore(previousScore + delta)

  await client.query(
    `INSERT INTO faction_reputation (player_id, faction_name, score, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (player_id, faction_name) DO UPDATE SET score = $3, updated_at = NOW()`,
    [playerId, factionName, newScore],
  )

  return {
    factionName,
    previousScore,
    newScore,
    previousTier: reputationTier(previousScore),
    newTier: reputationTier(newScore),
  }
}

module.exports = {
  getReputation,
  getReputations,
  adjustReputation,
}
