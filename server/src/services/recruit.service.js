// Recruit-mutation primitives with no equivalent before the opera graph
// engine: firing a recruit, applying a perk/flaw, adjusting an attribute,
// and handing over an item directly (the 'give_item'/'apply_perk'/
// 'apply_flaw'/'adjust_stat' story-node effects, plus fire_recruit).
// Deliberately has no dependency on opera.service.js (which depends on this
// file for effect application) -- callers that need to also record an opera
// action (see game.service.js's `fireRecruit` export) do so themselves,
// the same way ship/equipment/consumable services already call
// OperaService.recordOperaAction from their own action functions, just kept
// one level up here to avoid a require cycle with opera.service.js.

const fs = require('fs')
const path = require('path')
const { rollInRange } = require('./dice.service')
const ConsumableService = require('./consumable.service')
const EquipmentService = require('./equipment.service')
const { generateCandidate, computeMaxHp, ATTRIBUTE_KEYS } = require('../domain/recruit')

const PERKS_FLAWS_PATH = path.join(__dirname, '../../data/perks-flaws.json')

function loadPerksFlaws() {
  return JSON.parse(fs.readFileSync(PERKS_FLAWS_PATH, 'utf8'))
}

// Soft-deletes a recruit (mirrors ships.deleted_at -- see ship.service.js)
// and drops them from any ship crew they're currently assigned to. Returns
// the deleted recruit row, or null if not found/already deleted.
async function fireRecruit(client, playerId, recruitId) {
  const result = await client.query(
    `UPDATE recruits SET deleted_at = NOW()
     WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [playerId, recruitId],
  )
  const recruit = result.rows[0]
  if (!recruit) return null

  await client.query(
    `UPDATE ships SET crew = array_remove(crew, $2)
     WHERE player_id = $1 AND deleted_at IS NULL AND $2 = ANY(crew)`,
    [playerId, recruitId],
  )
  return recruit
}

async function getRecruitRow(client, playerId, recruitId) {
  const result = await client.query(
    'SELECT * FROM recruits WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL',
    [playerId, recruitId],
  )
  return result.rows[0] ?? null
}

// Appends a perk/flaw the same shape generateCandidate() already produces
// ({name, description}) if not already present. Stays exactly as
// mechanically inert as every other perk/flaw in the game (flavor +
// log.service.js banter/quote selection only) -- no new combat hook.
async function applyPerk(client, playerId, recruitId, perkName, description = '') {
  const recruit = await getRecruitRow(client, playerId, recruitId)
  if (!recruit) return null
  if (recruit.perks.some((p) => p.name === perkName)) return recruit

  const perks = [...recruit.perks, { name: perkName, description }]
  const result = await client.query(
    'UPDATE recruits SET perks = $1 WHERE player_id = $2 AND id = $3 RETURNING *',
    [JSON.stringify(perks), playerId, recruitId],
  )
  return result.rows[0]
}

async function applyFlaw(client, playerId, recruitId, flawName, description = '') {
  const recruit = await getRecruitRow(client, playerId, recruitId)
  if (!recruit) return null
  if (recruit.flaws.some((f) => f.name === flawName)) return recruit

  const flaws = [...recruit.flaws, { name: flawName, description }]
  const result = await client.query(
    'UPDATE recruits SET flaws = $1 WHERE player_id = $2 AND id = $3 RETURNING *',
    [JSON.stringify(flaws), playerId, recruitId],
  )
  return result.rows[0]
}

// Adjusts one attribute by a signed delta, then recomputes+writes max_hp
// (never below 1 current hp) if the touched attribute feeds computeMaxHp
// (fortitude/presence/will) -- mirrors how max HP is derived once at
// creation and otherwise never recalculated.
async function adjustAttribute(client, playerId, recruitId, attribute, amount) {
  if (!ATTRIBUTE_KEYS.includes(attribute)) return null
  const recruit = await getRecruitRow(client, playerId, recruitId)
  if (!recruit) return null

  const attributes = {
    ...recruit.attributes,
    [attribute]: (recruit.attributes[attribute] ?? 0) + amount,
  }

  if (['fortitude', 'presence', 'will'].includes(attribute)) {
    const maxHp = computeMaxHp(attributes)
    const hp = Math.min(recruit.hp, maxHp)
    const result = await client.query(
      'UPDATE recruits SET attributes = $1, max_hp = $2, hp = $3 WHERE player_id = $4 AND id = $5 RETURNING *',
      [JSON.stringify(attributes), maxHp, hp, playerId, recruitId],
    )
    return result.rows[0]
  }

  const result = await client.query(
    'UPDATE recruits SET attributes = $1 WHERE player_id = $2 AND id = $3 RETURNING *',
    [JSON.stringify(attributes), playerId, recruitId],
  )
  return result.rows[0]
}

// Hands the player a shop-catalog item directly, bypassing wallet/rotation.
// The item must already exist in the shop_items master catalog -- OGL's
// give_item effect only carries an itemName, no stats/price, so it can only
// reference an existing catalog entry, not invent a new one (same
// constraint as the 'shop' seed target). Returns null if the name isn't in
// the catalog, or if a consumable can't fit (stash full).
async function giveItem(client, playerId, itemName) {
  const item = (await client.query('SELECT * FROM shop_items WHERE name = $1', [itemName])).rows[0]
  if (!item) return null

  if (item.type === 'consumable') {
    return ConsumableService.addToStash(client, playerId, {
      name: item.name,
      description: item.description,
      rarity: item.rarity,
      price: item.price,
      effect: item.effect,
      effectData: item.effect_data,
    })
  }
  if (item.type === 'armor') {
    return EquipmentService.buyArmor(client, playerId, item, 0)
  }
  return null
}

// Generates a random candidate (OGL's 'candidate' seed target gives no
// archetype/name hint beyond an author-chosen seedId) and inserts it into
// the hire pool tagged with that key, so a later hire_recruit condition
// matching {seedId} can find it (see operaGraph's seed-key resolution).
async function insertSeededCandidate(client, playerId, seedKey) {
  const perksFlaws = loadPerksFlaws()
  const player = (
    await client.query('SELECT next_candidate_id FROM players WHERE id = $1', [playerId])
  ).rows[0]
  const candidate = generateCandidate(player.next_candidate_id, perksFlaws, rollInRange)

  const result = await client.query(
    `INSERT INTO candidates
      (id, player_id, name, job_title, archetype, hp, max_hp, attributes, perks, flaws, personality, seed_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      candidate.id,
      playerId,
      candidate.name,
      candidate.jobTitle,
      candidate.archetype,
      candidate.hp,
      candidate.maxHp,
      JSON.stringify(candidate.attributes),
      JSON.stringify(candidate.perks),
      JSON.stringify(candidate.flaws),
      candidate.personality,
      seedKey,
    ],
  )
  await client.query('UPDATE players SET next_candidate_id = next_candidate_id + 1 WHERE id = $1', [
    playerId,
  ])
  return result.rows[0]
}

module.exports = {
  fireRecruit,
  applyPerk,
  applyFlaw,
  adjustAttribute,
  giveItem,
  insertSeededCandidate,
}
