// Orchestrates the OGL graph-walking Opera engine: instantiating templates,
// advancing a walk as far as it can go automatically, and pausing at
// whatever the player needs to actually do next -- which, revealed one
// beat at a time as each resolves, is exactly what makes an opera read as
// "a linear list of tasks" from the player's side even though the
// underlying template can branch.
//
// Unlike opera-forge's editor-only runGeneration() (a single synchronous
// walk to completion against a scripted mockState), a live walk must pause
// for real gameplay that can take minutes or hours. See advanceInstance()'s
// own comment for the state machine this implies.

const { getOperaDefinition, getGenerationPoolDefinitions } = require('../operaLoader')
const OperaGraph = require('../domain/operaGraph')
const { insertLogEntries } = require('./log.service')
const { pickOne } = require('../utils/random')
const { generateMission } = require('../engine/missionGenerator')
const { loadData } = require('../dataLoader')

// Required lazily (at call time, inside the functions that use it) rather
// than at module load: recruit.service.js pulls in consumable.service.js/
// equipment.service.js, both of which require *this* module back (for
// their own recordOperaAction hooks) -- a top-level require here would
// resolve to their still-empty exports mid-load. Deferring to call time
// sidesteps the cycle entirely, since by then every module has finished
// loading regardless of which one the app happened to require first.
function getRecruitService() {
  return require('./recruit.service')
}

const OPERA_LOG_TAG = '[SYS]'
const TUTORIAL_TEMPLATE_ID = 'tutorial'
const MAX_STEPS = 500

// --- persistence helpers ---------------------------------------------------

async function getInProgressInstances(client, playerId) {
  const result = await client.query(
    `SELECT * FROM opera_instances WHERE player_id = $1 AND status = 'in_progress'`,
    [playerId],
  )
  return result.rows
}

async function getInstanceById(client, playerId, instanceId) {
  const result = await client.query(
    'SELECT * FROM opera_instances WHERE player_id = $1 AND id = $2',
    [playerId, instanceId],
  )
  return result.rows[0] ?? null
}

async function persist(client, instance, state) {
  await client.query('UPDATE opera_instances SET state = $1 WHERE id = $2', [JSON.stringify(state), instance.id])
}

async function log(client, playerId, instance, message) {
  if (!message || !message.trim()) return
  await insertLogEntries(client, playerId, [{ tag: OPERA_LOG_TAG, message, operaId: String(instance.id) }])
}

// --- tag resolution ----------------------------------------------------

// Resolved once per instance and kept stable for the whole playthrough.
// Reuses missionGenerator's own context-building pipeline purely for its
// tag output (climate/faction/clientName/etc. -- see
// opera-forge/server/src/domain/tags.js's TAG_CATALOG) rather than
// generating a throwaway mission_templates row.
function resolveTags() {
  const mission = generateMission(loadData(), {})
  return mission.tags
}

// --- seed-key / recruit-binding helpers ---------------------------------

function resolveSeedKey(state, actionType, match) {
  if (!match) return match
  if ((actionType === 'complete_quest' || actionType === 'send_recruit_to_quest') && match.templateId != null) {
    const real = state.seedKeys?.mission?.[match.templateId]
    if (real != null) return { ...match, templateId: real }
  }
  return match
}

function conditionMatchesAction(state, condition, actionType, payload) {
  const params = condition.params ?? {}
  if (params.actionType !== actionType) return false
  const match = resolveSeedKey(state, actionType, params.match)
  return OperaGraph.matchesAction({ actionType: params.actionType, match }, actionType, payload)
}

// Opportunistically remembers "the recruit this playthrough is about" the
// first time a resolved action carries a concrete recruitId -- apply_perk/
// apply_flaw/adjust_stat effects target this recruit (see the opera-template
// skill's "recruit personal arcs are generic/archetypal" guidance: a
// template fires for whichever recruit triggers it).
function bindRecruit(state, payload) {
  if (!state.boundRecruitId && payload?.recruitId != null) {
    state.boundRecruitId = payload.recruitId
  } else if (!state.boundRecruitId && Array.isArray(payload?.recruitIds) && payload.recruitIds.length > 0) {
    state.boundRecruitId = payload.recruitIds[0]
  }
}

async function resolveEffectRecruitId(client, playerId, state) {
  if (state.boundRecruitId != null) return state.boundRecruitId
  const result = await client.query(
    'SELECT id FROM recruits WHERE player_id = $1 AND deleted_at IS NULL ORDER BY random() LIMIT 1',
    [playerId],
  )
  return result.rows[0]?.id ?? null
}

// --- condition evaluation ------------------------------------------------

async function playerHasItem(client, playerId, itemName) {
  const consumable = await client.query(
    'SELECT 1 FROM consumables WHERE player_id = $1 AND name = $2 LIMIT 1',
    [playerId, itemName],
  )
  if (consumable.rows.length > 0) return true
  const equipment = await client.query(
    'SELECT 1 FROM equipment WHERE player_id = $1 AND name = $2 LIMIT 1',
    [playerId, itemName],
  )
  return equipment.rows.length > 0
}

// crew_threshold has no inherent ship in an opera's context -- interpreted
// as the crew size of the bound recruit's current ship (0 if unbound or
// unassigned), the closest available anchor.
async function boundShipCrewCount(client, playerId, state) {
  if (state.boundRecruitId == null) return 0
  const result = await client.query(
    'SELECT crew FROM ships WHERE player_id = $1 AND deleted_at IS NULL AND $2 = ANY(crew)',
    [playerId, state.boundRecruitId],
  )
  return result.rows[0]?.crew?.length ?? 0
}

// `action` is {actionType, payload} for the one incoming event this pass is
// reacting to (or null during a plain auto-advance) -- an action_performed
// condition can only ever be satisfied when it matches that single event,
// never retroactively or speculatively.
async function evaluateCondition(client, playerId, state, condition, ctx, action) {
  const p = condition.params ?? {}
  switch (condition.type) {
    case 'chance':
      return Math.random() * 100 < p.percentage
    case 'has_item':
      return playerHasItem(client, playerId, p.itemName)
    case 'previous_outcome':
      return ctx.lastOutcome === p.equals
    case 'crew_threshold':
      return OperaGraph.compare(await boundShipCrewCount(client, playerId, state), p.operator, p.value)
    case 'action_performed':
      return action != null && conditionMatchesAction(state, condition, action.actionType, action.payload)
    case 'choice_made':
      return ctx.lastChoice === p.optionId
    default:
      return false
  }
}

async function linkSatisfied(client, playerId, state, link, ctx, action) {
  for (const condition of link.conditions ?? []) {
    if (!(await evaluateCondition(client, playerId, state, condition, ctx, action))) return false
  }
  return true
}

// --- effects / seeds / missions ------------------------------------------

async function applyEffect(client, playerId, state, effect) {
  const p = effect.params ?? {}
  switch (effect.type) {
    case 'give_item':
      await getRecruitService().giveItem(client, playerId, p.itemName)
      return
    case 'apply_perk': {
      const recruitId = await resolveEffectRecruitId(client, playerId, state)
      if (recruitId != null) await getRecruitService().applyPerk(client, playerId, recruitId, p.perkName)
      return
    }
    case 'apply_flaw': {
      const recruitId = await resolveEffectRecruitId(client, playerId, state)
      if (recruitId != null) await getRecruitService().applyFlaw(client, playerId, recruitId, p.flawName)
      return
    }
    case 'adjust_stat': {
      const recruitId = await resolveEffectRecruitId(client, playerId, state)
      if (recruitId != null) await getRecruitService().adjustAttribute(client, playerId, recruitId, p.attribute, p.amount)
      return
    }
  }
}

// Generates a mission via the same procedural pipeline the real mission
// board uses. A blocking 'mission' node's authored {title, description,
// difficulty, tags} (see validateMissionParams) overwrites the procedural
// name/description; a 'seed' node's mission target only ever validates a
// templateId (see validateSeedParams -- it has no title/description field
// at all), so its own optional `note` is used as flavor if present,
// otherwise the procedural name/description stand as-is. Tagged with
// opera_instance_id so generateMissionBatch()'s unstarted-template sweep
// (game.service.js) never discards it mid-opera.
async function insertOperaMission(client, playerId, instanceId, missionSpec, tags) {
  const generated = generateMission(loadData(), {
    difficulty: missionSpec.difficulty,
    planetTags: missionSpec.tags ?? [],
  })
  const name = missionSpec.title ? OperaGraph.render(missionSpec.title, tags).text : generated.name
  const description = missionSpec.description ? OperaGraph.render(missionSpec.description, tags).text : generated.description

  const player = (await client.query('SELECT next_template_id FROM players WHERE id = $1 FOR UPDATE', [playerId])).rows[0]
  const templateId = player.next_template_id

  await client.query(
    `INSERT INTO mission_templates (id, name, description, difficulty, events, planet, opera_instance_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [templateId, name, description, generated.difficulty, JSON.stringify(generated.events), JSON.stringify(generated.planet), instanceId],
  )
  await client.query('UPDATE players SET next_template_id = next_template_id + 1 WHERE id = $1', [playerId])
  return templateId
}

async function fireSeeds(client, playerId, instance, state, seeds) {
  for (const seed of seeds ?? []) {
    if (seed.target === 'shop') {
      // itemName must already exist in the shop_items master catalog --
      // OGL's seed schema carries no price/stats/type, so it can only
      // guarantee an existing item's rotation presence (already automatic
      // for is_quest_item rows, see shop.service.js's drawShopRotation),
      // never invent a new one. Nothing to do here but let purchase_quest_item
      // gates match by name, same as they always have.
      const exists = (await client.query('SELECT 1 FROM shop_items WHERE name = $1', [seed.params.itemName])).rows.length > 0
      if (!exists) console.warn(`[opera] seed shop item "${seed.params.itemName}" not found in shop_items catalog`)
    } else if (seed.target === 'mission') {
      const templateId = await insertOperaMission(client, playerId, instance.id, {
        title: seed.note,
      }, state.tags)
      state.seedKeys = state.seedKeys ?? {}
      state.seedKeys.mission = state.seedKeys.mission ?? {}
      state.seedKeys.mission[seed.params.templateId] = templateId
    } else if (seed.target === 'candidate') {
      await getRecruitService().insertSeededCandidate(client, playerId, seed.params.seedId)
    }
  }
}

// --- the walk --------------------------------------------------------------

function indexLinks(def) {
  const nodesById = new Map(def.nodes.map(n => [n.id, n]))
  const linksByFrom = new Map()
  for (const link of def.links) {
    if (!linksByFrom.has(link.from)) linksByFrom.set(link.from, [])
    linksByFrom.get(link.from).push(link)
  }
  for (const links of linksByFrom.values()) links.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  return { nodesById, linksByFrom }
}

function pushTask(state, entry) {
  state.log = state.log ?? []
  state.log.push(entry)
}

async function finish(client, playerId, instance, state, outcome) {
  const status = outcome === 'failure' ? 'failed' : 'completed'
  await client.query(
    `UPDATE opera_instances SET status = $1, state = $2, completed_at = NOW() WHERE id = $3`,
    [status, JSON.stringify(state), instance.id],
  )
  // Unconditional, not just for slotted instances: this is also the tutorial
  // (slot_index IS NULL) finishing, which is precisely trigger #1 for
  // opening the first concurrent-opera slots -- maintainOperaSlots itself
  // no-ops until the tutorial is done, so this is cheap either way.
  await maintainOperaSlots(client, playerId)
}

// The core walk. `action` is null for a plain auto-advance, or
// {actionType, payload} when reacting to a real gameplay action, or
// {choiceOptionId} when reacting to a resolved choice. Runs forward through
// every node it can resolve synchronously (story effects, check rolls, seed
// declarations, freely-satisfied links) and stops -- persisting state -- the
// instant it reaches an end node, a fresh mission/choice node (these
// *become* the current task), or a node whose only viable outgoing link is
// still waiting on an action_performed condition nothing has satisfied yet.
async function advanceInstance(client, playerId, instance, def, action = null) {
  const state = instance.state && Object.keys(instance.state).length > 0
    ? instance.state
    : { currentNodeId: def.nodes.find(n => n.type === 'start').id, tags: resolveTags(), log: [], awaiting: null }

  const { nodesById, linksByFrom } = indexLinks(def)
  const ctx = { lastOutcome: null, lastChoice: null }
  let steps = 0

  while (steps++ < MAX_STEPS) {
    const current = nodesById.get(state.currentNodeId)
    if (!current) break

    if (state.awaiting === 'mission') {
      if (action?.actionType === 'complete_quest' && Number(action.payload.templateId) === state.pendingMissionTemplateId) {
        bindRecruit(state, action.payload)
        ctx.lastOutcome = action.payload.outcome
        state.awaiting = 'link'
        state.pendingMissionTemplateId = null
        action = null // consumed
      } else {
        await persist(client, instance, state)
        return
      }
    } else if (state.awaiting === 'choice') {
      if (action?.choiceOptionId) {
        ctx.lastChoice = action.choiceOptionId
        state.awaiting = 'link'
        state.pendingChoice = null
        action = null
      } else {
        await persist(client, instance, state)
        return
      }
    } else if (state.awaiting === null || state.awaiting === undefined) {
      if (current.type === 'start') {
        if (current.text) await log(client, playerId, instance, OperaGraph.render(current.text, state.tags).text)
        state.awaiting = 'link'
      } else if (current.type === 'story') {
        for (const effect of current.effects ?? []) await applyEffect(client, playerId, state, effect)
        const rendered = OperaGraph.render(current.text, state.tags)
        pushTask(state, { nodeId: current.id, type: 'story', text: rendered.text })
        await log(client, playerId, instance, rendered.text)
        state.awaiting = 'link'
      } else if (current.type === 'check') {
        ctx.lastOutcome = Math.random() * 100 < (current.roll?.params?.percentage ?? 0) ? 'success' : 'failure'
        state.awaiting = 'link'
      } else if (current.type === 'seed') {
        await fireSeeds(client, playerId, instance, state, current.seeds)
        state.awaiting = 'link'
      } else if (current.type === 'mission') {
        const templateId = await insertOperaMission(client, playerId, instance.id, current.mission, state.tags)
        state.pendingMissionTemplateId = templateId
        state.awaiting = 'mission'
        const rendered = OperaGraph.render(current.mission.title, state.tags)
        pushTask(state, { nodeId: current.id, type: 'mission', text: rendered.text, templateId, status: 'current' })
        await log(client, playerId, instance, `New task: ${rendered.text}`)
        await persist(client, instance, state)
        return
      } else if (current.type === 'choice') {
        const rendered = OperaGraph.render(current.text, state.tags)
        const options = (current.choiceOptions ?? []).map(o => ({ id: o.id, label: OperaGraph.render(o.label, state.tags).text }))
        state.pendingChoice = { nodeId: current.id, text: rendered.text, options }
        state.awaiting = 'choice'
        pushTask(state, { nodeId: current.id, type: 'choice', text: rendered.text, options, status: 'current' })
        await log(client, playerId, instance, rendered.text)
        await persist(client, instance, state)
        return
      } else if (current.type === 'end') {
        const rendered = OperaGraph.render(current.text, state.tags)
        pushTask(state, { nodeId: current.id, type: 'end', text: rendered.text, outcome: current.outcome })
        await log(client, playerId, instance, rendered.text)
        await finish(client, playerId, instance, state, current.outcome)
        return
      }
    }

    // state.awaiting === 'link': find the first candidate link satisfiable
    // right now, given this pass's single incoming action (if any).
    const candidates = linksByFrom.get(current.id) ?? []
    let chosen = null
    for (const link of candidates) {
      if (await linkSatisfied(client, playerId, state, link, ctx, action)) {
        chosen = link
        break
      }
    }

    if (!chosen) {
      await persist(client, instance, state)
      return
    }

    if (chosen.conditions?.some(c => c.type === 'action_performed') && action) {
      bindRecruit(state, action.payload)
    }

    if (current.completionText) {
      await log(client, playerId, instance, OperaGraph.render(current.completionText, state.tags).text)
    }
    state.currentNodeId = chosen.to
    state.awaiting = null
    ctx.lastOutcome = null
    ctx.lastChoice = null
    action = null // a single incoming event only ever resolves one gate
  }

  await persist(client, instance, state)
}

// --- reactive entry points -------------------------------------------------

// Called once per in-progress instance from the single recordOperaAction()
// hook every gameplay action site already calls into -- none of those ~9
// call sites change.
async function recordOperaAction(client, playerId, actionType, payload = {}) {
  try {
    const instances = await getInProgressInstances(client, playerId)
    for (const instance of instances) {
      const def = getOperaDefinition(instance.template_id)
      if (!def) continue // removed/renamed template; don't crash live gameplay
      await advanceInstance(client, playerId, instance, def, { actionType, payload })
    }
  } catch (err) {
    console.error(`[opera] recordOperaAction failed for action "${actionType}"`, err)
  }
}

async function resolveChoice(client, playerId, instanceId, optionId) {
  const instance = await getInstanceById(client, playerId, instanceId)
  if (!instance || instance.status !== 'in_progress') return { error: 'Opera not found' }
  if (instance.state?.awaiting !== 'choice') return { error: 'No pending choice' }
  const validOption = instance.state.pendingChoice?.options?.some(o => o.id === optionId)
  if (!validOption) return { error: 'Invalid option' }

  const def = getOperaDefinition(instance.template_id)
  if (!def) return { error: 'Opera template not found' }
  await advanceInstance(client, playerId, instance, def, { choiceOptionId: optionId })
  return { success: true }
}

// --- instance creation & slot maintenance ----------------------------------

async function createInstance(client, playerId, templateId, slotIndex) {
  const result = await client.query(
    `INSERT INTO opera_instances (player_id, template_id, slot_index, status, started_at)
     VALUES ($1, $2, $3, 'in_progress', NOW()) RETURNING *`,
    [playerId, templateId, slotIndex],
  )
  const instance = result.rows[0]
  const def = getOperaDefinition(templateId)
  if (def) await advanceInstance(client, playerId, instance, def, null)
  return instance
}

// Starts the singleton tutorial for a brand-new player, if it isn't running
// or already completed. Called from bootstrapPlayer alongside
// maintainOperaSlots.
async function ensureTutorial(client, playerId) {
  const existing = await client.query(
    `SELECT 1 FROM opera_instances WHERE player_id = $1 AND template_id = $2`,
    [playerId, TUTORIAL_TEMPLATE_ID],
  )
  if (existing.rows.length > 0) return
  if (!getOperaDefinition(TUTORIAL_TEMPLATE_ID)) return
  await createInstance(client, playerId, TUTORIAL_TEMPLATE_ID, null)
}

// Guards against unbounded recursion: finish() calls maintainOperaSlots
// unconditionally (see its own comment), and createInstance() below walks
// the freshly-created instance immediately -- if a template ever reached
// its end node with no player-facing gate at all (a same-call instant
// completion), that walk's own finish() would re-enter maintainOperaSlots
// while the outer call is still mid-loop, which would just create *another*
// instantly-completing instance for the same slot, forever. A real template
// always requires at least one player action before an ending, so this is
// purely defensive -- but cheap insurance against a template shape the
// engine doesn't otherwise forbid.
const maintainInProgress = new Set()

// Fills every empty concurrent-opera slot, once the tutorial is done. Picks
// a template not already active in one of this player's other slots,
// falling back to allowing repeats once the pool is exhausted. Called from
// bootstrapPlayer, right after any slotted instance reaches an end node, and
// after every self-upgrade purchase (see self.routes.js).
async function maintainOperaSlots(client, playerId) {
  if (maintainInProgress.has(playerId)) return
  maintainInProgress.add(playerId)
  try {
    await maintainOperaSlotsInner(client, playerId)
  } finally {
    maintainInProgress.delete(playerId)
  }
}

async function maintainOperaSlotsInner(client, playerId) {
  const tutorial = (await client.query(
    `SELECT status FROM opera_instances WHERE player_id = $1 AND template_id = $2`,
    [playerId, TUTORIAL_TEMPLATE_ID],
  )).rows[0]
  if (!tutorial || tutorial.status !== 'completed') return

  const player = (await client.query('SELECT opera_slot_capacity FROM players WHERE id = $1', [playerId])).rows[0]
  const capacity = player.opera_slot_capacity

  const active = (await client.query(
    `SELECT slot_index, template_id FROM opera_instances
     WHERE player_id = $1 AND status = 'in_progress' AND slot_index IS NOT NULL`,
    [playerId],
  )).rows
  const occupiedSlots = new Set(active.map(r => r.slot_index))
  const activeTemplateIds = new Set(active.map(r => r.template_id))

  const pool = getGenerationPoolDefinitions()
  if (pool.length === 0) return

  for (let slot = 0; slot < capacity; slot++) {
    if (occupiedSlots.has(slot)) continue
    const fresh = pool.filter(def => !activeTemplateIds.has(def.id))
    const choice = pickOne(fresh.length > 0 ? fresh : pool)
    await createInstance(client, playerId, choice.id, slot)
    activeTemplateIds.add(choice.id)
  }
}

// --- read model for the client ---------------------------------------------

function summarizeInstance(instance, def) {
  const state = instance.state ?? {}
  const tasks = (state.log ?? []).map(entry => ({ ...entry, status: 'done' }))
  // 'link' covers a plain action_performed-gated task (e.g. "type split-v")
  // just as much as a pending mission/choice does -- in all three cases the
  // walk is stopped at the last-pushed task, waiting on the player.
  if (state.awaiting === 'mission' || state.awaiting === 'choice' || state.awaiting === 'link') {
    if (tasks.length > 0) tasks[tasks.length - 1].status = 'current'
  }
  return {
    id: String(instance.id),
    templateId: instance.template_id,
    title: def?.title ?? instance.template_id,
    description: def?.description ?? '',
    status: instance.status,
    slotIndex: instance.slot_index,
    tasks,
    pendingChoice: state.awaiting === 'choice' ? state.pendingChoice : null,
  }
}

// In-progress instances (every active slot), plus the tutorial in whatever
// state it's in (including completed, so its final beat stays visible) --
// completed pooled operas drop off the list once maintainOperaSlots
// replaces them, rather than accumulating forever.
async function getOperaState(client, playerId) {
  const instances = (await client.query(
    `SELECT * FROM opera_instances
     WHERE player_id = $1 AND (status = 'in_progress' OR template_id = $2)
     ORDER BY id`,
    [playerId, TUTORIAL_TEMPLATE_ID],
  )).rows
  return instances.map(instance => summarizeInstance(instance, getOperaDefinition(instance.template_id)))
}

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

async function ensureOperasForPlayer(client, playerId) {
  try {
    await ensureTutorial(client, playerId)
    await maintainOperaSlots(client, playerId)
  } catch (err) {
    console.error('[opera] ensureOperasForPlayer failed', err)
  }
}

module.exports = {
  ensureOperasForPlayer,
  maintainOperaSlots,
  recordOperaAction,
  resolveChoice,
  getOperaState,
  getOperaLogs,
}
