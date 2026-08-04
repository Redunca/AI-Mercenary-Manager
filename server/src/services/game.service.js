const fs = require('fs')
const path = require('path')
const { pool } = require('../db/pool')
const { rollAction, rollDie, rollInRange } = require('./dice.service')
const {
  generateCandidate,
  rowToCandidate,
  rowToRecruit,
  computeMaxHp,
} = require('../domain/recruit')
const { buildEnemy, runAutoBattle } = require('../domain/combat')
const {
  travelSegmentMs,
  eventsSegmentMs,
  dueEventCount,
  phaseAndProgressFromElapsed,
  missionOutcome,
  missionPreCommitmentSummary,
} = require('../domain/mission')
const {
  insertLogEntries,
  buildPhaseLogs,
  buildEventResultLogs,
  buildBanterLog,
  buildCombatStartLog,
  buildCombatRoundLog,
  buildCombatEventLogs,
  getRecentMissionMessages,
  allCrewPairs,
  hasTraitFriction,
  buildRelationshipShiftLog,
  buildRelationshipRerollLog,
  buildDeathReactionLog,
  buildFactionShiftLog,
} = require('./log.service')
const { validateCrewAssignment } = require('../domain/ship')
const { computeMissionDelta } = require('../domain/relationship')
const { computeMissionRepDelta, rewardMultiplier } = require('../domain/faction')
const ShipService = require('./ship.service')
const ConsumableService = require('./consumable.service')
const EquipmentService = require('./equipment.service')
const OperaService = require('./opera.service')
const ShopService = require('./shop.service')
const RecruitService = require('./recruit.service')
const HospitalService = require('./hospital.service')
const RelationshipService = require('./relationship.service')
const FactionService = require('./faction.service')

const { loadData } = require('../dataLoader')
const { generateMission } = require('../engine/missionGenerator')
const { isRefreshDue, currentIntervalBoundary } = require('../utils/refreshWindow')
const { calculateTokenReward } = require('../utils/tokenReward')

// A floor of 5 mission templates is generated per batch (more if
// player.max_available_missions is higher — see generateMissionBatch),
// replaced on a per-player wall-clock interval (player.mission_refresh_interval_ms,
// 15 minutes by default — see refreshWindow.js and V015). Only *unstarted*
// templates from the previous batch are discarded on refresh; anything
// started (in progress, succeeded, or failed) persists forever regardless
// of batching.
const MISSION_BATCH_SIZE = 5

// The candidate pool is replaced wholesale (not topped up per-hire) on the
// same kind of per-player wall-clock interval as missions, via
// player.candidate_refresh_interval_ms (5 minutes by default — see
// refreshWindow.js and V021). Unlike mission templates, candidate ids are
// safe to reset back to 1 on every refresh: a hired candidate becomes a
// recruit and is never referenced by candidate id again afterward, so there's
// nothing that needs ids to persist across a refresh the way started mission
// templates do.
const CANDIDATE_BATCH_SIZE = 5

const DEFAULT_PLAYER_ID = 1
const DATA_DIR = path.join(__dirname, '../../data')

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'))
}

// --- Log-building input helpers (see log.service.js's LogContext typedef) ---

function toLogRecruit(recruit) {
  if (!recruit) return null
  return {
    id: recruit.id,
    name: recruit.name,
    perks: recruit.perks,
    flaws: recruit.flaws,
    personality: recruit.personality,
  }
}

function toLogPlanet(planet) {
  if (!planet) return null
  return { id: planet.id, name: planet.name, tags: planet.tags }
}

function buildLogContext({ template, crewMembers = [], actingRecruit = null }) {
  return {
    missionId: template.id,
    missionName: template.name,
    missionDifficulty: template.difficulty,
    planet: toLogPlanet(template.planet),
    actingRecruit: toLogRecruit(actingRecruit),
    crew: crewMembers.map(toLogRecruit).filter(Boolean),
  }
}

// Discards every mission_template that was never started (no mission_instance
// exists for it) and replaces them with a freshly generated batch, using the
// player's monotonically increasing next_template_id counter (templates
// persist forever once started, so ids can't be reset/reused the way
// generateCandidateBatch resets next_candidate_id).
//
// Batch size is max(MISSION_BATCH_SIZE, player.max_available_missions): the
// "missionList" self-upgrade grows how many missions are visible at once
// (players.max_available_missions), so the batch must be at least that big
// or a maxed-out board would just show fewer available missions per cycle.
async function generateMissionBatch(client, player, now) {
  const startedTemplateIds = new Set(
    (
      await client.query(
        'SELECT DISTINCT template_id FROM mission_instances WHERE player_id = $1',
        [player.id],
      )
    ).rows.map((row) => row.template_id),
  )
  // Opera-injected missions (opera_instance_id set -- see OperaService's
  // insertOperaMission) are never swept here regardless of started status:
  // a 'mission' node's task must survive batch refreshes until the paused
  // opera walk actually resolves it, the same way a regular unstarted
  // template survives only until the next refresh.
  const existingTemplateIds = (
    await client.query('SELECT id FROM mission_templates WHERE opera_instance_id IS NULL')
  ).rows.map((row) => row.id)
  const unstartedTemplateIds = existingTemplateIds.filter((id) => !startedTemplateIds.has(id))
  if (unstartedTemplateIds.length > 0) {
    await client.query('DELETE FROM mission_templates WHERE id = ANY($1::int[])', [
      unstartedTemplateIds,
    ])
  }

  const data = loadData()
  let nextId = player.next_template_id
  const batchSize = Math.max(MISSION_BATCH_SIZE, player.max_available_missions)
  for (let i = 0; i < batchSize; i++) {
    const mission = generateMission(data, {})
    await client.query(
      `INSERT INTO mission_templates (id, name, description, difficulty, events, planet, for_faction, against_faction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        nextId,
        mission.name,
        mission.description,
        mission.difficulty,
        JSON.stringify(mission.events),
        JSON.stringify(mission.planet),
        mission.forFaction,
        mission.againstFaction,
      ],
    )
    nextId++
  }

  // The refresh clock is still floored to the *fixed* wall-clock grid
  // implied by the interval, not to whatever moment this refresh actually
  // ran at. Once mission_refresh_interval_ms is shortened below 15 minutes
  // by the "missionRefreshSpeed" upgrade, those boundaries stop landing on
  // tidy :00/:15/:30/:45 marks for that player — e.g. a 10-minute interval
  // floors to :00/:10/:20/:30/:40/:50. That's an accepted tradeoff: reusing
  // currentIntervalBoundary keeps refresh timing deterministic and testable
  // without per-player special-casing, at the cost of "clean" clock times
  // once a player has upgraded their refresh speed.
  const refreshedAt = new Date(currentIntervalBoundary(now, player.mission_refresh_interval_ms))
  await client.query(
    'UPDATE players SET next_template_id = $1, mission_refresh_at = $2 WHERE id = $3',
    [nextId, refreshedAt, player.id],
  )
  player.next_template_id = nextId
  player.mission_refresh_at = refreshedAt
}

// Computed lazily, at state read/sync time: no background scheduler. If the
// wall-clock boundary (at the player's current mission_refresh_interval_ms)
// has moved on since the last recorded refresh (or nothing has ever been
// generated yet), generate a new batch.
async function ensureMissionBatch(client, player, now = new Date()) {
  if (isRefreshDue(player.mission_refresh_at, now, player.mission_refresh_interval_ms)) {
    await generateMissionBatch(client, player, now)
  }
}

async function ensurePlayer(client) {
  const existing = await client.query('SELECT * FROM players WHERE id = $1', [DEFAULT_PLAYER_ID])
  if (existing.rows.length > 0) return existing.rows[0]

  const inserted = await client.query(
    `INSERT INTO players (id, display_name) VALUES ($1, $2) RETURNING *`,
    [DEFAULT_PLAYER_ID, 'Commander'],
  )
  return inserted.rows[0]
}

async function generateCandidatesForPlayer(client, player, count = 5) {
  const perksFlaws = loadJson('perks-flaws.json')
  let nextId = player.next_candidate_id

  for (let i = 0; i < count; i++) {
    const candidate = generateCandidate(nextId, perksFlaws, rollInRange)
    await client.query(
      `INSERT INTO candidates
        (id, player_id, name, job_title, archetype, hp, max_hp, attributes, perks, flaws, personality)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        candidate.id,
        player.id,
        candidate.name,
        candidate.jobTitle,
        candidate.archetype,
        candidate.hp,
        candidate.maxHp,
        JSON.stringify(candidate.attributes),
        JSON.stringify(candidate.perks),
        JSON.stringify(candidate.flaws),
        candidate.personality,
      ],
    )
    nextId++
  }

  await client.query('UPDATE players SET next_candidate_id = $1 WHERE id = $2', [nextId, player.id])
}

// Discards every existing *random* candidate and draws a fresh batch,
// mirroring generateMissionBatch()'s shape (delete the stale pool,
// regenerate, stamp the wall-clock refresh boundary) but with no "started"
// concept to preserve. Candidates seeded by an opera (seed_key IS NOT NULL,
// see insertSeededCandidate) are exempt from the wipe -- an opera can
// require hiring one specific candidate, and they'd have no way to recover
// that candidate if a routine rotation deleted it out from under them
// (mirrors shop.service.js's is_quest_item exclusion from drawShopRotation).
// Since seeded rows can survive across batches, next_candidate_id is never
// reset back to 1 here (unlike mission templates) -- that would risk a
// fresh row's id colliding with a retained seeded candidate's id.
async function generateCandidateBatch(client, player, now) {
  await client.query('DELETE FROM candidates WHERE player_id = $1 AND seed_key IS NULL', [
    player.id,
  ])
  await generateCandidatesForPlayer(client, player, CANDIDATE_BATCH_SIZE)

  const refreshedAt = new Date(currentIntervalBoundary(now, player.candidate_refresh_interval_ms))
  await client.query('UPDATE players SET candidate_refresh_at = $1 WHERE id = $2', [
    refreshedAt,
    player.id,
  ])
  player.candidate_refresh_at = refreshedAt
}

// Computed lazily, at state read/sync time: no background scheduler,
// mirroring ensureMissionBatch().
async function ensureCandidateBatch(client, player, now = new Date()) {
  if (isRefreshDue(player.candidate_refresh_at, now, player.candidate_refresh_interval_ms)) {
    await generateCandidateBatch(client, player, now)
  }
}

async function bootstrapPlayer(client) {
  const player = await ensurePlayer(client)
  await ensureMissionBatch(client, player)

  // Ensure hangar exists
  const hangar = await ShipService.getHangar(client, player.id)
  if (!hangar) {
    await ShipService.createHangar(client, player.id)
    await ShipService.createDockingStation(client, player.id, 5)
  }

  await ensureCandidateBatch(client, player)

  const recruitCount = await client.query(
    'SELECT COUNT(*)::int AS count FROM recruits WHERE player_id = $1 AND deleted_at IS NULL',
    [player.id],
  )
  if (recruitCount.rows[0].count === 0) {
    const firstCandidate = await client.query(
      'SELECT id FROM candidates WHERE player_id = $1 ORDER BY id LIMIT 1',
      [player.id],
    )
    if (firstCandidate.rows.length > 0) {
      await hireCandidate(client, player.id, String(firstCandidate.rows[0].id))
    }
  }

  await OperaService.ensureOperasForPlayer(client, player.id)

  return player
}

async function getRecruit(client, playerId, recruitId) {
  const result = await client.query(
    'SELECT * FROM recruits WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL',
    [playerId, recruitId],
  )
  return result.rows[0] ? rowToRecruit(result.rows[0]) : null
}

// Fetches `shipId`'s ship and crew together, joining crew names for a
// log/response (falling back to `emptyLabel` when the ship has no crew).
// Missing/deleted individual recruits are silently dropped from the joined
// list rather than replaced with a placeholder -- contrast completeMission's
// own per-member "Recruit <id>" fallback, which isn't a fit for this shared
// shape. Only for call sites that don't already have `ship` in scope --
// startMission fetches it earlier for validation and builds crew names
// itself rather than re-fetching here.
async function loadCrewContext(client, playerId, shipId, emptyLabel = 'No crew') {
  const ship = await ShipService.getShip(client, playerId, shipId)
  const crewMembers = await Promise.all(
    (ship?.crew ?? []).map((id) => getRecruit(client, playerId, id)),
  )
  const crewNames =
    ship?.crew?.length > 0
      ? crewMembers
          .map((r) => r?.name)
          .filter(Boolean)
          .join(', ')
      : emptyLabel
  return { ship, crewMembers, crewNames }
}

// Emits a phase-transition mission log plus its trailing crew banter (if
// any triggers) -- the sequence repeated at every EN_ROUTE/RETURN
// transition. `global` opts into also inserting the phase log's
// global-feed entries: only startMission's EN_ROUTE kickoff does that --
// RETURN transitions are mission-log-only.
async function emitPhaseTransition(
  client,
  playerId,
  logContext,
  { phase, failed, rewardForfeited, recruitName, global = false },
) {
  const phaseLogs = buildPhaseLogs({
    phase,
    failed,
    rewardForfeited,
    recruitName,
    context: logContext,
    avoid: await getRecentMissionMessages(client, playerId, logContext.missionId),
  })
  await insertLogEntries(
    client,
    playerId,
    global ? [...phaseLogs.mission, ...phaseLogs.global] : phaseLogs.mission,
  )

  const banterLogs = await buildBanterLog(client, playerId, logContext)
  if (banterLogs) await insertLogEntries(client, playerId, banterLogs.mission)
}

// `shipId` lets a fatal hit be intercepted by a HEAL consumable sitting in
// that ship's inventory: the recruit is revived to full HP instead of dying,
// and the item is spent. Without a matching item, death is permanent.
async function damageRecruit(client, playerId, recruitId, amount, shipId) {
  const row = await client.query(
    'SELECT * FROM recruits WHERE player_id = $1 AND id = $2 FOR UPDATE',
    [playerId, recruitId],
  )
  if (row.rows.length === 0 || row.rows[0].status === 'dead') return null

  let hp = Math.max(0, row.rows[0].hp - amount)
  let status = row.rows[0].status
  let revived = false

  if (hp === 0) {
    const healed = shipId
      ? await ConsumableService.consumeFromShipInventory(client, shipId, 'HEAL')
      : null
    if (healed) {
      hp = row.rows[0].max_hp
      revived = true
    } else {
      status = 'dead'
    }
  }

  await client.query('UPDATE recruits SET hp = $1, status = $2 WHERE player_id = $3 AND id = $4', [
    hp,
    status,
    playerId,
    recruitId,
  ])
  if (status === 'dead') {
    await EquipmentService.destroyEquipmentForRecruit(client, playerId, recruitId)
  }
  const updated = await getRecruit(client, playerId, recruitId)
  return updated ? { ...updated, revived } : updated
}

// Persists a crew member's post-battle hp/max_hp (and, when they died from
// accumulated injuries, their permanent 'dead' status). Combat never touches
// a recruit's mission status column otherwise (e.g. 'in_mission' stays put).
async function applyCombatResult(client, playerId, recruitId, { hp, maxHp, dead }) {
  const row = await client.query('SELECT * FROM recruits WHERE player_id = $1 AND id = $2', [
    playerId,
    recruitId,
  ])
  if (row.rows.length === 0) return null
  const status = dead ? 'dead' : row.rows[0].status

  await client.query(
    'UPDATE recruits SET hp = $1, max_hp = $2, status = $3 WHERE player_id = $4 AND id = $5',
    [hp, maxHp, status, playerId, recruitId],
  )
  if (dead) {
    await EquipmentService.destroyEquipmentForRecruit(client, playerId, recruitId)
  }
  return getRecruit(client, playerId, recruitId)
}

async function setRecruitStatus(client, playerId, recruitId, status) {
  await client.query(
    `UPDATE recruits SET status = $1
     WHERE player_id = $2 AND id = $3 AND status != 'dead'`,
    [status, playerId, recruitId],
  )
}

// Ends resolveEvents() early for a "stopped partway" outcome (crew-wipe
// from HP_LOSS, FORCED_DEPARTURE, or a SHIP_DAMAGE break with no REPAIR on
// hand): stamps the event's final index/result, emits its logs, and returns
// the shape resolveEvents()/advanceMission() expect. shipDestroyed is
// always false here -- nothing in this resolution path destroys the ship
// outright.
async function finalizeTerminalEvent(
  client,
  playerId,
  {
    template,
    crewMembers,
    actingRecruit,
    result,
    eventIndex,
    eventResults,
    failed,
    rewardForfeited,
    forceReturn,
    completed,
  },
) {
  const currentEventIndex = eventIndex + 1
  eventResults.push(result)
  const eventLogs = buildEventResultLogs({
    eventResult: result,
    context: buildLogContext({ template, crewMembers, actingRecruit }),
  })
  await insertLogEntries(client, playerId, [...eventLogs.mission, ...eventLogs.global])
  return {
    failed,
    rewardForfeited,
    currentEventIndex,
    eventResults,
    forceReturn,
    completed,
    shipDestroyed: false,
  }
}

function pickBestRecruit(activeCrew, attribute) {
  return activeCrew.reduce((best, current) => {
    const currentStat = current.attributes[attribute] || 0
    const bestStat = best.attributes[attribute] || 0
    return currentStat > bestStat ? current : best
  })
}

// The player's manually assigned recruit wins if they're still active
// (alive and part of the crew); otherwise falls back to the highest-stat
// auto-pick, same as if nothing had been assigned at all.
function pickAssignedOrBest(activeCrew, event, assignedRecruitId) {
  if (assignedRecruitId != null) {
    const assigned = activeCrew.find((r) => String(r.id) === String(assignedRecruitId))
    if (assigned) return assigned
  }
  return pickBestRecruit(activeCrew, event.attribute)
}

// Sums curated perk/flaw modifiers (server/data/perk-effects.json) whose
// attribute matches the event being rolled. Passive and always-on -- no
// per-mission usage tracking, unlike the BONDED/RIVAL reroll below. Names
// not in perkEffects (custom opera-granted names, or any of the game's
// other uncurated perks/flaws) contribute 0.
function getPerkAttributeModifier(recruit, attribute, perkEffects) {
  const traits = [...(recruit.perks ?? []), ...(recruit.flaws ?? [])]
  return traits.reduce((total, trait) => {
    const effect = perkEffects[trait.name]
    return effect && effect.attribute === attribute ? total + effect.amount : total
  }, 0)
}

async function resolveEvents(client, playerId, instance, template, crewMembers, targetEventIndex) {
  const events = template.events
  const eventResults = [...instance.event_results]
  let failed = instance.failed
  let rewardForfeited = instance.reward_forfeited
  let currentEventIndex = instance.current_event_index
  const missionId = template.id
  const shipId = instance.ship_id
  let crewDead = []
  const { perkEffects } = loadData()
  // Fetched once per call (not per-event) for the friend/rival reroll check
  // below -- see resolveEvents' skill-check branch.
  const relationships = await RelationshipService.getCrewRelationships(
    client,
    playerId,
    crewMembers.map((r) => r.id),
  )

  // The player's manual pick (if any) only ever applies to the very first
  // event this call processes -- captured before the loop below mutates
  // currentEventIndex. Cleared immediately (one-shot read) since
  // resolveEvents is only ever called when targetEventIndex >
  // currentEventIndex, so that first iteration is guaranteed to run.
  const initialEventIndex = currentEventIndex
  const assignedRecruitId = instance.assigned_recruit_id
  if (assignedRecruitId != null) {
    await client.query('UPDATE mission_instances SET assigned_recruit_id = NULL WHERE id = $1', [
      instance.id,
    ])
  }

  // Only resolves events due by targetEventIndex, not every remaining one --
  // see advanceMission's dueEventCount() call for why. Every early-exit path
  // below (failure/crew-wipe/forced-return) and the final fallthrough return
  // already correctly represent "stopped partway, not a failure" either way.
  for (let i = currentEventIndex; i < targetEventIndex; i++) {
    if (failed || crewMembers.filter((r) => r.status !== 'dead').length === 0) break

    const event = events[i]

    // Find crew member with highest stat for this event
    const activeCrew = crewMembers.filter((r) => r.status !== 'dead')
    if (activeCrew.length === 0) {
      failed = true
      break
    }

    // COMBAT events always resolve as a full auto-battle (whole active crew
    // vs. one enemy scaled to the mission's difficulty) — there is no skill
    // roll to gate it, and no random failureConsequence pick.
    if (event.type === 'COMBAT') {
      const enemy = buildEnemy(template.difficulty, rollInRange)
      const combatStartLog = buildCombatStartLog({ missionId })
      await insertLogEntries(client, playerId, combatStartLog.mission)
      const healCharges = await ConsumableService.countShipInventoryEffect(client, shipId, 'HEAL')
      const armorByRecruit = await EquipmentService.getEquippedByRecruitIds(
        client,
        playerId,
        activeCrew.map((r) => r.id),
      )
      const armedCrew = activeCrew.map((r) => ({
        ...r,
        equippedArmor: armorByRecruit.get(String(r.id)) || null,
      }))
      const combatResult = runAutoBattle({ crew: armedCrew, enemy, rollAction, healCharges })

      for (const round of combatResult.rounds) {
        await insertLogEntries(client, playerId, [buildCombatRoundLog({ round, missionId })])
      }

      for (let h = 0; h < combatResult.healsUsed; h++) {
        await ConsumableService.consumeFromShipInventory(client, shipId, 'HEAL')
      }

      // Collected, not inserted immediately -- fired after combatLogs below
      // so a survivor's reaction reads after the "DEFEAT/VICTORY" summary,
      // not interleaved before it.
      const deathReactionLogs = []
      for (const outcome of combatResult.crewResults) {
        const updated = await applyCombatResult(client, playerId, outcome.id, {
          hp: outcome.hp,
          maxHp: outcome.maxHp,
          dead: outcome.status === 'dead',
        })
        // Keep this resolveEvents() call's in-memory crew state in sync, so
        // later events in the same pass see accurate hp/maxHp/status.
        const local = crewMembers.find((r) => String(r.id) === String(outcome.id))
        if (local && updated) {
          local.hp = updated.hp
          local.maxHp = updated.maxHp
          local.status = updated.status
        }

        // Every crewResults entry started this combat alive (it's built from
        // armedCrew, itself filtered to activeCrew), so a 'dead' status here
        // is always a fresh death this fight -- fire the crew's reaction if
        // anyone survived to witness it.
        if (outcome.status === 'dead' && local) {
          const survivors = combatResult.crewResults
            .filter((c) => c.status !== 'dead')
            .map((c) => crewMembers.find((r) => String(r.id) === String(c.id)))
            .filter(Boolean)
          const reactionLog = buildDeathReactionLog({
            deceased: local,
            survivors,
            relationships,
            missionId,
          })
          if (reactionLog) deathReactionLogs.push(...reactionLog.mission)
        }
      }

      // A recruit who survives a downing has their max HP permanently reduced
      // (see combat.js's "downed" branch) -- track that separately from deaths
      // so completeMission() can call out lasting injuries in its summary.
      const recruitsDowned = combatResult.crewResults
        .filter((c) => c.status !== 'dead')
        .filter((c) => {
          const before = armedCrew.find((r) => String(r.id) === String(c.id))
          return before && c.maxHp < before.maxHp
        })
        .map((c) => c.id)

      const result = {
        eventIndex: i,
        type: event.type,
        combat: true,
        rounds: combatResult.rounds.length,
        enemyDefeated: combatResult.enemyDefeated,
        success: combatResult.enemyDefeated,
        recruitsDied: combatResult.crewResults.filter((c) => c.status === 'dead').map((c) => c.id),
        recruitsDowned,
      }
      if (combatResult.enemyDefeated) {
        result.rewardEarned = event.reward
      } else {
        result.consequence = 'FORCED_DEPARTURE'
        rewardForfeited = true
      }

      const combatLogs = buildCombatEventLogs({
        context: buildLogContext({ template, crewMembers }),
        event,
        combatResult,
      })
      await insertLogEntries(client, playerId, [...combatLogs.mission, ...combatLogs.global])
      if (deathReactionLogs.length > 0) await insertLogEntries(client, playerId, deathReactionLogs)

      currentEventIndex = i + 1
      eventResults.push(result)

      if (!combatResult.enemyDefeated) {
        failed = true
        return {
          failed,
          rewardForfeited,
          currentEventIndex,
          eventResults,
          forceReturn: true,
          completed: false,
          shipDestroyed: false,
        }
      }

      continue
    }

    const bestRecruit = pickAssignedOrBest(
      activeCrew,
      event,
      i === initialEventIndex ? assignedRecruitId : null,
    )

    // An ATTRIBUTE_BOOST consumable sitting in the ship's own inventory grants
    // Advantage on the one roll it matches, then is spent regardless of outcome.
    const boost = await ConsumableService.consumeFromShipInventory(
      client,
      shipId,
      'ATTRIBUTE_BOOST',
      (data) => data?.attribute === event.attribute,
    )
    const boostAdvantage = boost ? (boost.effect_data?.advantage ?? 1) : 0
    // A perk grants Advantage, a flaw imposes symmetric Disadvantage, on any
    // roll matching its curated attribute -- summed with the boost above,
    // always-on, no per-mission usage tracking (see getPerkAttributeModifier).
    const perkModifier = getPerkAttributeModifier(bestRecruit, event.attribute, perkEffects)
    const advantage = boostAdvantage + perkModifier

    const roll = rollAction(bestRecruit.attributes[event.attribute], advantage)
    let success = roll.total >= event.dc

    // A BONDED friend, once per mission, rerolls a failed test in the acting
    // recruit's favor; a RIVAL forces a reroll of a successful one, once per
    // mission too. "Once per mission" persists with no schema change --
    // eventResults is the full accumulated history across every
    // resolveEvents() call for this mission instance (advanceMission only
    // passes newly-due events each time), so scanning it for a prior marker
    // is enough -- mirrors getLastBanterPairNames' banter-cooldown
    // derivation from what's already persisted.
    let relationshipReroll = null
    // Set below when a death occurs, but inserted only after the main
    // event-result log (built at the bottom of this loop) so a survivor's
    // reaction reads after the "KILLED IN ACTION" line, not before it.
    let deathReactionLog = null
    const rerollTier = success ? 'RIVAL' : 'BONDED'
    const rerollKind = success ? 'rival' : 'friend'
    const rerollAlreadyUsed = eventResults.some((r) => r.relationshipReroll === rerollKind)
    if (!rerollAlreadyUsed) {
      const partner = activeCrew.find(
        (r) =>
          r.id !== bestRecruit.id &&
          RelationshipService.lookupCrewRelationship(relationships, bestRecruit.id, r.id).tier ===
            rerollTier,
      )
      if (partner) {
        relationshipReroll = { tier: rerollKind, partner }
        const reroll = rollAction(bestRecruit.attributes[event.attribute], advantage)
        roll.d20 = reroll.d20
        roll.bonus = reroll.bonus
        roll.diceNotation = reroll.diceNotation
        roll.total = reroll.total
        success = reroll.total >= event.dc
        const rerollLog = buildRelationshipRerollLog({
          actingRecruit: bestRecruit,
          partnerRecruit: partner,
          tier: rerollKind,
          missionId,
        })
        await insertLogEntries(client, playerId, rerollLog.mission)
      }
    }

    const result = {
      eventIndex: i,
      type: event.type,
      attribute: event.attribute,
      recruitId: bestRecruit.id,
      recruitName: bestRecruit.name,
      d20: roll.d20,
      bonus: roll.bonus,
      diceNotation: roll.diceNotation,
      total: roll.total,
      dc: event.dc,
      success,
    }
    if (advantage !== 0) result.advantageUsed = advantage
    if (relationshipReroll) result.relationshipReroll = relationshipReroll.tier

    if (success) {
      result.rewardEarned = event.reward
    } else {
      result.consequence = event.failureConsequence

      if (event.failureConsequence === 'HP_LOSS') {
        const hpLost = rollDie(6)
        result.hpLost = hpLost
        const updated = await damageRecruit(client, playerId, bestRecruit.id, hpLost, shipId)
        if (updated?.revived) {
          result.recruitRevived = true
        } else if (!updated || updated.status === 'dead') {
          result.recruitDied = true
          crewDead.push(bestRecruit.id)
          const survivors = activeCrew.filter((r) => r.id !== bestRecruit.id)
          deathReactionLog = buildDeathReactionLog({
            deceased: bestRecruit,
            survivors,
            relationships,
            missionId,
          })
          if (crewMembers.filter((r) => r.status !== 'dead').length === 1) {
            return finalizeTerminalEvent(client, playerId, {
              template,
              crewMembers,
              actingRecruit: bestRecruit,
              result,
              eventIndex: i,
              eventResults,
              failed: true,
              rewardForfeited,
              forceReturn: false,
              completed: true,
            })
          }
        }
      } else if (event.failureConsequence === 'FORCED_DEPARTURE') {
        return finalizeTerminalEvent(client, playerId, {
          template,
          crewMembers,
          actingRecruit: bestRecruit,
          result,
          eventIndex: i,
          eventResults,
          failed: true,
          rewardForfeited,
          forceReturn: true,
          completed: false,
        })
      } else if (event.failureConsequence === 'SHIP_DAMAGE') {
        rewardForfeited = true
        result.shipDamaged = true
        const damaged = await ShipService.damageShip(client, playerId, shipId, rollDie(6))
        if (damaged?.status === 'broken') {
          const repaired = await ConsumableService.consumeFromShipInventory(
            client,
            shipId,
            'REPAIR',
          )
          if (repaired) {
            await ShipService.repairShip(client, playerId, shipId)
            result.shipAutoRepaired = true
          } else {
            result.shipBroken = true
            return finalizeTerminalEvent(client, playerId, {
              template,
              crewMembers,
              actingRecruit: bestRecruit,
              result,
              eventIndex: i,
              eventResults,
              failed,
              rewardForfeited,
              forceReturn: true,
              completed: false,
            })
          }
        }
      } else {
        rewardForfeited = true
      }
    }

    currentEventIndex = i + 1
    eventResults.push(result)
    const eventLogs = buildEventResultLogs({
      eventResult: result,
      context: buildLogContext({ template, crewMembers, actingRecruit: bestRecruit }),
    })
    await insertLogEntries(client, playerId, [...eventLogs.mission, ...eventLogs.global])
    if (deathReactionLog) await insertLogEntries(client, playerId, deathReactionLog.mission)
  }

  return {
    failed,
    rewardForfeited,
    currentEventIndex,
    eventResults,
    forceReturn: false,
    completed: false,
    shipDestroyed: false,
  }
}

async function completeMission(client, playerId, instance, template, failed, shipDestroyed) {
  const status = failed ? 'failed' : 'success'

  // A mission's declared quest item (if any) is spent here regardless of
  // outcome -- "used up on the attempt," not "only if you won," so a player
  // can't dodge consumption by deliberately failing. No-ops if the player
  // never actually loaded it.
  if (template.consumes_item_name) {
    await ConsumableService.consumeNamedFromShipInventory(
      client,
      instance.ship_id,
      template.consumes_item_name,
    )
  }

  if (shipDestroyed) {
    // Return crew via shuttle
    const ship = await ShipService.getShip(client, playerId, instance.ship_id)
    if (ship && ship.crew) {
      for (const recruitId of ship.crew) {
        await setRecruitStatus(client, playerId, recruitId, 'returning')
      }
    }
    await ShipService.destroyShip(client, playerId, instance.ship_id)
  } else {
    // Ship survived (mission succeeded or failed without destruction): crew and ship return to base
    const ship = await ShipService.getShip(client, playerId, instance.ship_id)
    if (ship && ship.crew) {
      for (const recruitId of ship.crew) {
        await setRecruitStatus(client, playerId, recruitId, 'available')
      }
    }
    await ShipService.updateShipStatus(client, playerId, instance.ship_id, 'docked')
  }

  // Credits and tokens are two independent reward tracks paid out from the
  // same completion event, so they're read and written together in one
  // locked round trip rather than two: credits are gated on
  // !instance.reward_forfeited (an event mid-mission can zero them out even
  // on an otherwise-successful run), while tokens are gated only on
  // !failed — reward_forfeited is deliberately NOT checked for tokens,
  // since the success-ratio formula below already prices in a bad event.
  if (!failed) {
    const totalEvents = template.events.length
    const tokenBase = loadJson('difficulty-tables.json')[template.difficulty]?.tokenBase ?? 0
    const tokensWon = calculateTokenReward(tokenBase, instance.event_results, totalEvents)

    let creditsWon = instance.reward_forfeited
      ? 0
      : instance.event_results
          .filter((r) => r.rewardEarned?.type === 'CREDITS')
          .reduce((sum, r) => sum + r.rewardEarned.amount, 0)

    // A mission done "for" an org pays better or worse depending on
    // standing with them -- see domain/faction.js's REWARD_MULTIPLIER.
    // Tokens are a difficulty-based resource, not pay from the org, so
    // they're left unscaled.
    if (creditsWon > 0 && template.for_faction) {
      const { score } = await FactionService.getReputation(client, playerId, template.for_faction)
      creditsWon = Math.round(creditsWon * (1 + rewardMultiplier(score)))
    }

    if (creditsWon > 0 || tokensWon > 0) {
      const player = await client.query(
        'SELECT wallet, tokens FROM players WHERE id = $1 FOR UPDATE',
        [playerId],
      )
      await client.query('UPDATE players SET wallet = $1, tokens = $2 WHERE id = $3', [
        player.rows[0].wallet + creditsWon,
        player.rows[0].tokens + tokensWon,
        playerId,
      ])
    }
  }

  const shipData = await ShipService.getShip(client, playerId, instance.ship_id)
  const crewMembers = await Promise.all(
    (shipData?.crew ?? []).map((id) => getRecruit(client, playerId, id)),
  )
  const crewNames =
    shipData?.crew?.length > 0
      ? crewMembers.map((r) => r?.name || `Recruit ${r?.id}`).join(', ')
      : 'No crew'

  // A dead crew member's id otherwise lingers in ships.crew forever (nothing
  // else clears it -- setRecruitStatus's `status != 'dead'` guard just
  // silently skips them above), permanently occupying a docking-station crew
  // slot. Mirrors fireRecruit's (recruit.service.js) and admitRecruit's
  // (hospital.service.js) identical array_remove pattern. Done here, once the
  // mission is over, rather than at the moment of death, so the fallen
  // recruit is still "crew" for this mission's own relationship-drift pass
  // below.
  for (const dead of crewMembers.filter((r) => r?.status === 'dead')) {
    await client.query(
      `UPDATE ships SET crew = array_remove(crew, $2)
       WHERE player_id = $1 AND deleted_at IS NULL AND $2 = ANY(crew)`,
      [playerId, dead.id],
    )
  }

  // Distinct recruits who took a lasting (max-HP-reducing) injury at some point
  // this mission, across every combat event -- surfaced in the completion
  // summary so a rough mission doesn't read as a clean success/failure with no
  // human cost.
  const injuredCount = new Set(
    (instance.event_results ?? []).flatMap((r) => r.recruitsDowned ?? []),
  ).size

  // Whether anyone died this mission, regardless of whether the mission
  // itself ultimately succeeded (e.g. a won COMBAT event can still cost a
  // life) -- feeds missionOutcome's PARTIAL SUCCESS bucket alongside
  // reward_forfeited. recruitDied (HP_LOSS path) and recruitsDied (COMBAT
  // path) already exist on every event result; no new tracking needed.
  const anyDeath = (instance.event_results ?? []).some(
    (r) => r.recruitDied || (r.recruitsDied && r.recruitsDied.length > 0),
  )
  const outcome = missionOutcome({ failed, rewardForfeited: instance.reward_forfeited, anyDeath })

  const completedLogs = buildPhaseLogs({
    phase: 'COMPLETED',
    failed,
    rewardForfeited: instance.reward_forfeited,
    anyDeath,
    recruitName: crewNames,
    injuredCount,
    context: buildLogContext({ template, crewMembers }),
    avoid: await getRecentMissionMessages(client, playerId, template.id),
  })
  await insertLogEntries(client, playerId, [...completedLogs.mission, ...completedLogs.global])
  // A short, terminal-style capstone line as the very last thing in the
  // mission log -- mission-scoped only (the fuller sentence above already
  // covers the global feed), sharing missionOutcome's computation so the two
  // never disagree.
  await insertLogEntries(client, playerId, [
    { tag: '[SYS]', message: `[${outcome}]`, missionId: template.id },
  ])

  // Every crew pair that shared this mission drifts a little: toward each
  // other on success, apart on failure, nudged further by personality
  // compatibility and any trait-clash banter trigger between them (reusing
  // the same trigger data banter already uses -- see hasTraitFriction).
  // Fires once per completed mission per pair, not per event.
  for (const [a, b] of allCrewPairs(crewMembers.filter(Boolean))) {
    const delta = computeMissionDelta({
      success: !failed,
      personalityA: a.personality,
      personalityB: b.personality,
      traitFriction: hasTraitFriction(a, b),
    })
    const shift = await RelationshipService.adjustRelationship(client, playerId, a.id, b.id, delta)
    if (shift.previousTier !== shift.newTier) {
      const shiftLogs = buildRelationshipShiftLog({
        recruitA: a,
        recruitB: b,
        previousTier: shift.previousTier,
        newTier: shift.newTier,
        missionId: template.id,
      })
      await insertLogEntries(client, playerId, shiftLogs.mission)
    }
  }

  // The org this mission was done for/against (if any) drifts too --
  // "for" nudges either way with the outcome, "against" only ever costs
  // standing (see domain/faction.js's asymmetric deltas).
  for (const [factionName, role] of [
    [template.for_faction, 'for'],
    [template.against_faction, 'against'],
  ]) {
    if (!factionName) continue
    const delta = computeMissionRepDelta({ role, success: !failed })
    const shift = await FactionService.adjustReputation(client, playerId, factionName, delta)
    if (shift.previousTier !== shift.newTier) {
      const shiftLogs = buildFactionShiftLog({
        factionName,
        previousTier: shift.previousTier,
        newTier: shift.newTier,
        missionId: template.id,
      })
      await insertLogEntries(client, playerId, [...shiftLogs.mission, ...shiftLogs.global])
    }
  }

  // Fires on both success and failure -- a 'mission' opera node branches on
  // previous_outcome exactly like a 'check' node's roll, so it needs to
  // hear about a failed mission too, not just a successful one.
  await OperaService.recordOperaAction(client, playerId, 'complete_quest', {
    templateId: template.id,
    outcome: failed ? 'failure' : 'success',
  })
}

async function advanceMission(client, playerId, instance, template, now) {
  const events = template.events
  // Older instances predate the travel/events segment columns; fall back to
  // the same difficulty-driven formula at the default speed (no boost).
  const travelMs = instance.travel_segment_ms ?? travelSegmentMs(template.difficulty, 100)
  const eventsMs = instance.events_segment_ms ?? eventsSegmentMs(template.difficulty, events.length)
  let progress
  let phase
  let targetEventIndex

  if (instance.forced_return && instance.return_started_at) {
    const totalMs = travelMs * 2 + eventsMs
    const returnElapsed = now - new Date(instance.return_started_at).getTime()
    const returnDurationMs =
      (instance.progress_at_return ?? 0) <= 33
        ? ((instance.progress_at_return ?? 0) / 100) * totalMs
        : travelMs
    const returnTicks = Math.max(1, returnDurationMs)
    const delta = Math.min(
      100 - instance.progress_at_return,
      Math.round((returnElapsed / returnTicks) * (100 - instance.progress_at_return)),
    )
    progress = Math.min(100, instance.progress_at_return + delta)
    phase = progress >= 100 ? 'COMPLETED' : 'RETURN'
    targetEventIndex = events.length
  } else {
    const elapsed = now - new Date(instance.started_at).getTime()
    ;({ phase, progress } = phaseAndProgressFromElapsed(elapsed, travelMs, eventsMs))
    // How many events are actually "due" at this elapsed time -- the pacing
    // fix: resolveEvents() only ever processes up to this index per call,
    // instead of draining every remaining event the instant the mission
    // crosses into EVENT phase. See dueEventCount()'s own comment.
    targetEventIndex = dueEventCount(elapsed, travelMs, eventsMs, events.length)
  }

  let {
    failed,
    reward_forfeited: rewardForfeited,
    current_event_index: currentEventIndex,
    event_results: eventResults,
    phase: storedPhase,
  } = instance

  const pastEventPhase = targetEventIndex > currentEventIndex

  if (pastEventPhase) {
    const { crewMembers, crewNames } = await loadCrewContext(client, playerId, instance.ship_id)
    const logContext = buildLogContext({ template, crewMembers })

    if (storedPhase === 'EN_ROUTE') {
      const eventPhaseLogs = buildPhaseLogs({
        phase: 'EVENT',
        failed: false,
        rewardForfeited,
        recruitName: crewNames,
        context: logContext,
        avoid: await getRecentMissionMessages(client, playerId, template.id),
      })
      await insertLogEntries(client, playerId, eventPhaseLogs.mission)
    }

    const resolution = await resolveEvents(
      client,
      playerId,
      instance,
      template,
      crewMembers,
      targetEventIndex,
    )
    failed = resolution.failed
    rewardForfeited = resolution.rewardForfeited
    currentEventIndex = resolution.currentEventIndex
    eventResults = resolution.eventResults

    // "Post-event resolution" banter trigger — fires once per tick that processed event(s),
    // not once per individual event, to avoid noise.
    const postEventBanter = await buildBanterLog(client, playerId, logContext)
    if (postEventBanter) await insertLogEntries(client, playerId, postEventBanter.mission)

    if (resolution.forceReturn) {
      await client.query(
        `UPDATE mission_instances SET
          failed = $1, reward_forfeited = $2, current_event_index = $3, event_results = $4,
          forced_return = TRUE, return_started_at = NOW(), progress_at_return = $5, phase = 'RETURN', progress = $5
         WHERE id = $6`,
        [
          failed,
          rewardForfeited,
          currentEventIndex,
          JSON.stringify(eventResults),
          progress,
          instance.id,
        ],
      )
      await emitPhaseTransition(client, playerId, logContext, {
        phase: 'RETURN',
        failed: true,
        rewardForfeited,
        recruitName: 'Crew',
      })

      return
    }

    if (resolution.completed && failed) {
      await client.query(
        `UPDATE mission_instances SET
          failed = $1, reward_forfeited = $2, current_event_index = $3, event_results = $4,
          phase = 'COMPLETED', progress = 100, status = 'failed'
         WHERE id = $5`,
        [failed, rewardForfeited, currentEventIndex, JSON.stringify(eventResults), instance.id],
      )
      await completeMission(
        client,
        playerId,
        { ...instance, failed, reward_forfeited: rewardForfeited, event_results: eventResults },
        template,
        true,
        resolution.shipDestroyed,
      )
      return
    }
  }

  if (phase === 'RETURN' && storedPhase !== 'RETURN' && !instance.forced_return) {
    const { crewMembers, crewNames } = await loadCrewContext(client, playerId, instance.ship_id)
    const logContext = buildLogContext({ template, crewMembers })
    await emitPhaseTransition(client, playerId, logContext, {
      phase: 'RETURN',
      failed,
      rewardForfeited,
      recruitName: crewNames,
    })
  }

  if (phase === 'COMPLETED') {
    await client.query(
      `UPDATE mission_instances SET
        phase = 'COMPLETED', progress = 100, failed = $1, reward_forfeited = $2,
        current_event_index = $3, event_results = $4, status = $5
       WHERE id = $6`,
      [
        failed,
        rewardForfeited,
        currentEventIndex,
        JSON.stringify(eventResults),
        failed ? 'failed' : 'success',
        instance.id,
      ],
    )
    await completeMission(
      client,
      playerId,
      { ...instance, failed, reward_forfeited: rewardForfeited, event_results: eventResults },
      template,
      failed,
      false,
    )
    return
  }

  if (
    storedPhase !== phase ||
    instance.progress !== progress ||
    instance.current_event_index !== currentEventIndex
  ) {
    await client.query(
      `UPDATE mission_instances SET phase = $1, progress = $2, failed = $3, reward_forfeited = $4,
        current_event_index = $5, event_results = $6 WHERE id = $7`,
      [
        phase,
        progress,
        failed,
        rewardForfeited,
        currentEventIndex,
        JSON.stringify(eventResults),
        instance.id,
      ],
    )
  }
}

async function syncMissions(client, playerId) {
  const instances = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1 AND status = $2',
    [playerId, 'in_progress'],
  )
  const now = Date.now()

  for (const instance of instances.rows) {
    const templateResult = await client.query('SELECT * FROM mission_templates WHERE id = $1', [
      instance.template_id,
    ])
    const template = {
      ...templateResult.rows[0],
      events: templateResult.rows[0].events,
      planet: templateResult.rows[0].planet,
    }
    await advanceMission(client, playerId, instance, template, now)
  }

  await client.query('UPDATE players SET last_tick_at = NOW() WHERE id = $1', [playerId])
}

async function hireCandidate(client, playerId, candidateId) {
  const player = (await client.query('SELECT * FROM players WHERE id = $1', [playerId])).rows[0]
  // A dead recruit's row stays (deleted_at only applies to fireRecruit's
  // soft-delete) but no longer occupies a roster slot -- excluded here so
  // losing a recruit always frees up room to hire a replacement.
  const recruitCount = (
    await client.query(
      "SELECT COUNT(*)::int AS count FROM recruits WHERE player_id = $1 AND deleted_at IS NULL AND status != 'dead'",
      [playerId],
    )
  ).rows[0].count

  if (recruitCount >= player.max_recruits) return null

  const candidateResult = await client.query(
    'SELECT * FROM candidates WHERE player_id = $1 AND id = $2',
    [playerId, Number(candidateId)],
  )
  if (candidateResult.rows.length === 0) return null

  const candidate = candidateResult.rows[0]
  const recruitId = player.next_recruit_id

  await client.query(
    `INSERT INTO recruits
      (id, player_id, name, job_title, status, hp, max_hp, original_max_hp, attributes, perks, flaws, personality)
     VALUES ($1, $2, $3, $4, 'available', $5, $6, $7, $8, $9, $10, $11)`,
    [
      recruitId,
      playerId,
      candidate.name,
      candidate.job_title,
      candidate.hp,
      candidate.max_hp,
      candidate.max_hp,
      JSON.stringify(candidate.attributes),
      JSON.stringify(candidate.perks),
      JSON.stringify(candidate.flaws),
      candidate.personality,
    ],
  )
  await client.query('DELETE FROM candidates WHERE player_id = $1 AND id = $2', [
    playerId,
    candidate.id,
  ])
  await client.query('UPDATE players SET next_recruit_id = next_recruit_id + 1 WHERE id = $1', [
    playerId,
  ])

  // seedId lets a 'candidate' opera seed's later hire_recruit gate resolve
  // (see operaGraph's seed-key resolution) -- undefined for an ordinary,
  // non-seeded candidate, which never matches a {seedId} condition.
  await OperaService.recordOperaAction(client, playerId, 'hire_recruit', {
    recruitId,
    seedId: candidate.seed_key ?? undefined,
  })

  return getRecruit(client, playerId, recruitId)
}

async function startMission(
  client,
  playerId,
  templateId,
  shipId,
  speedConsumableId = null,
  devInstant = false,
) {
  const templateResult = await client.query('SELECT * FROM mission_templates WHERE id = $1', [
    templateId,
  ])
  // Most commonly hit when the mission board has rotated since the client
  // last synced (unstarted templates are discarded on refresh, see
  // generateMissionBatch) -- not usually a truly bogus id.
  if (templateResult.rows.length === 0)
    return { error: 'Mission not found -- the board may have refreshed' }

  const existing = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1 AND template_id = $2',
    [playerId, templateId],
  )
  if (existing.rows.length > 0) {
    const s = existing.rows[0].status
    return {
      error: s === 'in_progress' ? 'Mission already in progress' : 'Mission already completed',
    }
  }

  const ship = await ShipService.getShip(client, playerId, shipId)
  if (!ship || ship.deleted_at) {
    return { error: 'Ship not found' }
  }

  if (ship.status !== 'docked') {
    return { error: 'The ship is not docked' }
  }

  if (ship.crew.length === 0) {
    return { error: 'The ship has no crew' }
  }

  // Validate all crew members are available
  const crewResults = await Promise.all(
    ship.crew.map((id) =>
      client.query(
        'SELECT * FROM recruits WHERE player_id = $1 AND id = $2 AND deleted_at IS NULL',
        [playerId, id],
      ),
    ),
  )
  const unavailable = crewResults.filter(
    (r) => r.rows.length === 0 || r.rows[0].status !== 'available',
  )
  if (unavailable.length > 0) {
    return { error: 'At least one crew member is not available' }
  }

  // A speed-boost consumable must already be sitting in this ship's own
  // inventory; it's spent here, once, at launch.
  let speedMultiplier = 1
  if (speedConsumableId) {
    const item = await ConsumableService.getConsumable(client, speedConsumableId)
    if (!item || item.assigned_to_ship !== shipId || item.effect !== 'SPEED_BOOST') {
      return { error: "Speed-boost item not found in this ship's inventory" }
    }
    speedMultiplier = item.effect_data?.multiplier ?? 1
    await ConsumableService.consumeFromShipInventory(client, shipId, 'SPEED_BOOST')
  }

  // Update crew status to in_mission
  for (const recruitId of ship.crew) {
    await setRecruitStatus(client, playerId, recruitId, 'in_mission')
  }

  // Update ship status
  await ShipService.updateShipStatus(client, playerId, shipId, 'in_mission')

  const template = templateResult.rows[0]
  const eventCount = template.events.length
  const effectiveSpeed = (ship.stats?.speed ?? 100) * speedMultiplier
  const travelMs = travelSegmentMs(template.difficulty, effectiveSpeed)
  const eventsMs = eventsSegmentMs(template.difficulty, eventCount)
  // devInstant backdates started_at past the mission's own total duration,
  // so the very next syncMissions() tick (the exported startMission wrapper
  // calls one right after this) resolves it straight to COMPLETED through
  // the normal advanceMission() elapsed-time path -- same resolution code a
  // real playthrough hits after being left running unattended, just
  // triggered on demand for testing instead of waiting out real wall-clock
  // time. See devFinishMission for the equivalent for an already-running mission.
  const startedAt = devInstant ? new Date(Date.now() - (travelMs * 2 + eventsMs + 1000)) : new Date()
  const inserted = await client.query(
    `INSERT INTO mission_instances
      (player_id, template_id, ship_id, status, phase, progress, started_at, travel_segment_ms, events_segment_ms)
     VALUES ($1, $2, $3, 'in_progress', 'EN_ROUTE', 0, $4, $5, $6)
     RETURNING *`,
    [playerId, templateId, shipId, startedAt, travelMs, eventsMs],
  )

  const crewMembers = await Promise.all(ship.crew.map((id) => getRecruit(client, playerId, id)))
  const crewNames = crewMembers
    .map((r) => r?.name)
    .filter(Boolean)
    .join(', ')

  const logContext = buildLogContext({ template, crewMembers })
  await emitPhaseTransition(client, playerId, logContext, {
    phase: 'EN_ROUTE',
    failed: false,
    rewardForfeited: false,
    recruitName: crewNames,
    global: true,
  })

  await OperaService.recordOperaAction(client, playerId, 'send_recruit_to_quest', {
    templateId,
    recruitIds: ship.crew,
  })

  return { instance: inserted.rows[0] }
}

// Manually aborting a mission still counts as it "ending" -- same two
// closing hooks completeMission() has (spend the mission's declared quest
// item if any, tell the opera engine it's over as a failure) run here too,
// before the instance row is deleted. Without these, a player could dodge
// quest-item consumption by stopping instead of letting a mission resolve,
// and any opera-seeded mission stopped this way would otherwise leave that
// opera's walk permanently stuck waiting on a 'complete_quest' that will
// never come.
async function stopMission(client, playerId, templateId) {
  const instance = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1 AND template_id = $2',
    [playerId, templateId],
  )
  if (instance.rows.length === 0) return { error: 'No active mission' }

  const row = instance.rows[0]
  const template = (
    await client.query('SELECT * FROM mission_templates WHERE id = $1', [row.template_id])
  ).rows[0]
  const ship = await ShipService.getShip(client, playerId, row.ship_id)

  if (ship && ship.crew) {
    for (const recruitId of ship.crew) {
      await setRecruitStatus(client, playerId, recruitId, 'available')
    }
  }

  await ShipService.updateShipStatus(client, playerId, row.ship_id, 'docked')

  if (template?.consumes_item_name) {
    await ConsumableService.consumeNamedFromShipInventory(
      client,
      row.ship_id,
      template.consumes_item_name,
    )
  }
  await OperaService.recordOperaAction(client, playerId, 'complete_quest', {
    templateId: row.template_id,
    outcome: 'failure',
  })

  await client.query('DELETE FROM mission_instances WHERE id = $1', [row.id])
  return { ok: true }
}

async function forceReturnMission(client, playerId, templateId) {
  const instanceResult = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1 AND template_id = $2',
    [playerId, templateId],
  )
  if (instanceResult.rows.length === 0) return { error: 'No active mission' }

  const instance = instanceResult.rows[0]
  if (instance.phase === 'COMPLETED' || instance.phase === 'RETURN') {
    return { error: 'Return already in progress or mission completed' }
  }

  const template = (
    await client.query('SELECT * FROM mission_templates WHERE id = $1', [instance.template_id])
  ).rows[0]

  const { crewMembers, crewNames } = await loadCrewContext(
    client,
    playerId,
    instance.ship_id,
    'Crew',
  )

  const logContext = buildLogContext({ template, crewMembers })
  await emitPhaseTransition(client, playerId, logContext, {
    phase: 'RETURN',
    failed: instance.failed,
    rewardForfeited: instance.reward_forfeited,
    recruitName: crewNames,
  })

  await client.query(
    `UPDATE mission_instances SET
      forced_return = TRUE, return_started_at = NOW(), progress_at_return = progress, phase = 'RETURN'
     WHERE id = $1`,
    [instance.id],
  )

  return { ok: true }
}

// Stores the player's pick for whichever event is currently
// current_event_index -- see resolveEvents' pickAssignedOrBest. Only ever
// applies to that one event: eventIndex must match it exactly, so a stale
// or premature pick is rejected rather than silently queued.
async function assignMissionEventRecruit(client, playerId, templateId, eventIndex, recruitId) {
  const instanceResult = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1 AND template_id = $2',
    [playerId, templateId],
  )
  if (instanceResult.rows.length === 0) return { error: 'No active mission' }
  const instance = instanceResult.rows[0]
  if (instance.status !== 'in_progress') return { error: 'Mission already completed' }

  const template = (
    await client.query('SELECT * FROM mission_templates WHERE id = $1', [instance.template_id])
  ).rows[0]
  const events = template.events

  if (!Number.isInteger(eventIndex) || eventIndex < 0 || eventIndex >= events.length) {
    return { error: 'Invalid event index' }
  }
  if (eventIndex !== instance.current_event_index) {
    return { error: 'Too late -- that event has already been resolved' }
  }
  if (events[eventIndex].type === 'COMBAT') {
    return { error: 'Combat events are resolved by the full crew automatically' }
  }

  const ship = await ShipService.getShip(client, playerId, instance.ship_id)
  const crewIds = ship?.crew ?? []
  if (!crewIds.some((id) => String(id) === String(recruitId))) {
    return { error: "That recruit is not part of this mission's crew" }
  }

  const recruit = await getRecruit(client, playerId, Number(recruitId))
  if (!recruit || recruit.status === 'dead') return { error: 'Recruit is dead' }

  await client.query('UPDATE mission_instances SET assigned_recruit_id = $1 WHERE id = $2', [
    Number(recruitId),
    instance.id,
  ])
  return { ok: true }
}

// --- Dev/testing helpers ----------------------------------------------
// Not gated behind an environment check: this is a single-player local
// game with no auth system anywhere else in the app either.

// Forces every rotating pool (missions, shop, candidates) to refresh right
// now, bypassing the normal wall-clock isRefreshDue() gate — lets a
// developer skip waiting out a real refresh interval while testing.
async function devRefreshPools(client, now = new Date()) {
  const player = await ensurePlayer(client)
  await generateMissionBatch(client, player, now)
  await generateCandidateBatch(client, player, now)
  await ShopService.refreshShopRotation(client, player.id, now)
}

async function devSetCredits(client, playerId, amount) {
  await client.query('UPDATE players SET wallet = $1 WHERE id = $2', [amount, playerId])
}

async function devSetTokens(client, playerId, amount) {
  await client.query('UPDATE players SET tokens = $1 WHERE id = $2', [amount, playerId])
}

// Backdates an already-running mission's started_at past its own total
// duration, the same trick startMission's devInstant flag uses at creation
// time -- the next syncMissions() tick resolves it straight to COMPLETED
// through the normal advanceMission() elapsed-time path, rather than
// waiting out the real wall-clock travel/event time. Clears any in-flight
// forced return first: advanceMission branches on forced_return before
// falling back to the elapsed-time calculation, so a mission mid
// force-return would otherwise keep resolving off return_started_at
// instead of the backdated started_at.
async function devFinishMission(client, playerId, templateId) {
  const instanceResult = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1 AND template_id = $2',
    [playerId, templateId],
  )
  if (instanceResult.rows.length === 0) return { error: 'No active mission' }

  const instance = instanceResult.rows[0]
  if (instance.status !== 'in_progress') return { error: 'Mission already completed' }

  const totalMs = instance.travel_segment_ms * 2 + instance.events_segment_ms
  await client.query(
    `UPDATE mission_instances SET started_at = $1, forced_return = FALSE, return_started_at = NULL
     WHERE id = $2`,
    [new Date(Date.now() - totalMs - 1000), instance.id],
  )

  return { ok: true }
}

// Wipes every player-scoped row — players cascades to recruits, candidates,
// ships, mission_instances, log_entries, shop_rotation, consumables,
// equipment, player_upgrades, and opera_instances/progress (see the FK
// definitions in db/migrations) — plus the global mission_templates pool,
// which is orphaned once the mission_instances referencing it are gone.
// Then bootstraps a brand new player from scratch. shop_items (the master
// catalog) is deliberately left untouched: it isn't per-player state.
async function devReboot(client) {
  await client.query('DELETE FROM players')
  await client.query('DELETE FROM mission_templates')
  await bootstrapPlayer(client)
}

async function renameRecruit(client, playerId, recruitId, newName) {
  const result = await client.query(
    `UPDATE recruits SET name = $1 WHERE player_id = $2 AND id = $3 RETURNING *`,
    [newName, playerId, Number(recruitId)],
  )
  return result.rows[0] ? rowToRecruit(result.rows[0]) : null
}

async function buildGameState(client, playerId) {
  const playerResult = await client.query(
    `SELECT max_recruits, max_available_missions, wallet, tokens,
            mission_refresh_interval_ms, shop_refresh_interval_ms, candidate_refresh_interval_ms,
            hospital_slots, hospital_heal_interval_ms,
            has_difficulty_scanner, has_duration_scanner, has_combat_scanner, has_skill_check_scanner
     FROM players WHERE id = $1`,
    [playerId],
  )
  const player = playerResult.rows[0]

  const recruitsResult = await client.query(
    'SELECT * FROM recruits WHERE player_id = $1 AND deleted_at IS NULL ORDER BY id',
    [playerId],
  )
  const relationships = await RelationshipService.getRelationships(client, playerId)
  const factionReputations = await FactionService.getReputations(client, playerId)
  const candidatesResult = await client.query(
    'SELECT * FROM candidates WHERE player_id = $1 ORDER BY id',
    [playerId],
  )
  const shipsResult = await client.query(
    'SELECT * FROM ships WHERE player_id = $1 AND deleted_at IS NULL ORDER BY id',
    [playerId],
  )
  const templatesResult = await client.query('SELECT * FROM mission_templates ORDER BY id')
  const instancesResult = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1',
    [playerId],
  )
  const logsResult = await client.query(
    'SELECT tag, message, mission_id AS "missionId" FROM log_entries WHERE player_id = $1 ORDER BY id',
    [playerId],
  )

  const instanceByTemplate = Object.fromEntries(
    instancesResult.rows.map((row) => [row.template_id, row]),
  )

  const missions = templatesResult.rows.map((t) => {
    const instance = instanceByTemplate[t.id]
    let status = 'available'
    let assignedShipId = null
    if (instance) {
      status = instance.status === 'in_progress' ? 'in_progress' : instance.status
      assignedShipId = instance.ship_id
    }
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      difficulty: t.difficulty,
      events: t.events,
      ...missionPreCommitmentSummary(t.difficulty, t.events),
      assignedShipId,
      status,
      isOperaMission: t.opera_instance_id != null,
      forFaction: t.for_faction ?? undefined,
      againstFaction: t.against_faction ?? undefined,
    }
  })

  const missionStates = {}
  for (const instance of instancesResult.rows) {
    if (instance.status !== 'in_progress') continue
    const template = templatesResult.rows.find((t) => t.id === instance.template_id)
    missionStates[instance.template_id] = {
      missionId: instance.template_id,
      shipId: instance.ship_id,
      phase: instance.phase,
      progress: instance.progress,
      events: template?.events ?? [],
      currentEventIndex: instance.current_event_index,
      eventResults: instance.event_results,
      failed: instance.failed,
      rewardForfeited: instance.reward_forfeited,
      assignedRecruitId:
        instance.assigned_recruit_id != null ? String(instance.assigned_recruit_id) : null,
      intervalId: null,
    }
  }

  const globalLogs = []
  const missionLogs = {}
  for (const log of logsResult.rows) {
    const entry = { tag: log.tag, message: log.message, missionId: log.missionId ?? undefined }
    if (log.missionId != null) {
      if (!missionLogs[log.missionId]) missionLogs[log.missionId] = []
      missionLogs[log.missionId].push(entry)
    } else {
      globalLogs.push({ tag: log.tag, message: log.message })
    }
  }

  // Opera-injected missions are always visible regardless of the board cap
  // -- the same "never stuck waiting on rotation luck" guarantee
  // shop.service.js's is_quest_item items already get -- a 'mission' node
  // blocks its opera's walk, so it must never be capacity-sliced away.
  const nonFinal = missions.filter((m) => m.status !== 'failed' && m.status !== 'success')
  const visibleMissions = [
    ...nonFinal.filter((m) => m.isOperaMission),
    ...nonFinal.filter((m) => !m.isOperaMission).slice(0, player.max_available_missions),
  ]

  // Opera state enriches the synced snapshot but must never be a hard
  // dependency for it: buildGameState() backs virtually every screen in the
  // game, so a bug here falls back to "no operas" rather than breaking
  // mission/recruit/ship visibility entirely (same isolation principle as
  // recordOperaAction()/ensureOperasForPlayer()).
  let operas = []
  let operaLogs = {}
  try {
    operas = await OperaService.getOperaState(client, playerId)
    operaLogs = await OperaService.getOperaLogs(client, playerId)
  } catch (err) {
    console.error('[opera] failed to load opera state for game snapshot', err)
  }

  return {
    player: {
      maxNumberOfRecruits: player.max_recruits,
      maxAvailableMissions: player.max_available_missions,
      credits: player.wallet,
      tokens: player.tokens,
      missionRefreshIntervalMs: player.mission_refresh_interval_ms,
      shopRefreshIntervalMs: player.shop_refresh_interval_ms,
      candidateRefreshIntervalMs: player.candidate_refresh_interval_ms,
      hospitalSlots: player.hospital_slots,
      hospitalHealIntervalMs: player.hospital_heal_interval_ms,
      hasDifficultyScanner: player.has_difficulty_scanner === 1,
      hasDurationScanner: player.has_duration_scanner === 1,
      hasCombatScanner: player.has_combat_scanner === 1,
      hasSkillCheckScanner: player.has_skill_check_scanner === 1,
    },
    recruits: recruitsResult.rows.map(rowToRecruit),
    relationships,
    factionReputations,
    candidates: candidatesResult.rows.map(rowToCandidate),
    ships: shipsResult.rows,
    missions: visibleMissions,
    missionStates,
    globalLogs,
    missionLogs,
    operas,
    operaLogs,
  }
}

// Full mission history for a player: every template that was ever started
// (in_progress, success, or failed), regardless of which batch it originally
// belonged to. Templates that were never started aren't "history" — they're
// either part of the current batch (see buildGameState's `missions`) or
// already discarded by a refresh. Kept separate from buildGameState (rather
// than a param on it) since it serves a different, batch-agnostic need: the
// upcoming `mission list --completed` frontend command.
async function getMissionHistory(client, playerId) {
  const templatesResult = await client.query('SELECT * FROM mission_templates ORDER BY id')
  const instancesResult = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1',
    [playerId],
  )
  const instanceByTemplate = Object.fromEntries(
    instancesResult.rows.map((row) => [row.template_id, row]),
  )

  return templatesResult.rows
    .map((t) => {
      const instance = instanceByTemplate[t.id]
      if (!instance) return null
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        difficulty: t.difficulty,
        events: t.events,
        ...missionPreCommitmentSummary(t.difficulty, t.events),
        assignedShipId: instance.ship_id,
        status: instance.status === 'in_progress' ? 'in_progress' : instance.status,
        isOperaMission: t.opera_instance_id != null,
        forFaction: t.for_faction ?? undefined,
        againstFaction: t.against_faction ?? undefined,
      }
    })
    .filter(Boolean)
}

async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Wraps an exported player action in the shape used by (almost) every
// action in module.exports below: run `fn` inside a transaction, and
// unless it returns an {error}, merge whatever it does return with a
// fresh buildGameState() snapshot. syncGame()/getGameState() aren't built
// on this since they return the snapshot directly, unwrapped, rather than
// as a `state` field alongside other data.
function withPlayerAction(fn) {
  return (...args) =>
    withTransaction(async (client) => {
      const result = await fn(client, ...args)
      if (result?.error) return result
      return { ...result, state: await buildGameState(client, DEFAULT_PLAYER_ID) }
    })
}

async function initGame() {
  return withTransaction(async (client) => {
    await bootstrapPlayer(client)
  })
}

async function syncGame() {
  return withTransaction(async (client) => {
    await bootstrapPlayer(client)
    await syncMissions(client, DEFAULT_PLAYER_ID)
    await HospitalService.regenerateHospitalizedRecruits(client, DEFAULT_PLAYER_ID)
    return buildGameState(client, DEFAULT_PLAYER_ID)
  })
}

async function getGameState() {
  return withTransaction(async (client) => {
    await bootstrapPlayer(client)
    return buildGameState(client, DEFAULT_PLAYER_ID)
  })
}

async function getMissionLogs(playerId, missionId) {
  const result = await pool.query(
    `SELECT tag, message FROM log_entries
     WHERE player_id = $1 AND mission_id = $2
     ORDER BY id`,
    [playerId, missionId],
  )
  return result.rows
}

module.exports = {
  DEFAULT_PLAYER_ID,
  initGame,
  syncGame,
  getGameState,
  getMissionLogs: (missionId) => getMissionLogs(DEFAULT_PLAYER_ID, missionId),
  getMissionHistory: () => getMissionHistory(pool, DEFAULT_PLAYER_ID),
  hireCandidate: withPlayerAction(async (client, candidateId) => {
    await bootstrapPlayer(client)
    const recruit = await hireCandidate(client, DEFAULT_PLAYER_ID, candidateId)
    if (!recruit) return { error: 'Recruitment failed' }
    await syncMissions(client, DEFAULT_PLAYER_ID)
    return { recruit }
  }),
  startMission: withPlayerAction(async (client, templateId, shipId, speedConsumableId, devInstant) => {
    await bootstrapPlayer(client)
    const result = await startMission(
      client,
      DEFAULT_PLAYER_ID,
      templateId,
      shipId,
      speedConsumableId,
      devInstant,
    )
    if (result.error) return result
    await syncMissions(client, DEFAULT_PLAYER_ID)
    return {}
  }),
  stopMission: withPlayerAction(async (client, templateId) => {
    const result = await stopMission(client, DEFAULT_PLAYER_ID, templateId)
    if (result.error) return result
    return {}
  }),
  forceReturnMission: withPlayerAction(async (client, templateId) => {
    const result = await forceReturnMission(client, DEFAULT_PLAYER_ID, templateId)
    if (result.error) return result
    await syncMissions(client, DEFAULT_PLAYER_ID)
    return {}
  }),
  assignMissionEventRecruit: withPlayerAction(async (client, templateId, eventIndex, recruitId) => {
    const result = await assignMissionEventRecruit(
      client,
      DEFAULT_PLAYER_ID,
      templateId,
      eventIndex,
      recruitId,
    )
    if (result.error) return result
    return {}
  }),
  devRefresh: withPlayerAction(async (client) => {
    await bootstrapPlayer(client)
    await devRefreshPools(client)
    await syncMissions(client, DEFAULT_PLAYER_ID)
    return {}
  }),
  devSetCredits: withPlayerAction(async (client, amount) => {
    await bootstrapPlayer(client)
    await devSetCredits(client, DEFAULT_PLAYER_ID, amount)
    return {}
  }),
  devSetTokens: withPlayerAction(async (client, amount) => {
    await bootstrapPlayer(client)
    await devSetTokens(client, DEFAULT_PLAYER_ID, amount)
    return {}
  }),
  devReboot: withPlayerAction(async (client) => {
    await devReboot(client)
    return {}
  }),
  devFinishMission: withPlayerAction(async (client, templateId) => {
    const result = await devFinishMission(client, DEFAULT_PLAYER_ID, templateId)
    if (result.error) return result
    await syncMissions(client, DEFAULT_PLAYER_ID)
    return {}
  }),
  renameRecruit: withPlayerAction(async (client, recruitId, newName) => {
    const recruit = await renameRecruit(client, DEFAULT_PLAYER_ID, recruitId, newName)
    if (!recruit) return { error: 'Recruit not found' }
    return { recruit }
  }),
  fireRecruit: withPlayerAction(async (client, recruitId) => {
    const recruit = await RecruitService.fireRecruit(client, DEFAULT_PLAYER_ID, Number(recruitId))
    if (!recruit) return { error: 'Recruit not found' }
    await OperaService.recordOperaAction(client, DEFAULT_PLAYER_ID, 'fire_recruit', {
      recruitId: Number(recruitId),
    })
    return {}
  }),
}
