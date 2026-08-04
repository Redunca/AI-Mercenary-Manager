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
const { insertLogEntries, buildFactionShiftLog } = require('./log.service')
const RelationshipService = require('./relationship.service')
const FactionService = require('./faction.service')
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
  await client.query('UPDATE opera_instances SET state = $1 WHERE id = $2', [
    JSON.stringify(state),
    instance.id,
  ])
}

async function log(client, playerId, instance, message) {
  if (!message || !message.trim()) return
  await insertLogEntries(client, playerId, [
    { tag: OPERA_LOG_TAG, message, operaId: String(instance.id) },
  ])
}

// --- tag resolution ----------------------------------------------------

// Resolved once per instance and kept stable for the whole playthrough.
// Reuses missionGenerator's own context-building pipeline purely for its
// tag output (climate/faction/clientName/etc. -- see
// opera-forge/server/src/domain/tags.js's TAG_CATALOG) rather than
// generating a throwaway mission_templates row.
//
// The primary draw's mission type only publishes its own `provides` keys
// (see mission-types.json), so a single draw is not enough: e.g. 5 of the
// 6 mission types publish enemyGroupName but only HEIST publishes
// securityGroupName, so a template using {securityGroupName} rendered
// literally ~5 times out of 6 for that instance's entire playthrough. To
// guarantee coverage, fall back to one extra draw per mission type that
// still has an unpublished `provides` key, forced via options.missionType
// so it publishes that key deterministically -- merging in only the keys
// still missing (never overwriting the primary draw's identity, e.g. its
// planet/faction/clientName) so an opera's stable cast doesn't shift mid
// template just because a gap-filling draw happened to run.
function resolveTags() {
  const data = loadData()
  const tags = { ...generateMission(data, {}).tags }

  for (const missionType of data.missionTypes) {
    const missingKeys = Object.keys(missionType.provides).filter((key) => !(key in tags))
    if (missingKeys.length === 0) continue
    const extra = generateMission(data, { missionType: missionType.type })
    for (const key of missingKeys) tags[key] = extra.tags[key]
  }

  return tags
}

// --- seed-key / recruit-binding helpers ---------------------------------

function resolveSeedKey(state, actionType, match) {
  if (!match) return match
  if (
    (actionType === 'complete_quest' || actionType === 'send_recruit_to_quest') &&
    match.templateId != null
  ) {
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
  } else if (
    !state.boundRecruitId &&
    Array.isArray(payload?.recruitIds) &&
    payload.recruitIds.length > 0
  ) {
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

// adjust_relationship needs a second recruit, and Opera has no concept of
// referencing a specific second recruit slot (personal arcs are generic/
// archetypal -- see bindRecruit's comment: a template fires for whichever
// recruit triggers it, never a scripted specific one). The closest generic
// anchor is "a shipmate of the bound recruit" -- same ship lookup as
// boundShipCrewCount, but needs the crew array itself, not just its length.
// Returns null (a no-op for the caller) if the bound recruit has no ship or
// no other crewmate.
async function resolveSecondRecruitId(client, playerId, state) {
  if (state.boundRecruitId == null) return null
  const result = await client.query(
    'SELECT crew FROM ships WHERE player_id = $1 AND deleted_at IS NULL AND $2 = ANY(crew)',
    [playerId, state.boundRecruitId],
  )
  const crew = (result.rows[0]?.crew ?? []).filter(
    (id) => String(id) !== String(state.boundRecruitId),
  )
  if (crew.length === 0) return null
  return crew[Math.floor(Math.random() * crew.length)]
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
      return OperaGraph.compare(
        await boundShipCrewCount(client, playerId, state),
        p.operator,
        p.value,
      )
    case 'action_performed':
      return (
        action != null &&
        conditionMatchesAction(state, condition, action.actionType, action.payload)
      )
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
      if (recruitId != null)
        await getRecruitService().applyPerk(client, playerId, recruitId, p.perkName)
      return
    }
    case 'apply_flaw': {
      const recruitId = await resolveEffectRecruitId(client, playerId, state)
      if (recruitId != null)
        await getRecruitService().applyFlaw(client, playerId, recruitId, p.flawName)
      return
    }
    case 'adjust_stat': {
      const recruitId = await resolveEffectRecruitId(client, playerId, state)
      if (recruitId != null)
        await getRecruitService().adjustAttribute(
          client,
          playerId,
          recruitId,
          p.attribute,
          p.amount,
        )
      return
    }
    case 'adjust_relationship': {
      // No log entry here -- every other effect case is silent too; the
      // node's own authored text carries the narration (see pushTask/log
      // firing once per node, not once per effect).
      const recruitAId = await resolveEffectRecruitId(client, playerId, state)
      if (recruitAId == null) return
      const recruitBId = await resolveSecondRecruitId(client, playerId, state)
      if (recruitBId == null) return
      await RelationshipService.adjustRelationship(
        client,
        playerId,
        recruitAId,
        recruitBId,
        p.amount,
      )
      return
    }
    case 'adjust_faction_reputation': {
      // factionName may be a literal org name or a "{faction}"-style
      // placeholder into this instance's resolved tags (see resolveTags),
      // same rendering convention as node text/labels.
      const factionName = OperaGraph.render(p.factionName, state.tags).text
      const shift = await FactionService.adjustReputation(client, playerId, factionName, p.amount)
      if (shift.previousTier !== shift.newTier) {
        const shiftLogs = buildFactionShiftLog({
          factionName,
          previousTier: shift.previousTier,
          newTier: shift.newTier,
        })
        await insertLogEntries(client, playerId, shiftLogs.global)
      }
      return
    }
  }
}

// Generates a mission via the same procedural pipeline the real mission
// board uses. A blocking 'mission' node's authored {title, description,
// difficulty, tags, missionType, consumesItemName} (see
// validateMissionParams) overwrites the procedural name/description and, if
// missionType is set, restricts which mission type's event pool gets
// sampled (e.g. "EXTRACTION_OP" to guarantee a COMBAT event -- see
// validateMissionParams' comment); consumesItemName is stored as-is and
// spent from the mission's ship inventory once it ends (see
// completeMission()/stopMission() in game.service.js). A 'seed' node's
// mission target only ever validates a templateId (see validateSeedParams --
// it has no title/description/consumesItemName field at all), so its own
// optional `note` is used as flavor if present, otherwise the procedural
// name/description stand as-is. Tagged with opera_instance_id so
// generateMissionBatch()'s unstarted-template sweep (game.service.js) never
// discards it mid-opera.
async function insertOperaMission(client, playerId, instanceId, missionSpec, tags) {
  const generated = generateMission(loadData(), {
    difficulty: missionSpec.difficulty,
    planetTags: missionSpec.tags ?? [],
    missionType: missionSpec.missionType,
  })
  const name = missionSpec.title ? OperaGraph.render(missionSpec.title, tags).text : generated.name
  const description = missionSpec.description
    ? OperaGraph.render(missionSpec.description, tags).text
    : generated.description

  const player = (
    await client.query('SELECT next_template_id FROM players WHERE id = $1 FOR UPDATE', [playerId])
  ).rows[0]
  const templateId = player.next_template_id

  await client.query(
    `INSERT INTO mission_templates
       (id, name, description, difficulty, events, planet, opera_instance_id, consumes_item_name, for_faction, against_faction)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      templateId,
      name,
      description,
      generated.difficulty,
      JSON.stringify(generated.events),
      JSON.stringify(generated.planet),
      instanceId,
      missionSpec.consumesItemName ?? null,
      generated.forFaction,
      generated.againstFaction,
    ],
  )
  await client.query('UPDATE players SET next_template_id = next_template_id + 1 WHERE id = $1', [
    playerId,
  ])
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
      const exists =
        (await client.query('SELECT 1 FROM shop_items WHERE name = $1', [seed.params.itemName]))
          .rows.length > 0
      if (!exists)
        console.warn(
          `[opera] seed shop item "${seed.params.itemName}" not found in shop_items catalog`,
        )
    } else if (seed.target === 'mission') {
      const templateId = await insertOperaMission(
        client,
        playerId,
        instance.id,
        {
          title: seed.note,
        },
        state.tags,
      )
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
  const nodesById = new Map(def.nodes.map((n) => [n.id, n]))
  const linksByFrom = new Map()
  for (const link of def.links) {
    if (!linksByFrom.has(link.from)) linksByFrom.set(link.from, [])
    linksByFrom.get(link.from).push(link)
  }
  for (const links of linksByFrom.values())
    links.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  return { nodesById, linksByFrom }
}

function pushTask(state, entry) {
  state.log = state.log ?? []
  state.log.push(entry)
}

// --- dry log text ------------------------------------------------------
//
// A node's authored text is lore -- it belongs on the task list
// (pushTask's `text`, rendered verbatim in the tasks UI) so the opera reads
// as a story. The [SYS] log stream is a different audience: it's meant to
// read like the rest of the mission log, stating mechanically what just
// happened / what's now expected, never repeating the lore. Every node type
// below gets its own fixed dry phrasing instead of echoing `rendered.text`.

const SEED_TARGET_DRY_TEXT = {
  shop: 'New item available in the shop.',
  candidate: 'New candidate available to hire.',
  mission: 'New mission available.',
}

function drySeedLog(seeds) {
  const targets = [...new Set((seeds ?? []).map((seed) => seed.target))]
  return targets
    .map((target) => SEED_TARGET_DRY_TEXT[target] ?? 'New opportunity available.')
    .join(' ')
}

function dryEndLog(outcome) {
  if (outcome === 'failure') return 'Opera failed.'
  if (outcome === 'success') return 'Opera completed.'
  return 'Opera concluded.'
}

function dryMissionResolutionLog(missionTitle, outcomeLabel) {
  const phrase =
    outcomeLabel === 'FAILURE'
      ? 'Failed'
      : outcomeLabel === 'PARTIAL SUCCESS'
        ? 'Completed with partial success'
        : 'Completed'
  return `Mission "${missionTitle}": ${phrase}`
}

// Every name this template could ever have put in the player's hands as a
// quest item. Three distinct sources, all resolving through the same
// shop_items catalog row (see giveItem()/insertOperaMission()'s own
// comments) so all three are fair game:
//   - a 'seed' node's shop target (purchased once seeded)
//   - a 'story' node's give_item effect (granted directly)
//   - a link's action_performed condition on purchase_item/purchase_quest_item
//     (tutorial.json's own pattern: no 'seed' node at all -- the item is
//     just always in the catalog with is_quest_item=true, per V017's
//     seeding, and getPendingPurchaseNeeds()/reconcileQuestRotation in
//     shop.service.js are what actually put it in rotation, driven by this
//     exact condition shape rather than a seed declaration)
// Scanned statically across every node/link in the definition, not just
// ones this particular playthrough visited -- branches never taken just
// yield names nothing was ever seeded under, harmless to include.
function questItemNamesInTemplate(def) {
  const names = new Set()
  for (const node of def.nodes ?? []) {
    for (const seed of node.seeds ?? []) {
      if (seed.target === 'shop' && seed.params?.itemName) names.add(seed.params.itemName)
    }
    for (const effect of node.effects ?? []) {
      if (effect.type === 'give_item' && effect.params?.itemName) names.add(effect.params.itemName)
    }
  }
  for (const link of def.links ?? []) {
    for (const condition of link.conditions ?? []) {
      if (condition.type !== 'action_performed') continue
      const { actionType, match } = condition.params ?? {}
      if (
        (actionType === 'purchase_item' || actionType === 'purchase_quest_item') &&
        match?.itemName
      ) {
        names.add(match.itemName)
      }
    }
  }
  return [...names]
}

// Quest items only ever exist to gate a link (buying/holding one satisfies
// an action_performed condition) or dress up a mission's cost -- nothing
// about them is useful once their opera is over, so anything still sitting
// unused would otherwise linger in the player's stash/ship forever (see
// tutorial.json's "Encrypted Data Chip": effect 'NONE', never targeted by
// any consumesItemName, purely there to teach the buy/load flow). Equipped
// gear (assigned_to_recruit_id set) is left alone -- equipping it turned it
// from a dangling purchase into a recruit's active loadout, no longer
// "leftover." Scoped by name, not a stored opera_instance_id (items carry no
// such column -- see is_quest_item's own comment in V017), so a sibling
// in-progress instance of the *same* template (maintainOperaSlotsInner can
// fall back to repeats once its pool is exhausted) skips the sweep entirely
// rather than risk deleting something that sibling still needs.
async function sweepQuestItems(client, playerId, instance, def) {
  const candidateNames = questItemNamesInTemplate(def)
  if (candidateNames.length === 0) return

  const sibling = await client.query(
    `SELECT 1 FROM opera_instances
     WHERE player_id = $1 AND template_id = $2 AND status = 'in_progress' AND id != $3 LIMIT 1`,
    [playerId, instance.template_id, instance.id],
  )
  if (sibling.rows.length > 0) return

  const questNames = (
    await client.query(
      `SELECT name FROM shop_items WHERE is_quest_item = TRUE AND name = ANY($1::text[])`,
      [candidateNames],
    )
  ).rows.map((row) => row.name)
  if (questNames.length === 0) return

  await client.query('DELETE FROM consumables WHERE player_id = $1 AND name = ANY($2::text[])', [
    playerId,
    questNames,
  ])
  await client.query(
    `DELETE FROM equipment
     WHERE player_id = $1 AND name = ANY($2::text[]) AND assigned_to_recruit_id IS NULL`,
    [playerId, questNames],
  )
}

async function finish(client, playerId, instance, state, outcome) {
  const status = outcome === 'failure' ? 'failed' : 'completed'
  await client.query(
    `UPDATE opera_instances SET status = $1, state = $2, completed_at = NOW() WHERE id = $3`,
    [status, JSON.stringify(state), instance.id],
  )
  const def = getOperaDefinition(instance.template_id)
  if (def) await sweepQuestItems(client, playerId, instance, def)
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
  const state =
    instance.state && Object.keys(instance.state).length > 0
      ? instance.state
      : {
          currentNodeId: def.nodes.find((n) => n.type === 'start').id,
          tags: resolveTags(),
          // Picked once per instance, like tags, so an opera's display name
          // stays stable for the whole playthrough. [def.title, ...] always
          // has at least one entry, so a template with no titles array
          // always resolves to its own title, same as before this existed.
          title: pickOne([def.title, ...(def.titles ?? [])]),
          log: [],
          awaiting: null,
        }

  const { nodesById, linksByFrom } = indexLinks(def)
  const ctx = { lastOutcome: null, lastChoice: null }
  let steps = 0

  while (steps++ < MAX_STEPS) {
    const current = nodesById.get(state.currentNodeId)
    if (!current) break

    if (state.awaiting === 'mission') {
      if (
        action?.actionType === 'complete_quest' &&
        Number(action.payload.templateId) === state.pendingMissionTemplateId
      ) {
        bindRecruit(state, action.payload)
        ctx.lastOutcome = action.payload.outcome
        // Announces the mission's actual resolution -- otherwise the log
        // stream jumps straight from "Complete mission: ..." (an
        // instruction, logged on arrival) to the next node's own dry text,
        // with nothing ever confirming the instruction was carried out.
        // outcomeLabel carries the granular SUCCESS/PARTIAL SUCCESS/FAILURE
        // (see missionOutcome() in domain/mission.js) purely for this
        // phrasing; ctx.lastOutcome stays the plain success/failure binary
        // link conditions branch on, so this never touches graph routing.
        const missionTitle = OperaGraph.render(current.mission.title, state.tags).text
        const outcomeLabel =
          action.payload.outcomeLabel ??
          (action.payload.outcome === 'success' ? 'SUCCESS' : 'FAILURE')
        await log(client, playerId, instance, dryMissionResolutionLog(missionTitle, outcomeLabel))
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
        if (current.text)
          await log(client, playerId, instance, OperaGraph.render(current.text, state.tags).text)
        state.awaiting = 'link'
      } else if (current.type === 'story') {
        for (const effect of current.effects ?? [])
          await applyEffect(client, playerId, state, effect)
        const rendered = OperaGraph.render(current.text, state.tags)
        pushTask(state, { nodeId: current.id, type: 'story', text: rendered.text })
        await log(client, playerId, instance, 'Story continues.')
        state.awaiting = 'link'
      } else if (current.type === 'check') {
        ctx.lastOutcome =
          Math.random() * 100 < (current.roll?.params?.percentage ?? 0) ? 'success' : 'failure'
        state.awaiting = 'link'
      } else if (current.type === 'seed') {
        await fireSeeds(client, playerId, instance, state, current.seeds)
        // Every authored seed carries a `note` purely as flavor text (see
        // insertOperaMission's own comment), but a 'seed' node can be a
        // walk's stopping point exactly like 'story' can -- its only
        // outgoing link is commonly gated on the action_performed the seed
        // itself sets up (buy the item / recruit the candidate). Without a
        // pushed task here, that stop is invisible: no log line, no "current
        // task" for summarizeInstance to mark, and the player has no way to
        // know the opera is waiting on them at all.
        const notes = (current.seeds ?? []).map((seed) => seed.note).filter(Boolean)
        if (notes.length > 0) {
          const rendered = notes.map((note) => OperaGraph.render(note, state.tags).text).join(' ')
          pushTask(state, { nodeId: current.id, type: 'seed', text: rendered })
          await log(client, playerId, instance, drySeedLog(current.seeds))
        }
        state.awaiting = 'link'
      } else if (current.type === 'mission') {
        const templateId = await insertOperaMission(
          client,
          playerId,
          instance.id,
          current.mission,
          state.tags,
        )
        state.pendingMissionTemplateId = templateId
        state.awaiting = 'mission'
        const rendered = OperaGraph.render(current.mission.title, state.tags)
        pushTask(state, {
          nodeId: current.id,
          type: 'mission',
          text: rendered.text,
          templateId,
          status: 'current',
        })
        await log(client, playerId, instance, `Complete mission: "${rendered.text}"`)
        await persist(client, instance, state)
        return
      } else if (current.type === 'choice') {
        const rendered = OperaGraph.render(current.text, state.tags)
        const options = (current.choiceOptions ?? []).map((o) => ({
          id: o.id,
          label: OperaGraph.render(o.label, state.tags).text,
        }))
        state.pendingChoice = { nodeId: current.id, text: rendered.text, options }
        state.awaiting = 'choice'
        pushTask(state, {
          nodeId: current.id,
          type: 'choice',
          text: rendered.text,
          options,
          status: 'current',
        })
        await log(client, playerId, instance, 'Decision required.')
        await persist(client, instance, state)
        return
      } else if (current.type === 'end') {
        const rendered = OperaGraph.render(current.text, state.tags)
        pushTask(state, {
          nodeId: current.id,
          type: 'end',
          text: rendered.text,
          outcome: current.outcome,
        })
        await log(client, playerId, instance, dryEndLog(current.outcome))
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

    if (chosen.conditions?.some((c) => c.type === 'action_performed') && action) {
      bindRecruit(state, action.payload)
    }

    if (current.completionText) {
      await log(
        client,
        playerId,
        instance,
        OperaGraph.render(current.completionText, state.tags).text,
      )
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
  const validOption = instance.state.pendingChoice?.options?.some((o) => o.id === optionId)
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
  const tutorial = (
    await client.query(
      `SELECT status FROM opera_instances WHERE player_id = $1 AND template_id = $2`,
      [playerId, TUTORIAL_TEMPLATE_ID],
    )
  ).rows[0]
  if (!tutorial || tutorial.status !== 'completed') return

  const player = (
    await client.query('SELECT opera_slot_capacity FROM players WHERE id = $1', [playerId])
  ).rows[0]
  const capacity = player.opera_slot_capacity

  const active = (
    await client.query(
      `SELECT slot_index, template_id FROM opera_instances
     WHERE player_id = $1 AND status = 'in_progress' AND slot_index IS NOT NULL`,
      [playerId],
    )
  ).rows
  const occupiedSlots = new Set(active.map((r) => r.slot_index))
  const activeTemplateIds = new Set(active.map((r) => r.template_id))

  const pool = getGenerationPoolDefinitions()
  if (pool.length === 0) return

  for (let slot = 0; slot < capacity; slot++) {
    if (occupiedSlots.has(slot)) continue
    const fresh = pool.filter((def) => !activeTemplateIds.has(def.id))
    const choice = pickOne(fresh.length > 0 ? fresh : pool)
    await createInstance(client, playerId, choice.id, slot)
    activeTemplateIds.add(choice.id)
  }
}

// --- read model for the client ---------------------------------------------

function summarizeInstance(instance, def) {
  const state = instance.state ?? {}
  const tasks = (state.log ?? []).map((entry) => ({ ...entry, status: 'done' }))
  // 'link' covers a plain action_performed-gated task (e.g. "type split-v")
  // just as much as a pending mission/choice does -- in all three cases the
  // walk is stopped at the last-pushed task, waiting on the player.
  if (state.awaiting === 'mission' || state.awaiting === 'choice' || state.awaiting === 'link') {
    if (tasks.length > 0) tasks[tasks.length - 1].status = 'current'
  }
  return {
    id: String(instance.id),
    templateId: instance.template_id,
    // state.title is the once-per-instance pick from [title, ...titles]
    // (see advanceInstance's initial-state comment); def.title is only a
    // fallback for an instance whose stored state predates that pick.
    title: state.title ?? def?.title ?? instance.template_id,
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
  const instances = (
    await client.query(
      `SELECT * FROM opera_instances
     WHERE player_id = $1 AND (status = 'in_progress' OR template_id = $2)
     ORDER BY id`,
      [playerId, TUTORIAL_TEMPLATE_ID],
    )
  ).rows
  return instances.map((instance) =>
    summarizeInstance(instance, getOperaDefinition(instance.template_id)),
  )
}

// Item names the player needs to buy right now to keep any in-progress
// opera moving -- used by shop.service.js to scope its quest-item bucket to
// actual current need instead of guaranteeing every quest item that exists
// anywhere in the catalog. state.currentNodeId always points at the first
// node whose outgoing link isn't yet satisfiable (advanceInstance() only
// ever stops there), so a single-hop look at that node's own outgoing links
// is enough -- no need to walk further ahead.
async function getPendingPurchaseNeeds(client, playerId) {
  const instances = await getInProgressInstances(client, playerId)
  const names = new Set()

  for (const instance of instances) {
    const def = getOperaDefinition(instance.template_id)
    if (!def) continue

    const state = instance.state ?? {}
    const { linksByFrom } = indexLinks(def)
    const links = linksByFrom.get(state.currentNodeId) ?? []

    for (const link of links) {
      for (const condition of link.conditions ?? []) {
        if (condition.type !== 'action_performed') continue
        const { actionType, match } = condition.params ?? {}
        if (
          (actionType === 'purchase_item' || actionType === 'purchase_quest_item') &&
          match?.itemName
        ) {
          names.add(match.itemName)
        }
      }
    }
  }

  return names
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
  getPendingPurchaseNeeds,
  resolveTags,
}
