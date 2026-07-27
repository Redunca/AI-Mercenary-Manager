// Talks to the DB via a small fake in-memory client keyed by SQL text,
// mirroring self.service.test.js's style: robust to exact query ordering
// rather than pinning brittle mockResolvedValueOnce chains.
const RelationshipService = require('../src/services/relationship.service')

function createFakeClient({ rows = [] } = {}) {
  const state = { rows: rows.map((r) => ({ ...r })) }

  const query = jest.fn(async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim()

    if (
      s ===
      'SELECT score FROM recruit_relationships WHERE player_id = $1 AND recruit_a_id = $2 AND recruit_b_id = $3'
    ) {
      const [playerId, a, b] = params
      const row = state.rows.find(
        (r) => r.player_id === playerId && r.recruit_a_id === a && r.recruit_b_id === b,
      )
      return { rows: row ? [{ score: row.score }] : [] }
    }
    if (s.includes('FROM recruit_relationships') && s.includes('recruit_a_id = ANY($2::int[])')) {
      const [playerId, ids] = params
      const idSet = new Set(ids)
      return {
        rows: state.rows.filter(
          (r) => r.player_id === playerId && idSet.has(r.recruit_a_id) && idSet.has(r.recruit_b_id),
        ),
      }
    }
    if (
      s === 'SELECT recruit_a_id, recruit_b_id, score FROM recruit_relationships WHERE player_id = $1'
    ) {
      return { rows: state.rows.filter((r) => r.player_id === params[0]) }
    }
    if (s.includes('INSERT INTO recruit_relationships')) {
      const [playerId, a, b, score] = params
      const existing = state.rows.find(
        (r) => r.player_id === playerId && r.recruit_a_id === a && r.recruit_b_id === b,
      )
      if (existing) existing.score = score
      else state.rows.push({ player_id: playerId, recruit_a_id: a, recruit_b_id: b, score })
      return { rows: [] }
    }

    throw new Error(`Query not handled by the fake test client: ${s}`)
  })

  return { client: { query }, state }
}

describe('getRelationship', () => {
  test('defaults to a neutral 0 score when no row exists', async () => {
    const { client } = createFakeClient()
    expect(await RelationshipService.getRelationship(client, 1, 3, 7)).toEqual({
      score: 0,
      tier: 'NEUTRAL',
    })
  })

  test('normalizes pair order on read: a row stored as (3, 7) is found regardless of argument order', async () => {
    const { client } = createFakeClient({
      rows: [{ player_id: 1, recruit_a_id: 3, recruit_b_id: 7, score: 5 }],
    })
    expect(await RelationshipService.getRelationship(client, 1, 3, 7)).toEqual({
      score: 5,
      tier: 'NEUTRAL',
    })
    expect(await RelationshipService.getRelationship(client, 1, 7, 3)).toEqual({
      score: 5,
      tier: 'NEUTRAL',
    })
  })

  test('is scoped per player', async () => {
    const { client } = createFakeClient({
      rows: [{ player_id: 2, recruit_a_id: 3, recruit_b_id: 7, score: 42 }],
    })
    expect(await RelationshipService.getRelationship(client, 1, 3, 7)).toEqual({
      score: 0,
      tier: 'NEUTRAL',
    })
  })
})

describe('getCrewRelationships', () => {
  test('returns an empty map for fewer than 2 recruit ids, without querying', async () => {
    const { client } = createFakeClient()
    expect(await RelationshipService.getCrewRelationships(client, 1, ['3'])).toEqual(new Map())
    expect(client.query).not.toHaveBeenCalled()
  })

  test('bulk-fetches every relationship among the given ids, keyed by normalized pair', async () => {
    const { client } = createFakeClient({
      rows: [
        { player_id: 1, recruit_a_id: 3, recruit_b_id: 7, score: 5 },
        { player_id: 1, recruit_a_id: 7, recruit_b_id: 9, score: -70 },
        { player_id: 1, recruit_a_id: 3, recruit_b_id: 100, score: 99 }, // outside the requested set
      ],
    })
    const map = await RelationshipService.getCrewRelationships(client, 1, ['3', '7', '9'])
    expect(map.get('3:7')).toEqual({ score: 5, tier: 'NEUTRAL' })
    expect(map.get('7:9')).toEqual({ score: -70, tier: 'RIVAL' })
    expect(map.has('3:100')).toBe(false)
  })
})

describe('getRelationships', () => {
  test('returns every row for the player as stringified ids with a computed tier', async () => {
    const { client } = createFakeClient({
      rows: [
        { player_id: 1, recruit_a_id: 3, recruit_b_id: 7, score: 65 },
        { player_id: 2, recruit_a_id: 1, recruit_b_id: 2, score: 0 }, // other player, excluded
      ],
    })
    expect(await RelationshipService.getRelationships(client, 1)).toEqual([
      { recruitAId: '3', recruitBId: '7', score: 65, tier: 'BONDED' },
    ])
  })
})

describe('adjustRelationship', () => {
  test('creates a new row starting from 0 when none exists', async () => {
    const { client, state } = createFakeClient()
    const result = await RelationshipService.adjustRelationship(client, 1, 3, 7, 10)
    expect(result).toEqual({
      recruitAId: '3',
      recruitBId: '7',
      previousScore: 0,
      newScore: 10,
      previousTier: 'NEUTRAL',
      newTier: 'NEUTRAL',
    })
    expect(state.rows).toEqual([{ player_id: 1, recruit_a_id: 3, recruit_b_id: 7, score: 10 }])
  })

  test('normalizes pair order on write regardless of argument order', async () => {
    const { state, client } = createFakeClient()
    await RelationshipService.adjustRelationship(client, 1, 7, 3, 10)
    expect(state.rows).toEqual([{ player_id: 1, recruit_a_id: 3, recruit_b_id: 7, score: 10 }])
  })

  test('accumulates on top of an existing score', async () => {
    const { client } = createFakeClient({
      rows: [{ player_id: 1, recruit_a_id: 3, recruit_b_id: 7, score: 10 }],
    })
    const result = await RelationshipService.adjustRelationship(client, 1, 3, 7, 5)
    expect(result.previousScore).toBe(10)
    expect(result.newScore).toBe(15)
  })

  test('clamps at MAX_SCORE / MIN_SCORE', async () => {
    const { client } = createFakeClient({
      rows: [{ player_id: 1, recruit_a_id: 3, recruit_b_id: 7, score: 95 }],
    })
    const result = await RelationshipService.adjustRelationship(client, 1, 3, 7, 50)
    expect(result.newScore).toBe(100)
  })

  test('detects a tier change across the adjustment', async () => {
    const { client } = createFakeClient({
      rows: [{ player_id: 1, recruit_a_id: 3, recruit_b_id: 7, score: 18 }],
    })
    const result = await RelationshipService.adjustRelationship(client, 1, 3, 7, 5)
    expect(result.previousTier).toBe('NEUTRAL')
    expect(result.newTier).toBe('FRIENDLY')
  })
})
