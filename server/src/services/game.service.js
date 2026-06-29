const fs = require('fs')
const path = require('path')
const { pool } = require('../db/pool')
const { rollAction, rollDie, rollInRange } = require('./dice.service')
const { generateCandidate, rowToCandidate, rowToRecruit, computeMaxHp } = require('../domain/recruit')
const { DURATION_PER_EVENT_MS, phaseFromProgress, progressFromElapsed } = require('../domain/mission')
const { insertLogEntries, buildPhaseLogs, buildEventResultLogs } = require('./log.service')

const DEFAULT_PLAYER_ID = 1
const DATA_DIR = path.join(__dirname, '../../data')

function loadJson(name) {
  const filePath = path.join(DATA_DIR, name)
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  }
  const fallback = path.join(__dirname, '../../../mercenai/src/app/data', name)
  return JSON.parse(fs.readFileSync(fallback, 'utf8'))
}

async function seedMissionTemplates(client) {
  const missions = loadJson('missions.json')
  for (const mission of missions) {
    await client.query(
      `INSERT INTO mission_templates (id, name, description, difficulty, events)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         difficulty = EXCLUDED.difficulty,
         events = EXCLUDED.events`,
      [mission.id, mission.name, mission.description, mission.difficulty, JSON.stringify(mission.events)],
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

async function damageRecruit(client, playerId, recruitId, amount) {
  const row = await client.query(
    'SELECT * FROM recruits WHERE player_id = $1 AND id = $2 FOR UPDATE',
    [playerId, recruitId],
  )
  if (row.rows.length === 0 || row.rows[0].status === 'dead') return null

  const hp = Math.max(0, row.rows[0].hp - amount)
  const status = hp === 0 ? 'dead' : row.rows[0].status
  await client.query(
    'UPDATE recruits SET hp = $1, status = $2 WHERE player_id = $3 AND id = $4',
    [hp, status, playerId, recruitId],
  )
  return getRecruit(client, playerId, recruitId)
}

async function setRecruitStatus(client, playerId, recruitId, status) {
  await client.query(
    `UPDATE recruits SET status = $1
     WHERE player_id = $2 AND id = $3 AND status != 'dead'`,
    [status, playerId, recruitId],
  )
}

async function resolveEvents(client, playerId, instance, template, recruitRow) {
  const events = template.events
  const eventResults = [...instance.event_results]
  let failed = instance.failed
  let rewardForfeited = instance.reward_forfeited
  let currentEventIndex = instance.current_event_index
  const recruitName = recruitRow.name
  const missionId = template.id
  const logs = []

  for (let i = currentEventIndex; i < events.length; i++) {
    if (failed) break

    const recruit = await client.query(
      'SELECT * FROM recruits WHERE player_id = $1 AND id = $2',
      [playerId, instance.recruit_id],
    )
    if (recruit.rows.length === 0 || recruit.rows[0].status === 'dead') {
      failed = true
      break
    }

    const event = events[i]
    const attrs = recruit.rows[0].attributes
    const roll = rollAction(attrs[event.attribute])
    const success = roll.total >= event.dc

    const result = {
      eventIndex: i,
      type: event.type,
      attribute: event.attribute,
      d20: roll.d20,
      bonus: roll.bonus,
      diceNotation: roll.diceNotation,
      total: roll.total,
      dc: event.dc,
      success,
    }

    if (success) {
      result.rewardEarned = event.reward
    } else {
      result.consequence = event.failureConsequence

      if (event.failureConsequence === 'HP_LOSS') {
        const hpLost = rollDie(6)
        result.hpLost = hpLost
        const updated = await damageRecruit(client, playerId, instance.recruit_id, hpLost)
        if (!updated || updated.status === 'dead') {
          result.recruitDied = true
          failed = true
          currentEventIndex = i + 1
          eventResults.push(result)
          logs.push(buildEventResultLogs({
            eventResult: result,
            missionId,
            missionName: template.name,
            recruitName,
            recruitPerks: recruitRow.perks,
            recruitFlaws: recruitRow.flaws,
            recruitPersonality: recruitRow.personality,
          }))
          await insertLogEntries(client, playerId, [
            ...logs[logs.length - 1].mission,
            ...logs[logs.length - 1].global,
          ])
          return { failed, rewardForfeited, currentEventIndex, eventResults, forceReturn: false, completed: true }
        }
      } else if (event.failureConsequence === 'FORCED_DEPARTURE') {
        failed = true
        currentEventIndex = i + 1
        eventResults.push(result)
        logs.push(buildEventResultLogs({
          eventResult: result,
          missionId,
          missionName: template.name,
          recruitName,
          recruitPerks: recruitRow.perks,
          recruitFlaws: recruitRow.flaws,
          recruitPersonality: recruitRow.personality,
        }))
        await insertLogEntries(client, playerId, [
          ...logs[logs.length - 1].mission,
          ...logs[logs.length - 1].global,
        ])
        return { failed, rewardForfeited, currentEventIndex, eventResults, forceReturn: true, completed: false }
      } else {
        rewardForfeited = true
      }
    }

    currentEventIndex = i + 1
    eventResults.push(result)
    const eventLogs = buildEventResultLogs({
      eventResult: result,
      missionId,
      missionName: template.name,
      recruitName,
      recruitPerks: recruitRow.perks,
      recruitFlaws: recruitRow.flaws,
      recruitPersonality: recruitRow.personality,
    })
    await insertLogEntries(client, playerId, [...eventLogs.mission, ...eventLogs.global])
  }

  return { failed, rewardForfeited, currentEventIndex, eventResults, forceReturn: false, completed: false }
}

async function completeMission(client, playerId, instance, template, failed) {
  const status = failed ? 'failed' : 'success'
  if (!failed) {
    await setRecruitStatus(client, playerId, instance.recruit_id, 'available')
  }

  const termineeLogs = buildPhaseLogs({
    phase: 'TERMINEE',
    failed,
    rewardForfeited: instance.reward_forfeited,
    missionId: template.id,
    missionName: template.name,
    missionDifficulty: template.difficulty,
    recruitName: (await client.query(
      'SELECT name FROM recruits WHERE player_id = $1 AND id = $2',
      [playerId, instance.recruit_id],
    )).rows[0]?.name ?? String(instance.recruit_id),
  })
  await insertLogEntries(client, playerId, [...termineeLogs.mission, ...termineeLogs.global])
}

async function advanceMission(client, playerId, instance, template, now) {
  const events = template.events
  const durationMs = events.length * DURATION_PER_EVENT_MS
  let progress
  let phase

  if (instance.forced_return && instance.return_started_at) {
    const returnElapsed = now - new Date(instance.return_started_at).getTime()
    const returnDurationMs = (instance.progress_at_return ?? 0) <= 33
      ? ((instance.progress_at_return ?? 0) / 100) * durationMs
      : durationMs / 3
    const returnTicks = Math.max(1, returnDurationMs)
    const delta = Math.min(
      100 - instance.progress_at_return,
      Math.round((returnElapsed / returnTicks) * (100 - instance.progress_at_return)),
    )
    progress = Math.min(100, instance.progress_at_return + delta)
    phase = progress >= 100 ? 'TERMINEE' : 'RETOUR'
  } else {
    const elapsed = now - new Date(instance.started_at).getTime()
    progress = progressFromElapsed(events.length, elapsed)
    phase = phaseFromProgress(progress)
  }

  let {
    failed,
    reward_forfeited: rewardForfeited,
    current_event_index: currentEventIndex,
    event_results: eventResults,
    phase: storedPhase,
  } = instance

  const pastEventPhase = progress > 33 || phase === 'EVENEMENT' || phase === 'RETOUR' || phase === 'TERMINEE'

  if (pastEventPhase && currentEventIndex < events.length) {
    if (storedPhase === 'EN_ROUTE') {
      const eventPhaseLogs = buildPhaseLogs({
        phase: 'EVENEMENT',
        failed: false,
        rewardForfeited,
        missionId: template.id,
        missionName: template.name,
        missionDifficulty: template.difficulty,
        recruitName: (await client.query(
          'SELECT name FROM recruits WHERE player_id = $1 AND id = $2',
          [playerId, instance.recruit_id],
        )).rows[0]?.name ?? String(instance.recruit_id),
      })
      await insertLogEntries(client, playerId, eventPhaseLogs.mission)
    }

    const recruitRow = (await client.query(
      'SELECT * FROM recruits WHERE player_id = $1 AND id = $2',
      [playerId, instance.recruit_id],
    )).rows[0]

    const resolution = await resolveEvents(client, playerId, instance, template, recruitRow)
    failed = resolution.failed
    rewardForfeited = resolution.rewardForfeited
    currentEventIndex = resolution.currentEventIndex
    eventResults = resolution.eventResults

    if (resolution.forceReturn) {
      await client.query(
        `UPDATE mission_instances SET
          failed = $1, reward_forfeited = $2, current_event_index = $3, event_results = $4,
          forced_return = TRUE, return_started_at = NOW(), progress_at_return = $5, phase = 'RETOUR', progress = $5
         WHERE id = $6`,
        [failed, rewardForfeited, currentEventIndex, JSON.stringify(eventResults), progress, instance.id],
      )
      const retourLogs = buildPhaseLogs({
        phase: 'RETOUR',
        failed: true,
        rewardForfeited,
        missionId: template.id,
        missionName: template.name,
        missionDifficulty: template.difficulty,
        recruitName: recruitRow.name,
      })
      await insertLogEntries(client, playerId, retourLogs.mission)
      return
    }

    if (resolution.completed && failed) {
      await client.query(
        `UPDATE mission_instances SET
          failed = $1, reward_forfeited = $2, current_event_index = $3, event_results = $4,
          phase = 'TERMINEE', progress = 100, status = 'failed'
         WHERE id = $5`,
        [failed, rewardForfeited, currentEventIndex, JSON.stringify(eventResults), instance.id],
      )
      await completeMission(client, playerId, { ...instance, failed, reward_forfeited: rewardForfeited }, template, true)
      return
    }
  }

  if (phase === 'RETOUR' && storedPhase !== 'RETOUR' && !instance.forced_return) {
    const recruitName = (await client.query(
      'SELECT name FROM recruits WHERE player_id = $1 AND id = $2',
      [playerId, instance.recruit_id],
    )).rows[0]?.name ?? String(instance.recruit_id)
    const retourLogs = buildPhaseLogs({
      phase: 'RETOUR',
      failed,
      rewardForfeited,
      missionId: template.id,
      missionName: template.name,
      missionDifficulty: template.difficulty,
      recruitName,
    })
    await insertLogEntries(client, playerId, retourLogs.mission)
  }

  if (phase === 'TERMINEE') {
    await client.query(
      `UPDATE mission_instances SET
        phase = 'TERMINEE', progress = 100, failed = $1, reward_forfeited = $2,
        current_event_index = $3, event_results = $4, status = $5
       WHERE id = $6`,
      [failed, rewardForfeited, currentEventIndex, JSON.stringify(eventResults), failed ? 'failed' : 'success', instance.id],
    )
    await completeMission(client, playerId, { ...instance, failed, reward_forfeited: rewardForfeited }, template, failed)
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

async function startMission(client, playerId, templateId, recruitId) {
  const templateResult = await client.query(
    'SELECT * FROM mission_templates WHERE id = $1',
    [templateId],
  )
  if (templateResult.rows.length === 0) return { error: 'Mission introuvable' }

  const existing = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1 AND template_id = $2',
    [playerId, templateId],
  )
  if (existing.rows.length > 0) {
    const s = existing.rows[0].status
    return { error: s === 'in_progress' ? 'Mission déjà en cours' : 'Mission déjà effectuée' }
  }

  const recruit = await client.query(
    'SELECT * FROM recruits WHERE player_id = $1 AND id = $2',
    [playerId, recruitId],
  )
  if (recruit.rows.length === 0 || recruit.rows[0].status === 'dead') {
    return { error: 'Recrue introuvable ou morte' }
  }

  const busy = await client.query(
    `SELECT 1 FROM mission_instances
     WHERE player_id = $1 AND recruit_id = $2 AND status = 'in_progress' AND phase != 'TERMINEE'`,
    [playerId, recruitId],
  )
  if (busy.rows.length > 0) return { error: 'Recrue déjà en mission' }

  await setRecruitStatus(client, playerId, recruitId, 'in_mission')

  const inserted = await client.query(
    `INSERT INTO mission_instances
      (player_id, template_id, recruit_id, status, phase, progress, started_at)
     VALUES ($1, $2, $3, 'in_progress', 'EN_ROUTE', 0, NOW())
     RETURNING *`,
    [playerId, templateId, recruitId],
  )

  const template = templateResult.rows[0]
  const phaseLogs = buildPhaseLogs({
    phase: 'EN_ROUTE',
    failed: false,
    rewardForfeited: false,
    missionId: templateId,
    missionName: template.name,
    missionDifficulty: template.difficulty,
    recruitName: recruit.rows[0].name,
  })
  await insertLogEntries(client, playerId, [...phaseLogs.mission, ...phaseLogs.global])

  return { instance: inserted.rows[0] }
}

async function stopMission(client, playerId, templateId) {
  const instance = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1 AND template_id = $2',
    [playerId, templateId],
  )
  if (instance.rows.length === 0) return { error: 'Aucune mission active' }

  const row = instance.rows[0]
  await setRecruitStatus(client, playerId, row.recruit_id, 'available')
  await client.query('DELETE FROM mission_instances WHERE id = $1', [row.id])
  return { ok: true }
}

async function forceReturnMission(client, playerId, templateId) {
  const instanceResult = await client.query(
    'SELECT * FROM mission_instances WHERE player_id = $1 AND template_id = $2',
    [playerId, templateId],
  )
  if (instanceResult.rows.length === 0) return { error: 'Aucune mission active' }

  const instance = instanceResult.rows[0]
  if (instance.phase === 'TERMINEE' || instance.phase === 'RETOUR') {
    return { error: 'Retour déjà en cours ou mission terminée' }
  }

  const template = (await client.query(
    'SELECT * FROM mission_templates WHERE id = $1',
    [instance.template_id],
  )).rows[0]

  const recruitName = (await client.query(
    'SELECT name FROM recruits WHERE player_id = $1 AND id = $2',
    [playerId, instance.recruit_id],
  )).rows[0]?.name ?? String(instance.recruit_id)

  const retourLogs = buildPhaseLogs({
    phase: 'RETOUR',
    failed: instance.failed,
    rewardForfeited: instance.reward_forfeited,
    missionId: templateId,
    missionName: template.name,
    missionDifficulty: template.difficulty,
    recruitName,
  })
  await insertLogEntries(client, playerId, retourLogs.mission)

  await client.query(
    `UPDATE mission_instances SET
      forced_return = TRUE, return_started_at = NOW(), progress_at_return = progress, phase = 'RETOUR'
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
  const recruitsResult = await client.query(
    'SELECT * FROM recruits WHERE player_id = $1 ORDER BY id',
    [playerId],
  )
  const candidatesResult = await client.query(
    'SELECT * FROM candidates WHERE player_id = $1 ORDER BY id',
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
    let assignedRecruitId = null
    if (instance) {
      status = instance.status === 'in_progress' ? 'in_progress' : instance.status
      assignedRecruitId = instance.recruit_id
    }
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      difficulty: t.difficulty,
      events: t.events,
      assignedRecruitId,
      status,
    }
  })

  const missionStates = {}
  for (const instance of instancesResult.rows) {
    if (instance.status !== 'in_progress') continue
    const template = templatesResult.rows.find(t => t.id === instance.template_id)
    missionStates[instance.template_id] = {
      missionId: instance.template_id,
      recruitId: instance.recruit_id,
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

  return {
    recruits: recruitsResult.rows.map(rowToRecruit),
    candidates: candidatesResult.rows.map(rowToCandidate),
    missions,
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
    if (!recruit) return { error: 'Recrutement impossible' }
    await syncMissions(client, DEFAULT_PLAYER_ID)
    return { recruit, state: await buildGameState(client, DEFAULT_PLAYER_ID) }
  }),
  startMission: (templateId, recruitId) => withTransaction(async (client) => {
    await bootstrapPlayer(client)
    const result = await startMission(client, DEFAULT_PLAYER_ID, templateId, recruitId)
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
    if (!recruit) return { error: 'Recrue introuvable' }
    return { recruit, state: await buildGameState(client, DEFAULT_PLAYER_ID) }
  }),
}
