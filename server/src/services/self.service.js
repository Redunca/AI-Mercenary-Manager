const fs = require('fs')
const path = require('path')

const UPGRADES_PATH = path.join(__dirname, '../../data/upgrades.json')

let upgradesCache = null
function loadUpgrades() {
  if (!upgradesCache) upgradesCache = JSON.parse(fs.readFileSync(UPGRADES_PATH, 'utf8'))
  return upgradesCache
}

function findUpgrade(upgradeId) {
  return loadUpgrades().find((def) => def.id === Number(upgradeId))
}

function isTimeBased(def) {
  return def.baseValueMs !== undefined
}

function isDockingStationsUpgrade(def) {
  return def.appliesTo.startsWith('docking_stations')
}

async function loadDynamicMaxValues(client) {
  const shopCatalogCount = (await client.query('SELECT COUNT(*)::int AS count FROM shop_items'))
    .rows[0].count
  const consumableCatalogCount = (
    await client.query("SELECT COUNT(*)::int AS count FROM shop_items WHERE type = 'consumable'")
  ).rows[0].count
  return { shopCatalogCount, consumableCatalogCount }
}

// Current effective value for a given tier: baseValue + tier * increment for
// the plain counter upgrades, or baseValueMs - tier * decrementMs (floored)
// for the two refresh-speed upgrades.
function currentValueForTier(def, tier) {
  return isTimeBased(def)
    ? Math.max(def.floorMs, def.baseValueMs - tier * def.decrementMs)
    : def.baseValue + tier * def.increment
}

// Static maxValue, or the live count for the two catalog-sized upgrades
// (shopItems/inventorySpace), or floorMs for the two time-based ones.
function maxValueFor(def, dynamicMaxValues) {
  if (def.maxValueSource) return dynamicMaxValues[def.maxValueSource]
  return isTimeBased(def) ? def.floorMs : def.maxValue
}

function isMaxed(def, tier, currentValue, maxValue) {
  if (tier >= def.costs.length) return true
  return isTimeBased(def) ? currentValue <= def.floorMs : currentValue >= maxValue
}

async function getUpgradeCatalog(client, playerId) {
  const upgrades = loadUpgrades()
  const player = (await client.query('SELECT tokens FROM players WHERE id = $1', [playerId]))
    .rows[0]
  const tiersResult = await client.query(
    'SELECT upgrade_id, tier FROM player_upgrades WHERE player_id = $1',
    [playerId],
  )
  const tierById = Object.fromEntries(tiersResult.rows.map((row) => [row.upgrade_id, row.tier]))
  const dynamicMaxValues = await loadDynamicMaxValues(client)

  const catalog = upgrades.map((def) => {
    const tier = tierById[def.id] ?? 0
    const currentValue = currentValueForTier(def, tier)
    const maxValue = maxValueFor(def, dynamicMaxValues)
    const maxed = isMaxed(def, tier, currentValue, maxValue)
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      tier,
      currentValue,
      maxValue,
      maxed,
      nextCost: maxed ? null : def.costs[tier],
    }
  })

  return { upgrades: catalog, tokens: player.tokens }
}

// Applies the effect of buying into `newTier` (i.e. current tier + 1). Driven
// entirely by def.appliesTo rather than a per-id switch: "players.<column>"
// updates that column to the new effective value; the one exception
// (dockedShips) inserts another docking_stations row instead of updating a
// single column, since its effective cap is SUM(docking_stations.capacity),
// read directly by shop.service.js#buyShip.
async function applyUpgradeEffect(client, playerId, def, newTier) {
  if (isDockingStationsUpgrade(def)) {
    await client.query('INSERT INTO docking_stations (player_id, capacity) VALUES ($1, 1)', [
      playerId,
    ])
    return
  }

  const column = def.appliesTo.split('.')[1]
  await client.query(`UPDATE players SET ${column} = $1 WHERE id = $2`, [
    currentValueForTier(def, newTier),
    playerId,
  ])
}

async function buyUpgrade(client, playerId, upgradeId) {
  const def = findUpgrade(upgradeId)
  if (!def) return { error: 'Upgrade not found' }

  const player = (
    await client.query('SELECT tokens FROM players WHERE id = $1 FOR UPDATE', [playerId])
  ).rows[0]
  if (!player) return { error: 'Player not found' }

  const tierRow = (
    await client.query(
      'SELECT tier FROM player_upgrades WHERE player_id = $1 AND upgrade_id = $2',
      [playerId, def.id],
    )
  ).rows[0]
  const tier = tierRow?.tier ?? 0

  const dynamicMaxValues = await loadDynamicMaxValues(client)
  const currentValue = currentValueForTier(def, tier)
  const maxValue = maxValueFor(def, dynamicMaxValues)
  if (isMaxed(def, tier, currentValue, maxValue)) return { error: 'Upgrade already maxed' }

  const cost = def.costs[tier]
  if (player.tokens < cost) return { error: 'Insufficient tokens' }

  await client.query('UPDATE players SET tokens = tokens - $1 WHERE id = $2', [cost, playerId])
  await applyUpgradeEffect(client, playerId, def, tier + 1)
  await client.query(
    `INSERT INTO player_upgrades (player_id, upgrade_id, tier) VALUES ($1, $2, 1)
     ON CONFLICT (player_id, upgrade_id) DO UPDATE SET tier = player_upgrades.tier + 1`,
    [playerId, def.id],
  )

  const catalog = await getUpgradeCatalog(client, playerId)
  return {
    success: true,
    upgrade: catalog.upgrades.find((u) => u.id === def.id),
    tokens: catalog.tokens,
  }
}

module.exports = {
  getUpgradeCatalog,
  buyUpgrade,
}
