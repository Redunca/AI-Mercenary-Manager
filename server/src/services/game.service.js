const fs = require('fs')
const path = require('path')
const { pool } = require('../db/pool')
const { rollAction, rollDie, rollInRange } = require('./dice.service')
const { generateCandidate, rowToCandidate, rowToRecruit, computeMaxHp } = require('../domain/recruit')
const { DURATION_PER_EVENT_MS, travelSegmentMs, eventsSegmentMs, phaseAndProgressFromElapsed } = require('../domain/mission')
const { insertLogEntries, buildPhaseLogs, buildEventResultLogs, buildBanterLog } = require('./log.service')
const { createStarterShip, validateCrewAssignment } = require('../domain/ship')
const ShipService = require('./ship.service')
const ConsumableService = require('./consumable.service')


const { loadData } = require('../dataLoader')
const { generateMission } = require('../engine/missionGenerator')
const MISSION_TEMPLATE_COUNT = 25
const SEED_DIFFICULTIES = [
  'ROUTINE', 'ROUTINE', 'ROUTINE', 'ROUTINE', 'ROUTINE',
  'STANDARD', 'STANDARD', 'STANDARD', 'STANDARD', 'STANDARD',
  'HARD', 'HARD', 'HARD', 'HARD', 'HARD', 'HARD',
  'PERILOUS', 'PERILOUS', 'PERILOUS', 'PERILOUS', 'PERILOUS',
  'EPIC', 'EPIC', 'EPIC', 'EPIC', 'EPIC',
]

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

async function seedMissionTemplates(client) {
  const existing = await client.query('SELECT COUNT(*)::int AS count FROM mission_templates')
  if (existing.rows[0].count > 0) return

  const data = loadData()
  for (let i = 0; i < MISSION_TEMPLATE_COUNT; i++) {
    const id = i + 1
    const mission = generateMission(data, { difficulty: SEED_DIFFICULTIES[i] })
    await client.query(
      `INSERT INTO mission_templates (id, name, description, difficulty, events, planet)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         difficulty = EXCLUDED.difficulty,
         events = EXCLUDED.events,
         planet = EXCLUDED.planet`,
      [
        id, mission.name, mission.description, mission.difficulty,
        JSON.stringify(mission.events), JSON.stringify(mission.planet),
      ],
    )
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
        candidate.id, player.id, candidate.name, candidate.jobTitle, candidate.archetype,
        candidate.hp, candidate.maxHp, JSON.stringify(candidate.attributes),
        JSON.stringify(candidate.perks), JSON.stringify(candidate.flaws), candidate.personality,
      ],
    )
    nextId++
  }

  await client.query(
    'UPDATE players SET next_candidate_id = $1 WHERE id = $2',
    [nextId, player.id],
  )
}

async function bootstrapPlayer(client) {
  await seedMissionTemplates(client)
  const player = await ensurePlayer(client)

  // Ensure hangar exists
  const hangar = await ShipService.getHangar(client, player.id)
  if (!hangar) {
    await ShipService.createHangar(client, player.id)
    await ShipService.createDockingStation(client, player.id, 5)
  }

  // Ensure starter ship exists
  const ships = await ShipService.getShips(client, player.id)
  if (ships.length === 0) {
    const starterShip = createStarterShip(player.next_ship_id, rollInRange)
    await ShipService.createShip(client, player.id, starterShip)
    await client.query(
      'UPDATE players SET next_ship_id = next_ship_id + 1 WHERE id = $1',
      [player.id],
    )
  }

  const candidateCount = await client.query(
    'SELECT COUNT(*)::int AS count FROM candidates WHERE player_id = $1',
    [player.id],
  )
  if (candidateCount.rows[0].count === 0) {
    await generateCandidatesForPlayer(client, player, 5)
  }

  const recruitCount = await client.query(
    'SELECT COUNT(*)::int AS count FROM recruits WHERE player_id = $1',
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

  return player
}

async function getRecruit(client, playerId, recruitId) {
  const result = await client.query(
    'SELECT * FROM recruits WHERE player_id = $1 AND id = $2',
    [playerId, recruitId],
  )
  return result.rows[0] ? rowToRecruit(result.rows[0]) : null
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
    const healed = shipId ? await ConsumableService.consumeFromShipInventory(client, shipId, 'HEAL') : null
    if (healed) {
      hp = row.rows[0].max_hp
      revived = true
    } else {
      status = 'dead'
    }
  }

  await client.query(
    'UPDATE recruits SET hp = $1, status = $2 WHERE player_id = $3 AND id = $4',
    [hp, status, playerId, recruitId],
  )
  const updated = await getRecruit(client, playerId, recruitId)
  return updated ? { ...updated, revived } : updated
}

async function setRecruitStatus(client, playerId, recruitId, status) {
  await client.query(
    `UPDATE recruits SET status = $1
     WHERE player_id = $2 AND id = $3 AND status != 'dead'`,
    [status, playerId, recruitId],
  )
}

async function resolveEvents(client, playerId, instance, template, crewMembers) {
  const events = template.events
  const eventResults = [...instance.event_results]
  let failed = instance.failed
  let rewardForfeited = instance.reward_forfeited
  let currentEventIndex = instance.current_event_index
  const missionId = template.id
  const shipId = instance.ship_id
  const logs = []
  let crewDead = []

  for (let i = currentEventIndex; i < events.length; i++) {
    if (failed || crewMembers.filter(r => r.status !== 'dead').length === 0) break

    const event = events[i]

    // Find crew member with highest stat for this event
    const activeCrew = crewMembers.filter(r => r.status !== 'dead')
    if (activeCrew.length === 0) {
      failed = true
      break
    }

    const bestRecruit = activeCrew.reduce((best, current) => {
      const currentStat = current.attributes[event.attribute] || 0
      const bestStat = best.attributes[event.attribute] || 0
      return currentStat > bestStat ? current : best
    })

    // An ATTRIBUTE_BOOST consumable sitting in the ship's own inventory grants
    // Advantage on the one roll it matches, then is spent regardless of outcome.
    const boost = await ConsumableService.consumeFromShipInventory(
      client, shipId, 'ATTRIBUTE_BOOST', data => data?.attribute === event.attribute,
    )
    const advantage = boost ? (boost.effect_data?.advantage ?? 1) : 0

    const roll = rollAction(bestRecruit.attributes[event.attribute], advantage)
    const success = roll.total >= event.dc

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
    if (advantage > 0) result.advantageUsed = advantage

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
          if (crewMembers.filter(r => r.status !== 'dead').length === 1) {
            failed = true
            currentEventIndex = i + 1
            eventResults.push(result)
            logs.push(buildEventResultLogs({
              eventResult: result,
              context: buildLogContext({ template, crewMembers, actingRecruit: bestRecruit }),
            }))
            await insertLogEntries(client, playerId, [
              ...logs[logs.length - 1].mission,
              ...logs[logs.length - 1].global,
            ])
            return { failed, rewardForfeited, currentEventIndex, eventResults, forceReturn: false, completed: true, shipDestroyed: false }
          }
        }
      } else if (event.failureConsequence === 'FORCED_DEPARTURE') {
        failed = true
        currentEventIndex = i + 1
        eventResults.push(result)
        logs.push(buildEventResultLogs({
          eventResult: result,
          missionId,
          missionName: template.name,
          recruitName: bestRecruit.name,
          recruitPerks: bestRecruit.perks,
          recruitFlaws: bestRecruit.flaws,
          recruitPersonality: bestRecruit.personality,
        }))
        await insertLogEntries(client, playerId, [
          ...logs[logs.length - 1].mission,
          ...logs[logs.length - 1].global,
        ])
        return { failed, rewardForfeited, currentEventIndex, eventResults, forceReturn: true, completed: false, shipDestroyed: false }
      } else if (event.failureConsequence === 'SHIP_DAMAGE') {
        rewardForfeited = true
        result.shipDamaged = true
        const damaged = await ShipService.damageShip(client, playerId, shipId, rollDie(6))
        if (damaged?.status === 'broken') {
          const repaired = await ConsumableService.consumeFromShipInventory(client, shipId, 'REPAIR')
          if (repaired) {
            await ShipService.repairShip(client, playerId, shipId)
            result.shipAutoRepaired = true
          } else {
            result.shipBroken = true
            currentEventIndex = i + 1
            eventResults.push(result)
            logs.push(buildEventResultLogs({
              eventResult: result,
              missionId,
              missionName: template.name,
              recruitName: bestRecruit.name,
              recruitPerks: bestRecruit.perks,
              recruitFlaws: bestRecruit.flaws,
              recruitPersonality: bestRecruit.personality,
            }))
            await insertLogEntries(client, playerId, [
              ...logs[logs.length - 1].mission,
              ...logs[logs.length - 1].global,
            ])
            return { failed, rewardForfeited, currentEventIndex, eventResults, forceReturn: true, completed: false, shipDestroyed: false }
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
  }

  return { failed, rewardForfeited, currentEventIndex, eventResults, forceReturn: false, completed: false, shipDestroyed: false }
}

async function completeMission(client, playerId, instance, template, failed, shipDestroyed) {
  const status = failed ? 'failed' : 'success'
  
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

  if (!failed && !instance.reward_forfeited) {
    const creditsWon = instance.event_results
      .filter(r => r.rewardEarned?.type === 'CREDITS')
      .reduce((sum, r) => sum + r.rewardEarned.amount, 0)

    if (creditsWon > 0) {
      const player = await client.query(
        'SELECT wallet FROM players WHERE id = $1 FOR UPDATE',
        [playerId],
      )
      await client.query(
        'UPDATE players SET wallet = $1 WHERE id = $2',
        [player.rows[0].wallet + creditsWon, playerId],
      )
    }
  }

  const shipData = await ShipService.getShip(client, playerId, instance.ship_id)
  const crewMembers = await Promise.all(
    (shipData?.crew ?? []).map(id => getRecruit(client, playerId, id))
  )
  const crewNames = shipData?.crew?.length > 0
    ? crewMembers.map(r => r?.name || `Recruit ${r?.id}`).join(', ')
    : 'No crew'

  const completedLogs = buildPhaseLogs({
    phase: 'COMPLETED',
    failed,
    rewardForfeited: instance.reward_forfeited,
    recruitName: crewNames,
    context: buildLogContext({ template, crewMembers }),
  })
  await insertLogEntries(client, playerId, [...completedLogs.mission, ...completedLogs.global])
}

async function advanceMission(client, playerId, instance, template, now) {
  const events = template.events
  const durationMs = events.length * DURATION_PER_EVENT_MS
  // Older instances predate the travel/events segment columns; fall back to
  // the original fixed thirds (equivalent to speed 100, no boost).
  const travelMs = instance.travel_segment_ms ?? Math.round(durationMs / 3)
  const eventsMs = instance.events_segment_ms ?? Math.round(durationMs / 3)
  let progress
  let phase

  if (instance.forced_return && instance.return_started_at) {
    const returnElapsed = now - new Date(instance.return_started_at).getTime()
    const returnDurationMs = (instance.progress_at_return ?? 0) <= 33
      ? ((instance.progress_at_return ?? 0) / 100) * durationMs
      : travelMs
    const returnTicks = Math.max(1, returnDurationMs)
    const delta = Math.min(
      100 - instance.progress_at_return,
      Math.round((returnElapsed / returnTicks) * (100 - instance.progress_at_return)),
    )
    progress = Math.min(100, instance.progress_at_return + delta)
    phase = progress >= 100 ? 'COMPLETED' : 'RETURN'
  } else {
    const elapsed = now - new Date(instance.started_at).getTime()
    ;({ phase, progress } = phaseAndProgressFromElapsed(elapsed, travelMs, eventsMs))
  }

  let {
    failed,
    reward_forfeited: rewardForfeited,
    current_event_index: currentEventIndex,
    event_results: eventResults,
    phase: storedPhase,
  } = instance

  const pastEventPhase = progress > 33 || phase === 'EVENT' || phase === 'RETURN' || phase === 'COMPLETED'

  if (pastEventPhase && currentEventIndex < events.length) {
    const ship = await ShipService.getShip(client, playerId, instance.ship_id)
    const crewMembers = await Promise.all(
      ship.crew.map(id => getRecruit(client, playerId, id))
    )
    const logContext = buildLogContext({ template, crewMembers })

    if (storedPhase === 'EN_ROUTE') {
      const crewNames = ship?.crew?.length > 0
        ? crewMembers.map(r => r?.name).filter(Boolean).join(', ')
        : 'No crew'

      const eventPhaseLogs = buildPhaseLogs({
        phase: 'EVENT',
        failed: false,
        rewardForfeited,
        recruitName: crewNames,
        context: logContext,
      })
      await insertLogEntries(client, playerId, eventPhaseLogs.mission)
    }

    const resolution = await resolveEvents(client, playerId, instance, template, crewMembers)
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
        [failed, rewardForfeited, currentEventIndex, JSON.stringify(eventResults), progress, instance.id],
      )
      const returnLogs = buildPhaseLogs({
        phase: 'RETURN',
        failed: true,
        rewardForfeited,
        recruitName: 'Crew',
        context: logContext,
      })
      await insertLogEntries(client, playerId, returnLogs.mission)

      const retourBanter = await buildBanterLog(client, playerId, logContext)
      if (retourBanter) await insertLogEntries(client, playerId, retourBanter.mission)

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
      await completeMission(client, playerId, { ...instance, failed, reward_forfeited: rewardForfeited, event_results: eventResults }, template, true, resolution.shipDestroyed)
      return
    }
  }

  if (phase === 'RETURN' && storedPhase !== 'RETURN' && !instance.forced_return) {
    const ship = await ShipService.getShip(client, playerId, instance.ship_id)
    const crewMembers = await Promise.all(
      (ship?.crew ?? []).map(id => getRecruit(client, playerId, id))
    )
    const crewNames = ship?.crew?.length > 0
      ? crewMembers.map(r => r?.name).filter(Boolean).join(', ')
      : 'No crew'

    const logContext = buildLogContext({ template, crewMembers })
    const returnLogs = buildPhaseLogs({
      phase: 'RETURN',
      failed,
      rewardForfeited,
      recruitName: crewNames,
      context: logContext,
    })
    await insertLogEntries(client, playerId, returnLogs.mission)

    const banterLogs = await buildBanterLog(client, playerId, logContext)
    if (banterLogs) await insertLogEntries(client, playerId, banterLogs.mission)
  }

  if (phase === 'COMPLETED') {
    await client.query(
      `UPDATE mission_instances SET
        phase = 'COMPLETED', progress = 100, failed = $1, reward_forfeited = $2,
        current_event_index = $3, event_results = $4, status = $5
       WHERE id = $6`,
      [failed, rewardForfeited, currentEventIndex, JSON.stringify(eventResults), failed ? 'failed' : 'success', instance.id],
    )
    await completeMission(client, playerId, { ...instance, failed, reward_forfeited: rewardForfeited, event_results: eventResults }, template, failed, false)
    return
  }

  if (storedPhase !== phase || instance.progress !== progress) {
    await client.query(
      `UPDATE mission_instances SET phase = $1, progress = $2, failed = $3, reward_forfeited = $4,
        current_event_index = $5, event_results = $6 WHERE id = $7`,
      [phase, progress, failed, rewardForfeited, currentEventIndex, JSON.stringify(eventResults), instance.id],
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
    const templateResult = await client.query(
      'SELECT * FROM mission_templates WHERE id = $1',
      [instance.template_id],
    )
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
  const recruitCount = (await client.query(
    'SELECT COUNT(*)::int AS count FROM recruits WHERE player_id = $1',
    [playerId],
  )).rows[0].count

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
      (id, player_id, name, job_title, status, hp, max_hp, attributes, perks, flaws, personality)
     VALUES ($1, $2, $3, $4, 'available', $5, $6, $7, $8, $9, $10)`,
    [
      recruitId, playerId, candidate.name, candidate.job_title,
      candidate.hp, candidate.max_hp, JSON.stringify(candidate.attributes), JSON.stringify(candidate.perks), JSON.stringify(candidate.flaws),
      candidate.personality,
    ],
  )
  await client.query(
    'DELETE FROM candidates WHERE player_id = $1 AND id = $2',
    [playerId, candidate.id],
  )
  await client.query(
    'UPDATE players SET next_recruit_id = next_recruit_id + 1 WHERE id = $1',
    [playerId],
  )

  return getRecruit(client, playerId, recruitId)
}

async function startMission(client, playerId, templateId, shipId, speedConsumableId = null) {
  const templateResult = await client.query(
    'SELECT * FROM mission_templates WHERE id = $1',
    [templateId],
  )
  if (templateResult.rows.length === 0) return { error: 'Mission not found' }

  const existing = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1 AND template_id = $2',
    [playerId, templateId],
  )
  if (existing.rows.length > 0) {
    const s = existing.rows[0].status
    return { error: s === 'in_progress' ? 'Mission already in progress' : 'Mission already completed' }
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
    ship.crew.map(id => client.query(
      'SELECT * FROM recruits WHERE player_id = $1 AND id = $2',
      [playerId, id]
    ))
  )
  const unavailable = crewResults.filter(r => r.rows.length === 0 || r.rows[0].status !== 'available')
  if (unavailable.length > 0) {
    return { error: 'At least one crew member is not available' }
  }

  // A speed-boost consumable must already be sitting in this ship's own
  // inventory; it's spent here, once, at launch.
  let speedMultiplier = 1
  if (speedConsumableId) {
    const item = await ConsumableService.getConsumable(client, speedConsumableId)
    if (!item || item.assigned_to_ship !== shipId || item.effect !== 'SPEED_BOOST') {
      return { error: 'Speed-boost item not found in this ship\'s inventory' }
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
  const travelMs = travelSegmentMs(eventCount, effectiveSpeed)
  const eventsMs = eventsSegmentMs(eventCount)
  const inserted = await client.query(
    `INSERT INTO mission_instances
      (player_id, template_id, ship_id, status, phase, progress, started_at, travel_segment_ms, events_segment_ms)
     VALUES ($1, $2, $3, 'in_progress', 'EN_ROUTE', 0, NOW(), $4, $5)
     RETURNING *`,
    [playerId, templateId, shipId, travelMs, eventsMs],
  )

  const crewMembers = await Promise.all(
    ship.crew.map(id => getRecruit(client, playerId, id))
  )
  const crewNames = crewMembers.map(r => r?.name).filter(Boolean).join(', ')

  const logContext = buildLogContext({ template, crewMembers })
  const phaseLogs = buildPhaseLogs({
    phase: 'EN_ROUTE',
    failed: false,
    rewardForfeited: false,
    recruitName: crewNames,
    context: logContext,
  })
  await insertLogEntries(client, playerId, [...phaseLogs.mission, ...phaseLogs.global])

  const banterLogs = await buildBanterLog(client, playerId, logContext)
  if (banterLogs) await insertLogEntries(client, playerId, banterLogs.mission)

  return { instance: inserted.rows[0] }
}

async function stopMission(client, playerId, templateId) {
  const instance = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1 AND template_id = $2',
    [playerId, templateId],
  )
  if (instance.rows.length === 0) return { error: 'No active mission' }

  const row = instance.rows[0]
  const ship = await ShipService.getShip(client, playerId, row.ship_id)
  
  if (ship && ship.crew) {
    for (const recruitId of ship.crew) {
      await setRecruitStatus(client, playerId, recruitId, 'available')
    }
  }
  
  await ShipService.updateShipStatus(client, playerId, row.ship_id, 'docked')
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

  const template = (await client.query(
    'SELECT * FROM mission_templates WHERE id = $1',
    [instance.template_id],
  )).rows[0]

  const ship = await ShipService.getShip(client, playerId, instance.ship_id)
  const crewMembers = await Promise.all(
    (ship?.crew ?? []).map(id => getRecruit(client, playerId, id))
  )
  const crewNames = ship?.crew?.length > 0
    ? crewMembers.map(r => r?.name).filter(Boolean).join(', ')
    : 'Crew'

  const logContext = buildLogContext({ template, crewMembers })
  const returnLogs = buildPhaseLogs({
    phase: 'RETURN',
    failed: instance.failed,
    rewardForfeited: instance.reward_forfeited,
    recruitName: crewNames,
    context: logContext,
  })
  await insertLogEntries(client, playerId, returnLogs.mission)

  const banterLogs = await buildBanterLog(client, playerId, logContext)
  if (banterLogs) await insertLogEntries(client, playerId, banterLogs.mission)

  await client.query(
    `UPDATE mission_instances SET
      forced_return = TRUE, return_started_at = NOW(), progress_at_return = progress, phase = 'RETURN'
     WHERE id = $1`,
    [instance.id],
  )

  return { ok: true }
}

async function refreshCandidates(client, playerId, count = 5) {
  await client.query('DELETE FROM candidates WHERE player_id = $1', [playerId])
  const player = (await client.query('SELECT * FROM players WHERE id = $1', [playerId])).rows[0]
  await client.query('UPDATE players SET next_candidate_id = 1 WHERE id = $1', [playerId])
  await generateCandidatesForPlayer(client, { ...player, next_candidate_id: 1 }, count)
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
    'SELECT max_recruits, max_available_missions FROM players WHERE id = $1',
    [playerId],
  )
  const player = playerResult.rows[0]

  const recruitsResult = await client.query(
    'SELECT * FROM recruits WHERE player_id = $1 ORDER BY id',
    [playerId],
  )
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
    instancesResult.rows.map(row => [row.template_id, row]),
  )

  const missions = templatesResult.rows.map(t => {
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
      assignedShipId,
      status,
    }
  })

  const missionStates = {}
  for (const instance of instancesResult.rows) {
    if (instance.status !== 'in_progress') continue
    const template = templatesResult.rows.find(t => t.id === instance.template_id)
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

  const visibleMissions = missions
    .filter(m => m.status !== 'failed' && m.status !== 'success')
    .slice(0, player.max_available_missions)

  return {
    player: {
      maxNumberOfRecruits: player.max_recruits,
      maxAvailableMissions: player.max_available_missions,
    },
    recruits: recruitsResult.rows.map(rowToRecruit),
    candidates: candidatesResult.rows.map(rowToCandidate),
    ships: shipsResult.rows,
    missions: visibleMissions,
    missionStates,
    globalLogs,
    missionLogs,
  }
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

async function initGame() {
  return withTransaction(async (client) => {
    await bootstrapPlayer(client)
  })
}

async function syncGame() {
  return withTransaction(async (client) => {
    await bootstrapPlayer(client)
    await syncMissions(client, DEFAULT_PLAYER_ID)
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
  hireCandidate: (candidateId) => withTransaction(async (client) => {
    await bootstrapPlayer(client)
    const recruit = await hireCandidate(client, DEFAULT_PLAYER_ID, candidateId)
    if (!recruit) return { error: 'Recruitment failed' }
    await syncMissions(client, DEFAULT_PLAYER_ID)
    return { recruit, state: await buildGameState(client, DEFAULT_PLAYER_ID) }
  }),
  startMission: (templateId, shipId, speedConsumableId) => withTransaction(async (client) => {
    await bootstrapPlayer(client)
    const result = await startMission(client, DEFAULT_PLAYER_ID, templateId, shipId, speedConsumableId)
    if (result.error) return result
    await syncMissions(client, DEFAULT_PLAYER_ID)
    return { state: await buildGameState(client, DEFAULT_PLAYER_ID) }
  }),
  stopMission: (templateId) => withTransaction(async (client) => {
    const result = await stopMission(client, DEFAULT_PLAYER_ID, templateId)
    if (result.error) return result
    return { state: await buildGameState(client, DEFAULT_PLAYER_ID) }
  }),
  forceReturnMission: (templateId) => withTransaction(async (client) => {
    const result = await forceReturnMission(client, DEFAULT_PLAYER_ID, templateId)
    if (result.error) return result
    await syncMissions(client, DEFAULT_PLAYER_ID)
    return { state: await buildGameState(client, DEFAULT_PLAYER_ID) }
  }),
  refreshCandidates: (count = 5) => withTransaction(async (client) => {
    await bootstrapPlayer(client)
    await refreshCandidates(client, DEFAULT_PLAYER_ID, count)
    return { state: await buildGameState(client, DEFAULT_PLAYER_ID) }
  }),
  renameRecruit: (recruitId, newName) => withTransaction(async (client) => {
    const recruit = await renameRecruit(client, DEFAULT_PLAYER_ID, recruitId, newName)
    if (!recruit) return { error: 'Recruit not found' }
    return { recruit, state: await buildGameState(client, DEFAULT_PLAYER_ID) }
  }),
}
