const { orderPair, clampScore, relationshipTier } = require('../domain/relationship')

function pairKey(a, b) {
  return `${a}:${b}`
}

// Both reads and writes normalize pair order via orderPair internally, so
// no caller has to remember which recruit is "a" and which is "b" -- e.g.
// getRelationship(client, p, 7, 3) still finds a row stored as (3, 7).
async function getRelationship(client, playerId, idA, idB) {
  const [a, b] = orderPair(idA, idB)
  const result = await client.query(
    'SELECT score FROM recruit_relationships WHERE player_id = $1 AND recruit_a_id = $2 AND recruit_b_id = $3',
    [playerId, a, b],
  )
  const score = result.rows[0]?.score ?? 0
  return { score, tier: relationshipTier(score) }
}

// Bulk fetch for a small crew, keyed by normalized "a:b" pair -- avoids N+1
// queries when checking reroll eligibility or picking relationship-flavored
// banter (mirrors equipment.service.js's getEquippedByRecruitIds).
async function getCrewRelationships(client, playerId, recruitIds) {
  const map = new Map()
  if (!recruitIds || recruitIds.length < 2) return map

  const ids = recruitIds.map(Number)
  const result = await client.query(
    `SELECT recruit_a_id, recruit_b_id, score FROM recruit_relationships
     WHERE player_id = $1 AND recruit_a_id = ANY($2::int[]) AND recruit_b_id = ANY($2::int[])`,
    [playerId, ids],
  )
  for (const row of result.rows) {
    map.set(pairKey(row.recruit_a_id, row.recruit_b_id), {
      score: row.score,
      tier: relationshipTier(row.score),
    })
  }
  return map
}

// Looks up idA/idB's relationship in a map built by getCrewRelationships,
// normalizing pair order the same way the DB-backed lookups do.
function lookupCrewRelationship(relationships, idA, idB) {
  const [a, b] = orderPair(idA, idB)
  return relationships.get(pairKey(a, b)) ?? { score: 0, tier: relationshipTier(0) }
}

// Every relationship row for a player, for embedding into the synced game
// state (see buildGameState in game.service.js). Ids are stringified to
// match Recruit.id: string on the frontend.
async function getRelationships(client, playerId) {
  const result = await client.query(
    'SELECT recruit_a_id, recruit_b_id, score FROM recruit_relationships WHERE player_id = $1',
    [playerId],
  )
  return result.rows.map((row) => ({
    recruitAId: String(row.recruit_a_id),
    recruitBId: String(row.recruit_b_id),
    score: row.score,
    tier: relationshipTier(row.score),
  }))
}

// Read-then-upsert, clamped to [MIN_SCORE, MAX_SCORE]. Returns before/after
// score and tier so callers can detect a tier change (e.g. to log "growing
// closer"/"more distant" -- see buildRelationshipShiftLog in
// log.service.js) without a second round trip.
async function adjustRelationship(client, playerId, idA, idB, delta) {
  const [a, b] = orderPair(idA, idB)
  const existing = await client.query(
    'SELECT score FROM recruit_relationships WHERE player_id = $1 AND recruit_a_id = $2 AND recruit_b_id = $3',
    [playerId, a, b],
  )
  const previousScore = existing.rows[0]?.score ?? 0
  const newScore = clampScore(previousScore + delta)

  await client.query(
    `INSERT INTO recruit_relationships (player_id, recruit_a_id, recruit_b_id, score, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (player_id, recruit_a_id, recruit_b_id) DO UPDATE SET score = $4, updated_at = NOW()`,
    [playerId, a, b, newScore],
  )

  return {
    recruitAId: String(a),
    recruitBId: String(b),
    previousScore,
    newScore,
    previousTier: relationshipTier(previousScore),
    newTier: relationshipTier(newScore),
  }
}

module.exports = {
  getRelationship,
  getCrewRelationships,
  lookupCrewRelationship,
  getRelationships,
  adjustRelationship,
}
