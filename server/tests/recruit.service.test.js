const RecruitService = require('../src/services/recruit.service')

const PLAYER_ID = 1

function createFakeClient({ recruits = [], ships = [], shopItems = [], consumables = [], candidates = [], players = {} } = {}) {
  const state = {
    recruits: recruits.map(r => ({ ...r })),
    ships: ships.map(s => ({ ...s })),
    shopItems: shopItems.map(i => ({ ...i })),
    consumables: consumables.map(c => ({ ...c })),
    equipment: [],
    candidates: candidates.map(c => ({ ...c })),
    players: { ...players },
    nextConsumableId: 1,
    nextEquipmentId: 1,
  }

  const query = jest.fn(async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim()

    if (s.startsWith('UPDATE recruits SET deleted_at = NOW()')) {
      const [playerId, recruitId] = params
      const row = state.recruits.find(r => r.player_id === playerId && r.id === recruitId && !r.deleted_at)
      if (row) row.deleted_at = new Date().toISOString()
      return { rows: row ? [row] : [] }
    }
    if (s.startsWith('UPDATE ships SET crew = array_remove(crew, $2)')) {
      const [playerId, recruitId] = params
      for (const ship of state.ships) {
        if (ship.player_id === playerId) ship.crew = ship.crew.filter(id => id !== recruitId)
      }
      return { rows: [] }
    }
    if (s.startsWith('SELECT * FROM recruits WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL')) {
      const [playerId, recruitId] = params
      return { rows: state.recruits.filter(r => r.player_id === playerId && r.id === recruitId && !r.deleted_at) }
    }
    if (s.startsWith('UPDATE recruits SET perks = $1')) {
      const [perksJson, playerId, recruitId] = params
      const row = state.recruits.find(r => r.player_id === playerId && r.id === recruitId)
      row.perks = JSON.parse(perksJson)
      return { rows: [row] }
    }
    if (s.startsWith('UPDATE recruits SET flaws = $1')) {
      const [flawsJson, playerId, recruitId] = params
      const row = state.recruits.find(r => r.player_id === playerId && r.id === recruitId)
      row.flaws = JSON.parse(flawsJson)
      return { rows: [row] }
    }
    if (s.startsWith('UPDATE recruits SET attributes = $1, max_hp = $2, hp = $3')) {
      const [attrsJson, maxHp, hp, playerId, recruitId] = params
      const row = state.recruits.find(r => r.player_id === playerId && r.id === recruitId)
      row.attributes = JSON.parse(attrsJson); row.max_hp = maxHp; row.hp = hp
      return { rows: [row] }
    }
    if (s.startsWith('UPDATE recruits SET attributes = $1 WHERE')) {
      const [attrsJson, playerId, recruitId] = params
      const row = state.recruits.find(r => r.player_id === playerId && r.id === recruitId)
      row.attributes = JSON.parse(attrsJson)
      return { rows: [row] }
    }
    if (s.startsWith('SELECT * FROM shop_items WHERE name = $1')) {
      const [name] = params
      return { rows: state.shopItems.filter(i => i.name === name) }
    }
    if (s.startsWith('SELECT * FROM consumables WHERE player_id = $1 AND name = $2 AND assigned_to_ship IS NULL')) {
      const [playerId, name] = params
      return { rows: state.consumables.filter(c => c.player_id === playerId && c.name === name && !c.assigned_to_ship) }
    }
    if (s.startsWith('SELECT inventory_capacity FROM players WHERE id = $1')) {
      const [playerId] = params
      return { rows: [{ inventory_capacity: state.players[playerId]?.inventory_capacity ?? 10 }] }
    }
    if (s.startsWith('SELECT COUNT(*)::int AS count FROM consumables WHERE player_id = $1 AND assigned_to_ship IS NULL')) {
      const [playerId] = params
      return { rows: [{ count: state.consumables.filter(c => c.player_id === playerId && !c.assigned_to_ship).length }] }
    }
    if (s.startsWith('INSERT INTO consumables')) {
      const [playerId, name, description, rarity, price, effect, effectData, quantity] = params
      const row = { id: state.nextConsumableId++, player_id: playerId, name, description, rarity, price, effect, effect_data: JSON.parse(effectData), quantity, assigned_to_ship: null }
      state.consumables.push(row)
      return { rows: [row] }
    }
    if (s.startsWith('INSERT INTO equipment')) {
      const [playerId, name, description, rarity] = params
      const row = { id: state.nextEquipmentId++, player_id: playerId, slot: 'armor', name, description, rarity }
      state.equipment.push(row)
      return { rows: [row] }
    }
    if (s.startsWith('SELECT next_candidate_id FROM players WHERE id = $1')) {
      const [playerId] = params
      return { rows: [{ next_candidate_id: state.players[playerId]?.next_candidate_id ?? 1 }] }
    }
    if (s.startsWith('INSERT INTO candidates')) {
      const row = { id: params[0], player_id: params[1], name: params[2], seed_key: params[11] }
      state.candidates.push(row)
      return { rows: [row] }
    }
    if (s.startsWith('UPDATE players SET next_candidate_id = next_candidate_id + 1')) {
      const [playerId] = params
      state.players[playerId] = { ...state.players[playerId], next_candidate_id: (state.players[playerId]?.next_candidate_id ?? 1) + 1 }
      return { rows: [] }
    }

    return { rows: [] }
  })

  return { query, state }
}

describe('fireRecruit', () => {
  test('soft-deletes the recruit and drops them from any ship crew', async () => {
    const client = createFakeClient({
      recruits: [{ player_id: PLAYER_ID, id: 5, perks: [], flaws: [], deleted_at: null }],
      ships: [{ player_id: PLAYER_ID, id: 1, crew: [3, 5] }],
    })

    const result = await RecruitService.fireRecruit(client, PLAYER_ID, 5)

    expect(result).toBeTruthy()
    expect(client.state.recruits[0].deleted_at).toBeTruthy()
    expect(client.state.ships[0].crew).toEqual([3])
  })

  test('returns null for an already-fired or unknown recruit', async () => {
    const client = createFakeClient({ recruits: [] })
    const result = await RecruitService.fireRecruit(client, PLAYER_ID, 999)
    expect(result).toBeNull()
  })
})

describe('applyPerk / applyFlaw', () => {
  test('appends a new perk, but does not duplicate an existing one', async () => {
    const client = createFakeClient({
      recruits: [{ player_id: PLAYER_ID, id: 5, perks: [{ name: 'Lucky', description: '' }], flaws: [], deleted_at: null }],
    })

    await RecruitService.applyPerk(client, PLAYER_ID, 5, 'Lucky')
    expect(client.state.recruits[0].perks).toHaveLength(1)

    await RecruitService.applyPerk(client, PLAYER_ID, 5, 'Fearless')
    expect(client.state.recruits[0].perks.map(p => p.name)).toEqual(['Lucky', 'Fearless'])
  })
})

describe('adjustAttribute', () => {
  test('adjusts a non-HP attribute without touching max_hp', async () => {
    const client = createFakeClient({
      recruits: [{ player_id: PLAYER_ID, id: 5, attributes: { agility: 3, fortitude: 2, presence: 1, will: 1 }, max_hp: 20, hp: 20 }],
    })

    await RecruitService.adjustAttribute(client, PLAYER_ID, 5, 'agility', 2)
    expect(client.state.recruits[0].attributes.agility).toBe(5)
  })

  test('recomputes max_hp when fortitude/presence/will changes, capping current hp at the new max', async () => {
    const client = createFakeClient({
      recruits: [{ player_id: PLAYER_ID, id: 5, attributes: { fortitude: 0, presence: 0, will: 0 }, max_hp: 10, hp: 10 }],
    })

    await RecruitService.adjustAttribute(client, PLAYER_ID, 5, 'fortitude', 3)

    // computeMaxHp = 2*(fortitude+presence+will) + 10 = 2*3 + 10 = 16
    expect(client.state.recruits[0].max_hp).toBe(16)
    expect(client.state.recruits[0].hp).toBe(10) // unchanged, still below the new max
  })
})

describe('giveItem', () => {
  test('adds a consumable catalog item to the stash', async () => {
    const client = createFakeClient({
      shopItems: [{ name: 'Encrypted Data Chip', description: 'x', type: 'consumable', rarity: 'common', price: 50, effect: 'NONE', effect_data: '{}' }],
    })

    const result = await RecruitService.giveItem(client, PLAYER_ID, 'Encrypted Data Chip')
    expect(result.name).toBe('Encrypted Data Chip')
    expect(client.state.consumables).toHaveLength(1)
  })

  test('adds an armor catalog item as new equipment', async () => {
    const client = createFakeClient({
      shopItems: [{ name: 'Recruit Training Vest', description: 'x', type: 'armor', rarity: 'common', stats: { armorType: 'light', guardBonus: 1 } }],
    })

    const result = await RecruitService.giveItem(client, PLAYER_ID, 'Recruit Training Vest')
    expect(result.name).toBe('Recruit Training Vest')
    expect(client.state.equipment).toHaveLength(1)
  })

  test('returns null for an item name not in the catalog', async () => {
    const client = createFakeClient({ shopItems: [] })
    const result = await RecruitService.giveItem(client, PLAYER_ID, 'Nonexistent Item')
    expect(result).toBeNull()
  })
})

describe('insertSeededCandidate', () => {
  test('inserts a candidate tagged with the given seed key', async () => {
    const client = createFakeClient({ players: { [PLAYER_ID]: { next_candidate_id: 7 } } })

    const result = await RecruitService.insertSeededCandidate(client, PLAYER_ID, 'cult-defector')

    expect(result.id).toBe(7)
    expect(result.seed_key).toBe('cult-defector')
    expect(client.state.players[PLAYER_ID].next_candidate_id).toBe(8)
  })
})
