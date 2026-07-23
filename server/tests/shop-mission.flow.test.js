// End-to-end flow test: buy a ship, hire a candidate, assign the recruit to
// that ship, buy a consumable, load it into the ship's inventory, then start
// a mission with it. Unlike game.service.test.js (which mocks ship.service
// and consumable.service), this test exercises the REAL shop/ship/consumable
// services together against a shared fake in-memory Postgres, so it actually
// catches wiring bugs between them (wrong field names, wrong status checks,
// mismatched signatures) that per-service unit tests, mocked at the service
// boundary, cannot see.
const GameService = require('../src/services/game.service')
const ShopService = require('../src/services/shop.service')
const ShipService = require('../src/services/ship.service')
const ConsumableService = require('../src/services/consumable.service')

jest.mock('../src/db/pool', () => ({ pool: { connect: jest.fn(), query: jest.fn() } }))
const { pool } = require('../src/db/pool')

function createFakeClient() {
  const state = {
    players: [],
    candidates: [],
    recruits: [],
    missionTemplates: [],
    missionInstances: [],
    ships: [],
    hangars: [],
    dockingStations: [],
    shopItems: [],
    shopRotation: [],
    consumables: [],
    purchaseHistory: [],
    logEntries: [],
  }
  let nextInstanceId = 1000
  let nextShopItemId = 1
  let nextConsumableId = 1
  const sameId = (a, b) => String(a) === String(b)

  const query = jest.fn(async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim()

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] }

    // players
    if (s.includes('INSERT INTO players')) {
      const [id, display_name] = params
      const player = {
        id, display_name, wallet: 10000, tokens: 0,
        max_recruits: 5, max_available_missions: 5,
        next_candidate_id: 1, next_recruit_id: 1, next_ship_id: 1,
        next_template_id: 1, mission_refresh_at: null, shop_refresh_at: null, candidate_refresh_at: null,
        mission_refresh_interval_ms: 900000, shop_refresh_interval_ms: 900000, candidate_refresh_interval_ms: 300000,
        shop_rotation_size: 5, inventory_capacity: 5,
      }
      state.players.push(player)
      return { rows: [player] }
    }
    if (s.includes('SELECT max_recruits, max_available_missions, wallet, tokens,')) {
      const p = state.players.find(p => p.id === params[0])
      return {
        rows: p ? [{
          max_recruits: p.max_recruits, max_available_missions: p.max_available_missions,
          wallet: p.wallet, tokens: p.tokens,
          mission_refresh_interval_ms: p.mission_refresh_interval_ms,
          shop_refresh_interval_ms: p.shop_refresh_interval_ms,
          candidate_refresh_interval_ms: p.candidate_refresh_interval_ms,
        }] : [],
      }
    }
    if (s.includes('UPDATE players SET next_candidate_id = $1 WHERE id = $2')) {
      Object.assign(state.players.find(p => p.id === params[1]), { next_candidate_id: params[0] })
      return { rows: [] }
    }
    if (s === 'UPDATE players SET candidate_refresh_at = $1 WHERE id = $2') {
      const [candidate_refresh_at, id] = params
      Object.assign(state.players.find(p => p.id === id), { candidate_refresh_at })
      return { rows: [] }
    }
    if (s.includes('UPDATE players SET next_ship_id = next_ship_id + 1')) {
      state.players.find(p => p.id === params[0]).next_ship_id++
      return { rows: [] }
    }
    if (s.includes('UPDATE players SET next_recruit_id = next_recruit_id + 1')) {
      state.players.find(p => p.id === params[0]).next_recruit_id++
      return { rows: [] }
    }
    if (s.includes('UPDATE players SET last_tick_at = NOW()')) {
      return { rows: [] }
    }
    if (s === 'SELECT * FROM players WHERE id = $1') {
      return { rows: state.players.filter(p => p.id === params[0]) }
    }
    if (s === 'SELECT wallet, tokens FROM players WHERE id = $1 FOR UPDATE') {
      return { rows: state.players.filter(p => p.id === params[0]).map(p => ({ wallet: p.wallet, tokens: p.tokens })) }
    }
    if (s === 'SELECT wallet, shop_refresh_at, shop_refresh_interval_ms FROM players WHERE id = $1 FOR UPDATE') {
      return { rows: state.players.filter(p => p.id === params[0]).map(p => ({ wallet: p.wallet, shop_refresh_at: p.shop_refresh_at, shop_refresh_interval_ms: p.shop_refresh_interval_ms })) }
    }
    if (s === 'SELECT shop_refresh_at, shop_refresh_interval_ms FROM players WHERE id = $1') {
      return { rows: state.players.filter(p => p.id === params[0]).map(p => ({ shop_refresh_at: p.shop_refresh_at, shop_refresh_interval_ms: p.shop_refresh_interval_ms })) }
    }
    if (s === 'SELECT shop_rotation_size, shop_refresh_interval_ms FROM players WHERE id = $1') {
      return { rows: state.players.filter(p => p.id === params[0]).map(p => ({ shop_rotation_size: p.shop_rotation_size, shop_refresh_interval_ms: p.shop_refresh_interval_ms })) }
    }
    if (s === 'UPDATE players SET shop_refresh_at = $1 WHERE id = $2') {
      const [shop_refresh_at, id] = params
      Object.assign(state.players.find(p => p.id === id), { shop_refresh_at })
      return { rows: [] }
    }
    if (s === 'SELECT inventory_capacity FROM players WHERE id = $1') {
      return { rows: state.players.filter(p => p.id === params[0]).map(p => ({ inventory_capacity: p.inventory_capacity })) }
    }
    if (s === 'SELECT COUNT(*)::int AS count FROM consumables WHERE player_id = $1 AND assigned_to_ship IS NULL') {
      return { rows: [{ count: state.consumables.filter(c => c.player_id === params[0] && c.assigned_to_ship == null).length }] }
    }
    if (s === 'SELECT COUNT(*)::int AS count FROM ships WHERE player_id = $1 AND deleted_at IS NULL') {
      return { rows: [{ count: state.ships.filter(sh => sh.player_id === params[0] && !sh.deleted_at).length }] }
    }
    if (s === 'SELECT COALESCE(SUM(capacity), 0)::int AS capacity FROM docking_stations WHERE player_id = $1') {
      const capacity = state.dockingStations.filter(d => d.player_id === params[0]).reduce((sum, d) => sum + d.capacity, 0)
      return { rows: [{ capacity }] }
    }
    if (s === 'SELECT next_ship_id FROM players WHERE id = $1') {
      return { rows: state.players.filter(p => p.id === params[0]).map(p => ({ next_ship_id: p.next_ship_id })) }
    }
    if (s === 'UPDATE players SET wallet = $1, next_ship_id = next_ship_id + 1 WHERE id = $2') {
      const [wallet, id] = params
      const p = state.players.find(p => p.id === id)
      Object.assign(p, { wallet, next_ship_id: p.next_ship_id + 1 })
      return { rows: [] }
    }
    if (s === 'UPDATE players SET wallet = $1 WHERE id = $2') {
      const [wallet, id] = params
      Object.assign(state.players.find(p => p.id === id), { wallet })
      return { rows: [] }
    }
    if (s === 'UPDATE players SET wallet = $1, tokens = $2 WHERE id = $3') {
      const [wallet, tokens, id] = params
      Object.assign(state.players.find(p => p.id === id), { wallet, tokens })
      return { rows: [] }
    }

    // candidates
    if (s.includes('INSERT INTO candidates')) {
      const [id, player_id, name, job_title, archetype, hp, max_hp, attributes, perks, flaws, personality] = params
      state.candidates.push({
        id, player_id, name, job_title, archetype, hp, max_hp,
        attributes: JSON.parse(attributes), perks: JSON.parse(perks), flaws: JSON.parse(flaws), personality,
      })
      return { rows: [] }
    }
    if (s === 'SELECT COUNT(*)::int AS count FROM candidates WHERE player_id = $1') {
      return { rows: [{ count: state.candidates.filter(c => c.player_id === params[0]).length }] }
    }
    if (s === 'SELECT id FROM candidates WHERE player_id = $1 ORDER BY id LIMIT 1') {
      const list = state.candidates.filter(c => c.player_id === params[0]).sort((a, b) => a.id - b.id)
      return { rows: list.length ? [{ id: list[0].id }] : [] }
    }
    if (s === 'SELECT * FROM candidates WHERE player_id = $1 AND id = $2') {
      return { rows: state.candidates.filter(c => c.player_id === params[0] && c.id === params[1]) }
    }
    if (s === 'DELETE FROM candidates WHERE player_id = $1 AND id = $2') {
      state.candidates = state.candidates.filter(c => !(c.player_id === params[0] && c.id === params[1]))
      return { rows: [] }
    }
    if (s === 'DELETE FROM candidates WHERE player_id = $1') {
      state.candidates = state.candidates.filter(c => c.player_id !== params[0])
      return { rows: [] }
    }
    if (s === 'SELECT * FROM candidates WHERE player_id = $1 ORDER BY id') {
      return { rows: state.candidates.filter(c => c.player_id === params[0]).sort((a, b) => a.id - b.id) }
    }

    // recruits
    if (s.startsWith('SELECT * FROM recruits WHERE player_id = $1 AND id = $2')) {
      return { rows: state.recruits.filter(r => r.player_id === params[0] && sameId(r.id, params[1])) }
    }
    if (s.includes('UPDATE recruits SET hp = $1, status = $2')) {
      const [hp, status, playerId, id] = params
      const r = state.recruits.find(r => r.player_id === playerId && sameId(r.id, id))
      if (r) Object.assign(r, { hp, status })
      return { rows: [] }
    }
    if (s.includes('UPDATE recruits SET status = $1') && s.includes("status != 'dead'")) {
      const [status, playerId, id] = params
      const r = state.recruits.find(r => r.player_id === playerId && sameId(r.id, id))
      if (r && r.status !== 'dead') r.status = status
      return { rows: [] }
    }
    if (s === 'SELECT name FROM recruits WHERE player_id = $1 AND id = $2') {
      const r = state.recruits.find(r => r.player_id === params[0] && sameId(r.id, params[1]))
      return { rows: r ? [{ name: r.name }] : [] }
    }
    if (s === 'SELECT COUNT(*)::int AS count FROM recruits WHERE player_id = $1 AND deleted_at IS NULL') {
      return { rows: [{ count: state.recruits.filter(r => r.player_id === params[0] && !r.deleted_at).length }] }
    }
    if (s.includes('INSERT INTO recruits')) {
      const [id, player_id, name, job_title, hp, max_hp, original_max_hp, attributes, perks, flaws, personality] = params
      state.recruits.push({
        id, player_id, name, job_title, status: 'available', hp, max_hp, original_max_hp,
        attributes: JSON.parse(attributes), perks: JSON.parse(perks), flaws: JSON.parse(flaws), personality,
      })
      return { rows: [] }
    }
    if (s === 'SELECT * FROM recruits WHERE player_id = $1 AND deleted_at IS NULL ORDER BY id') {
      return { rows: state.recruits.filter(r => r.player_id === params[0]).sort((a, b) => a.id - b.id) }
    }

    // mission_templates
    if (s === 'SELECT COUNT(*)::int AS count FROM mission_templates') {
      return { rows: [{ count: state.missionTemplates.length }] }
    }
    if (s.includes('INSERT INTO mission_templates')) {
      const [id, name, description, difficulty, events] = params
      const tpl = { id, name, description, difficulty, events: JSON.parse(events) }
      const existing = state.missionTemplates.find(t => t.id === id)
      if (existing) Object.assign(existing, tpl)
      else state.missionTemplates.push(tpl)
      return { rows: [] }
    }
    if (s === 'SELECT * FROM mission_templates WHERE id = $1') {
      return { rows: state.missionTemplates.filter(t => t.id === params[0]) }
    }
    if (s === 'SELECT * FROM mission_templates ORDER BY id') {
      return { rows: [...state.missionTemplates].sort((a, b) => a.id - b.id) }
    }
    if (s === 'SELECT id FROM mission_templates WHERE opera_instance_id IS NULL') {
      return { rows: state.missionTemplates.filter(t => !t.opera_instance_id).map(t => ({ id: t.id })) }
    }
    if (s === 'DELETE FROM mission_templates WHERE id = ANY($1::int[])') {
      const ids = new Set(params[0])
      state.missionTemplates = state.missionTemplates.filter(t => !ids.has(t.id))
      return { rows: [] }
    }
    if (s === 'SELECT DISTINCT template_id FROM mission_instances WHERE player_id = $1') {
      const ids = new Set(state.missionInstances.filter(i => i.player_id === params[0]).map(i => i.template_id))
      return { rows: [...ids].map(template_id => ({ template_id })) }
    }
    if (s === 'UPDATE players SET next_template_id = $1, mission_refresh_at = $2 WHERE id = $3') {
      const [next_template_id, mission_refresh_at, id] = params
      Object.assign(state.players.find(p => p.id === id), { next_template_id, mission_refresh_at })
      return { rows: [] }
    }

    // mission_instances
    if (s === 'SELECT * FROM mission_instances WHERE player_id = $1 AND template_id = $2') {
      return { rows: state.missionInstances.filter(i => i.player_id === params[0] && i.template_id === params[1]) }
    }
    if (s.includes('INSERT INTO mission_instances')) {
      const [player_id, template_id, ship_id, travel_segment_ms, events_segment_ms] = params
      const instance = {
        id: nextInstanceId++, player_id, template_id, ship_id, status: 'in_progress', phase: 'EN_ROUTE',
        progress: 0, started_at: new Date(), failed: false, reward_forfeited: false, current_event_index: 0,
        event_results: [], forced_return: false, return_started_at: null, progress_at_return: null,
        travel_segment_ms, events_segment_ms,
      }
      state.missionInstances.push(instance)
      return { rows: [instance] }
    }
    if (s === 'SELECT * FROM mission_instances WHERE player_id = $1 AND status = $2') {
      return { rows: state.missionInstances.filter(i => i.player_id === params[0] && i.status === params[1]) }
    }
    if (s.includes('UPDATE mission_instances SET phase = $1, progress = $2, failed = $3')) {
      const [phase, progress, failed, rewardForfeited, currentEventIndex, eventResults, id] = params
      const i = state.missionInstances.find(i => i.id === id)
      Object.assign(i, {
        phase, progress, failed, reward_forfeited: rewardForfeited,
        current_event_index: currentEventIndex, event_results: JSON.parse(eventResults),
      })
      return { rows: [] }
    }
    if (s === 'SELECT * FROM mission_instances WHERE player_id = $1') {
      return { rows: state.missionInstances.filter(i => i.player_id === params[0]) }
    }

    // ships
    if (s === 'SELECT * FROM ships WHERE player_id = $1 AND deleted_at IS NULL ORDER BY created_at') {
      return { rows: state.ships.filter(sh => sh.player_id === params[0] && !sh.deleted_at) }
    }
    if (s === 'SELECT * FROM ships WHERE player_id = $1 AND deleted_at IS NULL ORDER BY id') {
      return { rows: state.ships.filter(sh => sh.player_id === params[0] && !sh.deleted_at).sort((a, b) => a.id - b.id) }
    }
    if (s === 'SELECT * FROM ships WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL'
      || s === 'SELECT * FROM ships WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE') {
      return { rows: state.ships.filter(sh => sh.player_id === params[0] && sh.id === params[1] && !sh.deleted_at) }
    }
    if (s.includes('INSERT INTO ships')) {
      const [player_id, id, name, galactic_id, rarity, stats, crew, status] = params
      const ship = {
        id, player_id, name, galactic_id, rarity, stats: JSON.parse(stats),
        crew: [], status, deleted_at: null, created_at: new Date(),
      }
      state.ships.push(ship)
      return { rows: [ship] }
    }
    if (s === 'UPDATE ships SET crew = $1 WHERE player_id = $2 AND id = $3 AND deleted_at IS NULL RETURNING *') {
      const [crew, playerId, id] = params
      const sh = state.ships.find(sh => sh.player_id === playerId && sh.id === id && !sh.deleted_at)
      if (sh) sh.crew = crew
      return { rows: sh ? [sh] : [] }
    }
    if (s === 'UPDATE ships SET status = $1 WHERE player_id = $2 AND id = $3 AND deleted_at IS NULL RETURNING *') {
      const [status, playerId, id] = params
      const sh = state.ships.find(sh => sh.player_id === playerId && sh.id === id && !sh.deleted_at)
      if (sh) sh.status = status
      return { rows: sh ? [sh] : [] }
    }
    if (s === "UPDATE ships SET status = 'destroyed', deleted_at = NOW() WHERE player_id = $1 AND id = $2 RETURNING *") {
      const [playerId, id] = params
      const sh = state.ships.find(sh => sh.player_id === playerId && sh.id === id)
      if (sh) Object.assign(sh, { status: 'destroyed', deleted_at: new Date() })
      return { rows: sh ? [sh] : [] }
    }
    if (s === 'UPDATE ships SET stats = $1, status = $2 WHERE player_id = $3 AND id = $4 RETURNING *') {
      const [stats, status, playerId, id] = params
      const sh = state.ships.find(sh => sh.player_id === playerId && sh.id === id)
      if (sh) Object.assign(sh, { stats: JSON.parse(stats), status })
      return { rows: sh ? [sh] : [] }
    }
    if (s.includes('crew = array_append(crew, $3)')) {
      const [playerId, id, recruitId] = params
      const sh = state.ships.find(sh => sh.player_id === playerId && sh.id === id && !sh.deleted_at)
      if (!sh || sh.crew.includes(recruitId)) return { rows: [] }
      sh.crew.push(recruitId)
      return { rows: [sh] }
    }
    if (s.includes('crew = array_remove(crew, $3)')) {
      const [playerId, id, recruitId] = params
      const sh = state.ships.find(sh => sh.player_id === playerId && sh.id === id && !sh.deleted_at)
      if (sh) sh.crew = sh.crew.filter(c => c !== recruitId)
      return { rows: sh ? [sh] : [] }
    }
    if (s === 'UPDATE ships SET name = $3 WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING *') {
      const [playerId, id, name] = params
      const sh = state.ships.find(sh => sh.player_id === playerId && sh.id === id && !sh.deleted_at)
      if (sh) sh.name = name
      return { rows: sh ? [sh] : [] }
    }

    // hangars / docking stations
    if (s === 'SELECT * FROM hangars WHERE player_id = $1') {
      return { rows: state.hangars.filter(h => h.player_id === params[0]) }
    }
    if (s.includes('INSERT INTO hangars')) {
      const hangar = { player_id: params[0], max_ships: params[1] }
      state.hangars.push(hangar)
      return { rows: [hangar] }
    }
    if (s === 'SELECT * FROM docking_stations WHERE player_id = $1 ORDER BY id') {
      return { rows: state.dockingStations.filter(d => d.player_id === params[0]) }
    }
    if (s.includes('INSERT INTO docking_stations')) {
      const station = { id: state.dockingStations.length + 1, player_id: params[0], capacity: params[1] }
      state.dockingStations.push(station)
      return { rows: [station] }
    }

    // shop_items / shop_rotation
    if (s === 'SELECT * FROM shop_items ORDER BY id') {
      return { rows: state.shopItems }
    }
    if (s === 'DELETE FROM shop_rotation WHERE player_id = $1') {
      state.shopRotation = state.shopRotation.filter(r => r.player_id !== params[0])
      return { rows: [] }
    }
    if (s === 'INSERT INTO shop_rotation (player_id, shop_item_id, remaining_stock) VALUES ($1, $2, $3)') {
      const [player_id, shop_item_id, remaining_stock] = params
      state.shopRotation.push({ player_id, shop_item_id, remaining_stock })
      return { rows: [] }
    }
    if (s.startsWith('SELECT si.*, sr.remaining_stock FROM shop_items si')) {
      // Covers getShopItems (rotation.player_id = $1 only), getShopItem, and
      // lockRotationItem (both `sr.player_id = $1 AND si.id = $2`) — the
      // fake client doesn't model row locking, so FOR UPDATE OF sr is a no-op.
      const joined = state.shopRotation
        .filter(r => r.player_id === params[0])
        .map(r => ({ ...state.shopItems.find(i => i.id === r.shop_item_id), remaining_stock: r.remaining_stock }))
      const rows = params.length > 1 ? joined.filter(i => i.id === params[1]) : joined
      return { rows }
    }
    if (s === 'UPDATE shop_rotation SET remaining_stock = remaining_stock - 1 WHERE player_id = $1 AND shop_item_id = $2') {
      const [player_id, shop_item_id] = params
      state.shopRotation.find(r => r.player_id === player_id && r.shop_item_id === shop_item_id).remaining_stock -= 1
      return { rows: [] }
    }
    if (s === 'UPDATE shop_rotation SET remaining_stock = remaining_stock - $1 WHERE player_id = $2 AND shop_item_id = $3') {
      const [qty, player_id, shop_item_id] = params
      state.shopRotation.find(r => r.player_id === player_id && r.shop_item_id === shop_item_id).remaining_stock -= qty
      return { rows: [] }
    }

    // consumables
    if (s === 'SELECT * FROM consumables WHERE player_id = $1 AND name = $2 AND assigned_to_ship IS NULL') {
      return { rows: state.consumables.filter(c => c.player_id === params[0] && c.name === params[1] && c.assigned_to_ship == null) }
    }
    if (s === 'SELECT * FROM consumables WHERE player_id = $1 AND name = $2 AND assigned_to_ship = $3') {
      return { rows: state.consumables.filter(c => c.player_id === params[0] && c.name === params[1] && c.assigned_to_ship === params[2]) }
    }
    if (s === 'SELECT * FROM consumables WHERE id = $1') {
      return { rows: state.consumables.filter(c => c.id === params[0]) }
    }
    if (s === 'SELECT * FROM consumables WHERE assigned_to_ship = $1 ORDER BY created_at') {
      return { rows: state.consumables.filter(c => c.assigned_to_ship === params[0]) }
    }
    if (s === 'SELECT * FROM consumables WHERE assigned_to_ship = $1 AND effect = $2 ORDER BY id') {
      return { rows: state.consumables.filter(c => c.assigned_to_ship === params[0] && c.effect === params[1]) }
    }
    if (s === 'SELECT * FROM consumables WHERE player_id = $1 ORDER BY created_at') {
      return { rows: state.consumables.filter(c => c.player_id === params[0]) }
    }
    if (s === 'SELECT * FROM consumables WHERE player_id = $1 AND assigned_to_ship IS NULL ORDER BY created_at') {
      return { rows: state.consumables.filter(c => c.player_id === params[0] && c.assigned_to_ship == null) }
    }
    if (s.includes('UPDATE consumables SET quantity = quantity + $1 WHERE id = $2')) {
      const [qty, id] = params
      const c = state.consumables.find(c => c.id === id)
      c.quantity += qty
      return { rows: [c] }
    }
    if (s.includes('UPDATE consumables SET quantity = quantity - $1 WHERE id = $2')) {
      const [qty, id] = params
      const c = state.consumables.find(c => c.id === id)
      c.quantity -= qty
      return { rows: [c] }
    }
    if (s === 'UPDATE consumables SET quantity = quantity - 1 WHERE id = $1') {
      const c = state.consumables.find(c => c.id === params[0])
      c.quantity -= 1
      return { rows: [c] }
    }
    if (s === 'DELETE FROM consumables WHERE id = $1') {
      state.consumables = state.consumables.filter(c => c.id !== params[0])
      return { rows: [] }
    }
    if (s.includes('INSERT INTO consumables (player_id, name, description, rarity, price, effect, effect_data, quantity, assigned_to_ship)')) {
      const [player_id, name, description, rarity, price, effect, effect_data, quantity, assigned_to_ship] = params
      const c = {
        id: nextConsumableId++, player_id, name, description, rarity, price, effect,
        effect_data: JSON.parse(effect_data), quantity, assigned_to_ship, created_at: new Date(),
      }
      state.consumables.push(c)
      return { rows: [c] }
    }
    if (s.includes('INSERT INTO consumables (player_id, name, description, rarity, price, effect, effect_data, quantity)')) {
      const [player_id, name, description, rarity, price, effect, effect_data, quantity] = params
      const c = {
        id: nextConsumableId++, player_id, name, description, rarity, price, effect,
        effect_data: JSON.parse(effect_data), quantity, assigned_to_ship: null, created_at: new Date(),
      }
      state.consumables.push(c)
      return { rows: [c] }
    }

    // purchase_history
    if (s.includes('INSERT INTO purchase_history')) {
      state.purchaseHistory.push({ player_id: params[0], item_id: params[1], item_type: params[2], price_paid: params[3] })
      return { rows: [] }
    }

    // log_entries
    if (s.includes('INSERT INTO log_entries')) {
      state.logEntries.push({ player_id: params[0], tag: params[1], message: params[2], mission_id: params[3] })
      return { rows: [] }
    }
    if (s.includes('SELECT tag, message, mission_id AS "missionId" FROM log_entries')) {
      return { rows: state.logEntries.filter(l => l.player_id === params[0]) }
    }
    if (s.includes('SELECT message FROM log_entries')) {
      const [playerId, missionId, limit] = params
      const matches = state.logEntries.filter(l => l.player_id === playerId && sameId(l.mission_id, missionId))
      return { rows: matches.slice(-limit).reverse().map(l => ({ message: l.message })) }
    }

    throw new Error(`Query not handled by the fake test client: ${s}`)
  })

  return { client: { query, release: jest.fn() }, state, seedShopItem(item) {
    const row = { id: nextShopItemId++, available: true, stats: null, effect: null, effect_data: {}, max_stock: 1, ...item }
    state.shopItems.push(row)
    return row
  } }
}

describe('Full flow: buy ship -> hire -> assign crew -> buy item -> assign inventory -> start mission', () => {
  let state
  let seedShopItem

  beforeEach(() => {
    jest.clearAllMocks()
    const fake = createFakeClient()
    state = fake.state
    seedShopItem = fake.seedShopItem
    pool.connect.mockResolvedValue(fake.client)
    pool.query.mockImplementation((sql, params) => fake.client.query(sql, params))
  })

  test('the whole chain succeeds and leaves the game in the expected state', async () => {
    const corsair = seedShopItem({
      name: 'Corsair', description: 'fast', type: 'ship', rarity: 'common', price: 5000,
      stats: { speed: 120, capacity: 2, inventory_space: 10, durability: 8, max_durability: 8, price: 5000 },
    })
    const speedBoost = seedShopItem({
      name: 'Overdrive Injector', description: 'faster travel', type: 'consumable', rarity: 'uncommon', price: 1200,
      effect: 'SPEED_BOOST', effect_data: { multiplier: 1.5 },
    })

    await GameService.initGame()
    expect(state.players[0].wallet).toBe(10000)

    // 1. Buy a ship
    const buyShipResult = await (async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await ShopService.buyShip(client, 1, corsair.id)
        await client.query('COMMIT')
        return result
      } finally {
        client.release()
      }
    })()

    expect(buyShipResult.error).toBeUndefined()
    expect(buyShipResult.success).toBe(true)
    expect(buyShipResult.wallet).toBe(5000)
    const newShipId = buyShipResult.ship.id
    expect(state.ships.find(s => s.id === newShipId)).toMatchObject({ status: 'docked', crew: [] })

    // 2. Hire a candidate
    let state2 = await GameService.getGameState()
    const candidateId = state2.candidates[0].id
    const hireResult = await GameService.hireCandidate(String(candidateId))
    expect(hireResult.error).toBeUndefined()
    const recruitId = Number(hireResult.recruit.id)
    expect(hireResult.recruit.status).toBe('available')

    // 3. Assign the recruit to the newly bought ship
    const crewClient = await pool.connect()
    const assignedShip = await ShipService.appendCrewMember(crewClient, 1, newShipId, recruitId)
    crewClient.release()
    expect(assignedShip).toBeDefined()
    expect(assignedShip.crew).toContain(recruitId)

    // 4. Buy a consumable (speed boost)
    const buyConsumableResult = await (async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await ShopService.buyConsumable(client, 1, speedBoost.id, 1)
        await client.query('COMMIT')
        return result
      } finally {
        client.release()
      }
    })()
    expect(buyConsumableResult.error).toBeUndefined()
    expect(buyConsumableResult.success).toBe(true)
    expect(buyConsumableResult.wallet).toBe(5000 - 1200)
    const consumableId = buyConsumableResult.consumable.id
    expect(buyConsumableResult.consumable.assigned_to_ship).toBeNull()

    // 5. Load the item into the ship's inventory
    const invClient = await pool.connect()
    const assignInvResult = await ConsumableService.assignToShip(invClient, 1, consumableId, newShipId, 1)
    invClient.release()
    expect(assignInvResult).toBeDefined()
    expect(assignInvResult.assigned_to_ship).toBe(newShipId)
    expect(assignInvResult.quantity).toBe(1)

    // 6. Start a mission with that ship, consuming the speed-boost item
    state2 = await GameService.getGameState()
    const mission = state2.missions.find(m => m.status === 'available')
    expect(mission).toBeDefined()

    const startResult = await GameService.startMission(mission.id, newShipId, assignInvResult.id)
    expect(startResult.error).toBeUndefined()

    const instance = state.missionInstances.find(i => i.ship_id === newShipId)
    expect(instance).toBeDefined()
    expect(instance.phase).toBe('EN_ROUTE')
    expect(instance.status).toBe('in_progress')

    // the speed item shortened the travel leg compared to the ship's base speed (120)
    const { travelSegmentMs } = require('../src/domain/mission')
    const missionDifficulty = state.missionTemplates.find(t => t.id === mission.id).difficulty
    expect(instance.travel_segment_ms).toBe(travelSegmentMs(missionDifficulty, 120 * 1.5))
    expect(instance.travel_segment_ms).toBeLessThan(travelSegmentMs(missionDifficulty, 120))

    // the item was consumed: no longer in the ship's inventory
    expect(state.consumables.find(c => c.id === consumableId)).toBeUndefined()

    // the ship and the recruit are both committed to the mission
    expect(state.ships.find(s => s.id === newShipId).status).toBe('in_mission')
    expect(state.recruits.find(r => Number(r.id) === recruitId).status).toBe('in_mission')
  })

  test('refuses to start the mission if the loaded item is not actually a speed-boost consumable', async () => {
    const corsair = seedShopItem({
      name: 'Corsair', type: 'ship', rarity: 'common', price: 5000,
      stats: { speed: 120, durability: 8, max_durability: 8 },
    })
    const healItem = seedShopItem({
      name: 'Trauma Nanites', type: 'consumable', rarity: 'rare', price: 2500, effect: 'HEAL', effect_data: {},
    })

    await GameService.initGame()
    const buyShipResult = await (async () => {
      const client = await pool.connect()
      await client.query('BEGIN')
      const result = await ShopService.buyShip(client, 1, corsair.id)
      await client.query('COMMIT')
      client.release()
      return result
    })()
    const shipId = buyShipResult.ship.id

    const candidateId = (await GameService.getGameState()).candidates[0].id
    const recruitId = Number((await GameService.hireCandidate(String(candidateId))).recruit.id)
    const crewClient = await pool.connect()
    await ShipService.appendCrewMember(crewClient, 1, shipId, recruitId)
    crewClient.release()

    const buyResult = await (async () => {
      const client = await pool.connect()
      await client.query('BEGIN')
      const result = await ShopService.buyConsumable(client, 1, healItem.id, 1)
      await client.query('COMMIT')
      client.release()
      return result
    })()
    const invClient = await pool.connect()
    const inv = await ConsumableService.assignToShip(invClient, 1, buyResult.consumable.id, shipId, 1)
    invClient.release()

    const mission = (await GameService.getGameState()).missions.find(m => m.status === 'available')
    const startResult = await GameService.startMission(mission.id, shipId, inv.id)

    expect(startResult.error).toBe("Speed-boost item not found in this ship's inventory")
    // the HEAL item is untouched (not consumed by the failed start attempt)
    expect(state.consumables.find(c => c.id === inv.id)?.quantity).toBe(1)
  })
})

describe('devRefresh', () => {
  let state
  let seedShopItem

  beforeEach(() => {
    jest.clearAllMocks()
    const fake = createFakeClient()
    state = fake.state
    seedShopItem = fake.seedShopItem
    pool.connect.mockResolvedValue(fake.client)
    pool.query.mockImplementation((sql, params) => fake.client.query(sql, params))
  })

  test('force-refreshes missions, candidates, and the shop rotation, even though nothing is due yet', async () => {
    seedShopItem({
      name: 'Corsair', type: 'ship', rarity: 'common', price: 5000,
      stats: { speed: 120, capacity: 2, inventory_space: 10, durability: 8, max_durability: 8, price: 5000 },
    })

    await GameService.initGame()
    // The shop rotation was never drawn (no shop endpoint was hit yet), and
    // the mission batch/candidates were just generated by initGame — nothing
    // is due for a wall-clock refresh at this point.
    expect(state.shopRotation).toHaveLength(0)
    expect(state.players[0].shop_refresh_at).toBeNull()
    const previousTemplateIds = state.missionTemplates.map(t => t.id).sort()

    const result = await GameService.devRefresh()

    expect(state.missionTemplates).toHaveLength(5)
    expect(state.missionTemplates.map(t => t.id).sort()).not.toEqual(previousTemplateIds)
    expect(state.candidates).toHaveLength(5)
    expect(state.shopRotation.length).toBeGreaterThan(0)
    expect(state.players[0].shop_refresh_at).not.toBeNull()
    expect(result.state.player).toBeDefined()
  })
})
