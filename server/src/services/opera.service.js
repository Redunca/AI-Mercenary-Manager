const { getOperaDefinition, getAllOperaDefinitions } = require('../operaLoader')
const { matchStep, listeningSteps, isOperaComplete } = require('../domain/opera')
const { insertLogEntries } = require('./log.service')

const OPERA_LOG_TAG = '[SYS]'

async function getInProgressInstances(client, playerId) {
  const result = await client.query(
    `SELECT * FROM opera_instances WHERE player_id = $1 AND status = 'in_progress'`,
    [playerId],
  )
  return result.rows
}

async function getCompletedStepIds(client, playerId, operaId) {
  const result = await client.query(
    'SELECT step_id FROM opera_step_progress WHERE player_id = $1 AND opera_id = $2',
    [playerId, operaId],
  )
  return result.rows.map(row => row.step_id)
}

// No fallback/auto-generated text: an absent or blank message means this
// transition is deliberately silent (see the plan's "Logging" decision).
async function logIfPresent(client, playerId, operaId, message) {
  if (!message || !message.trim()) return
  await insertLogEntries(client, playerId, [{ tag: OPERA_LOG_TAG, message, operaId }])
}

// Writes the on_start_message of every step that starts listening given the
// (possibly just-updated) set of completed step ids -- used both when an
// opera first starts and right after a step completes, so "before and
// after each step" logging works uniformly in sequential and checklist mode.
async function announceListeningSteps(client, playerId, definition, completedStepIds) {
  for (const step of listeningSteps(definition, completedStepIds, null)) {
    await logIfPresent(client, playerId, definition.id, step.on_start_message)
  }
}

async function startInstance(client, playerId, definition) {
  await client.query(
    `INSERT INTO opera_instances (player_id, opera_id, status, started_at)
     VALUES ($1, $2, 'in_progress', NOW())
     ON CONFLICT (player_id, opera_id) DO NOTHING`,
    [playerId, definition.id],
  )
  await logIfPresent(client, playerId, definition.id, definition.on_start_message)
  await announceListeningSteps(client, playerId, definition, [])
}

// Called from bootstrapPlayer() (already idempotent, already runs on every
// single game action via game.service.js) for every auto_start:true
// definition. Wrapped in the same catch-and-log isolation as
// recordOperaAction(): bootstrapPlayer sits ahead of virtually everything
// the game does, so a bug here must never block a player from doing
// anything else, which would be an even worse blast radius than a single
// missed opera hook.
async function ensureOperasForPlayer(client, playerId) {
  try {
    for (const definition of getAllOperaDefinitions()) {
      if (!definition.auto_start) continue
      const existing = await client.query(
        'SELECT 1 FROM opera_instances WHERE player_id = $1 AND opera_id = $2',
        [playerId, definition.id],
      )
      if (existing.rows.length > 0) continue
      await startInstance(client, playerId, definition)
    }
  } catch (err) {
    console.error('[opera] ensureOperasForPlayer failed', err)
  }
}

async function startOpera(client, playerId, operaId) {
  const definition = getOperaDefinition(operaId)
  if (!definition) return { error: 'Opera not found' }
  if (definition.auto_start) return { error: 'This opera starts automatically' }

  const existing = await client.query(
    'SELECT 1 FROM opera_instances WHERE player_id = $1 AND opera_id = $2',
    [playerId, operaId],
  )
  if (existing.rows.length > 0) return { error: 'Opera already started' }

  await startInstance(client, playerId, definition)
  return { success: true }
}

// The single hook every action site calls, on the same `client`/transaction
// as the real action it's attached to (consistent with how every other
// service function in this codebase takes `client` first, and keeps it
// testable against the fake in-memory clients the rest of the test suite
// already uses). Never throws: a bug in Opera matching -- including an
// unrecognized query against a test double -- is caught and logged here so
// it can never block or roll back the real player action it's attached to
// (see the plan's "hook isolation" decision).
async function recordOperaAction(client, playerId, actionType, payload = {}) {
  try {
    const instances = await getInProgressInstances(client, playerId)
    for (const instance of instances) {
      const definition = getOperaDefinition(instance.opera_id)
      if (!definition) continue // removed/renamed opera; don't crash live gameplay

      const completedStepIds = await getCompletedStepIds(client, playerId, definition.id)
      const candidates = listeningSteps(definition, completedStepIds, actionType)
      const matched = candidates.filter(step => matchStep(step, actionType, payload))
      if (matched.length === 0) continue

      for (const step of matched) {
        await client.query(
          `INSERT INTO opera_step_progress (player_id, opera_id, step_id)
           VALUES ($1, $2, $3) ON CONFLICT (player_id, opera_id, step_id) DO NOTHING`,
          [playerId, definition.id, step.id],
        )
        await logIfPresent(client, playerId, definition.id, step.on_complete_message)
      }

      const newlyCompletedStepIds = [...completedStepIds, ...matched.map(s => s.id)]
      await announceListeningSteps(client, playerId, definition, newlyCompletedStepIds)

      if (isOperaComplete(definition, newlyCompletedStepIds)) {
        await client.query(
          `UPDATE opera_instances SET status = 'completed', completed_at = NOW()
           WHERE player_id = $1 AND opera_id = $2`,
          [playerId, definition.id],
        )
        await logIfPresent(client, playerId, definition.id, definition.on_complete_message)
      }
    }
  } catch (err) {
    console.error(`[opera] recordOperaAction failed for action "${actionType}"`, err)
  }
}

async function getOperaState(client, playerId) {
  const instancesResult = await client.query(
    'SELECT * FROM opera_instances WHERE player_id = $1',
    [playerId],
  )
  const instanceByOperaId = Object.fromEntries(instancesResult.rows.map(row => [row.opera_id, row]))

  const progressResult = await client.query(
    'SELECT opera_id, step_id FROM opera_step_progress WHERE player_id = $1',
    [playerId],
  )
  const completedByOperaId = {}
  for (const row of progressResult.rows) {
    if (!completedByOperaId[row.opera_id]) completedByOperaId[row.opera_id] = new Set()
    completedByOperaId[row.opera_id].add(row.step_id)
  }

  return getAllOperaDefinitions().map(definition => {
    const instance = instanceByOperaId[definition.id]
    const completed = completedByOperaId[definition.id] ?? new Set()
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      autoStart: definition.auto_start,
      stepOrder: definition.step_order,
      status: instance?.status ?? 'new',
      steps: definition.steps.map(step => ({
        id: step.id,
        description: step.description,
        completed: completed.has(step.id),
      })),
    }
  })
}

// Opera log lines partitioned by opera_id, keyed for buildGameState()'s
// operaLogs -- mirrors how missionLogs is built there.
async function getOperaLogs(client, playerId) {
  const result = await client.query(
    `SELECT tag, message, opera_id AS "operaId" FROM log_entries
     WHERE player_id = $1 AND opera_id IS NOT NULL ORDER BY id`,
    [playerId],
  )
  const logs = {}
  for (const row of result.rows) {
    if (!logs[row.operaId]) logs[row.operaId] = []
    logs[row.operaId].push({ tag: row.tag, message: row.message })
  }
  return logs
}

module.exports = {
  ensureOperasForPlayer,
  startOpera,
  recordOperaAction,
  getOperaState,
  getOperaLogs,
}
