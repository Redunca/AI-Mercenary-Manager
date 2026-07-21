// Pure logic for Opera Generating Logic (OGL) graphs: schema validation,
// static analysis, and the "quick generation" walk. No file I/O -- see
// opera-forge/server/src/services/graph.service.js for the fs-touching
// orchestration that calls into this module.

const { TAG_CATALOG, extractPlaceholders, renderPreview } = require('./tags')

const NODE_TYPES = ['start', 'story', 'check', 'seed', 'mission', 'choice', 'end']
const KNOWN_TAG_NAMES = new Set(TAG_CATALOG.flatMap(group => group.tags.map(t => t.name)))
// No has_perk/has_flaw/attribute_threshold here -- a true Opera (as opposed
// to the linear, listen-only tutorial) rarely needs a specific recruit with
// specific stats; it generates content (missions, shop items, choices) more
// than it gates on one recruit's build. crew_threshold stays: ship crew
// count is an aggregate ship stat, not a specific recruit's stat.
// choice_made pairs with a 'choice' node exactly the way previous_outcome
// pairs with a check/mission node's outcome -- it's keyed by optionId
// instead of success/failure/neutral because a choice node's options are
// author-defined per node, not a fixed enum.
const CONDITION_TYPES = ['chance', 'has_item', 'previous_outcome', 'crew_threshold', 'action_performed', 'choice_made']
const EFFECT_TYPES = ['give_item', 'apply_perk', 'apply_flaw', 'adjust_stat']
const ROLL_TYPES = ['chance']
const OUTCOMES = ['success', 'failure', 'neutral']
// What a 'seed' node can pre-declare for a not-yet-built opera engine to
// read later (see the 'seed' node.type block in validateNode/runGeneration
// below): a shop item (by name, same convention as has_item/give_item) or a
// mission (by templateId, same convention action_performed already uses for
// send_recruit_to_quest/purchase_quest_item match targets). Purely
// descriptive data today -- it has no effect on mockState or the real game.
// Fire-and-forget: the walk declares the seed and moves on immediately: it
// never blocks and there's no outcome to branch on. Contrast with a 'mission'
// node (see validateMissionParams below), which blocks the walk until the
// seeded-in mission resolves and branches on its outcome like a check node's
// roll -- seed says "make sure this exists somewhere"; a mission node says
// "the player must resolve this specific mission right here."
const SEED_TARGETS = ['shop', 'mission']
const ATTRIBUTES = [
  'agility', 'fortitude', 'might', 'learning', 'logic',
  'perception', 'will', 'deception', 'persuasion', 'presence',
]
const OPERATORS = ['>', '>=', '<', '<=', '==']
// Mirrors the difficulty tags server/data/mission-names.json's flavor
// templates gate on (see opera-forge's own tags.js TAG_CATALOG, "difficulty"
// entry) -- a mission node's own difficulty is one of these.
const MISSION_DIFFICULTIES = ['ROUTINE', 'STANDARD', 'HARD', 'PERILOUS', 'EPIC']

// Mirrors STEP_TYPES in server/src/domain/opera.js -- the vocabulary of
// gameplay actions the existing (linear checklist) Opera engine can detect.
// "action_performed" conditions reuse this exact vocabulary and match-object
// shape so a graph can express the same "wait for the player to do X" gates
// that every step in server/data/operas/tutorial.json relies on.
const ACTION_TYPES = [
  'hire_recruit',
  'assign_crew_to_ship',
  'complete_quest',
  'purchase_item',
  'purchase_quest_item',
  'equip_item',
  'equip_item_to_recruit',
  'assign_item_to_ship',
  'send_recruit_to_quest',
  'execute_command',
]

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateConditionParams(type, params, where) {
  const p = params ?? {}
  switch (type) {
    case 'chance':
      if (!isFiniteNumber(p.percentage) || p.percentage < 0 || p.percentage > 100) {
        throw new Error(`${where}: condition "chance" requires a numeric percentage between 0 and 100`)
      }
      return
    case 'has_item':
      if (!isNonEmptyString(p.itemName)) throw new Error(`${where}: condition "has_item" requires an itemName string`)
      return
    case 'previous_outcome':
      if (!OUTCOMES.includes(p.equals)) throw new Error(`${where}: condition "previous_outcome" requires equals to be one of ${OUTCOMES.join(', ')}`)
      return
    case 'crew_threshold':
      if (!OPERATORS.includes(p.operator)) throw new Error(`${where}: condition "crew_threshold" requires operator to be one of ${OPERATORS.join(', ')}`)
      if (!isFiniteNumber(p.value)) throw new Error(`${where}: condition "crew_threshold" requires a numeric value`)
      return
    case 'action_performed':
      validateActionMatch(p, where)
      return
    case 'choice_made':
      if (!isNonEmptyString(p.optionId)) throw new Error(`${where}: condition "choice_made" requires an optionId string`)
      return
    default:
      throw new Error(`${where}: unknown condition type "${type}"`)
  }
}

// Same match-shape rules as validateStep() in server/src/domain/opera.js:
// execute_command requires match.command; every other action type requires
// either {scope:"any"} or a specific target key (itemName, recruitId,
// shipId, templateId).
function validateActionMatch(p, where) {
  if (!ACTION_TYPES.includes(p.actionType)) {
    throw new Error(`${where}: condition "action_performed" requires actionType to be one of ${ACTION_TYPES.join(', ')}`)
  }
  if (!p.match || typeof p.match !== 'object') {
    throw new Error(`${where}: condition "action_performed" requires a match object`)
  }
  if (p.actionType === 'execute_command') {
    if (!isNonEmptyString(p.match.command)) {
      throw new Error(`${where}: action_performed execute_command match requires a "command" string`)
    }
    return
  }
  if (p.match.scope !== 'any' && !('itemName' in p.match)) {
    const hasSpecificKey = ['recruitId', 'shipId', 'templateId'].some(key => key in p.match)
    if (!hasSpecificKey) {
      throw new Error(`${where}: action_performed match must be {"scope":"any"} or a specific target`)
    }
  }
}

function validateEffectParams(type, params, where) {
  const p = params ?? {}
  switch (type) {
    case 'give_item':
      if (!isNonEmptyString(p.itemName)) throw new Error(`${where}: effect "give_item" requires an itemName string`)
      return
    case 'apply_perk':
      if (!isNonEmptyString(p.perkName)) throw new Error(`${where}: effect "apply_perk" requires a perkName string`)
      return
    case 'apply_flaw':
      if (!isNonEmptyString(p.flawName)) throw new Error(`${where}: effect "apply_flaw" requires a flawName string`)
      return
    case 'adjust_stat':
      if (!ATTRIBUTES.includes(p.attribute)) throw new Error(`${where}: effect "adjust_stat" requires a known attribute`)
      if (!isFiniteNumber(p.amount)) throw new Error(`${where}: effect "adjust_stat" requires a numeric amount`)
      return
    default:
      throw new Error(`${where}: unknown effect type "${type}"`)
  }
}

function validateSeedParams(target, params, where) {
  const p = params ?? {}
  switch (target) {
    case 'shop':
      if (!isNonEmptyString(p.itemName)) throw new Error(`${where}: seed target "shop" requires an itemName string`)
      return
    case 'mission':
      if (!isNonEmptyString(p.templateId)) throw new Error(`${where}: seed target "mission" requires a templateId string`)
      return
    default:
      throw new Error(`${where}: unknown seed target "${target}"`)
  }
}

function validateNode(node, graphId) {
  if (!node || typeof node !== 'object') throw new Error(`Graph "${graphId}": node must be an object`)
  if (!isNonEmptyString(node.id)) throw new Error(`Graph "${graphId}": node missing a string id`)
  if (!NODE_TYPES.includes(node.type)) throw new Error(`Graph "${graphId}", node "${node.id}": unknown type "${node.type}"`)

  const where = `Graph "${graphId}", node "${node.id}"`

  if (node.type === 'start') {
    // Optional opera-level "on_start_message" equivalent -- shown once, on entry.
    if (node.text !== undefined && !isNonEmptyString(node.text)) {
      throw new Error(`${where}: start node text must be a non-empty string when present`)
    }
  }

  if (node.type === 'story') {
    if (!isNonEmptyString(node.text)) throw new Error(`${where}: story node requires text`)
    if (node.effects !== undefined) {
      if (!Array.isArray(node.effects)) throw new Error(`${where}: effects must be an array`)
      node.effects.forEach((effect, i) => {
        if (!effect || typeof effect !== 'object') throw new Error(`${where}: effect[${i}] must be an object`)
        validateEffectParams(effect.type, effect.params, `${where}, effect[${i}]`)
      })
    }
    validateCompletionText(node, where)
  }

  if (node.type === 'check') {
    if (!node.roll || typeof node.roll !== 'object') throw new Error(`${where}: check node requires a roll`)
    if (!ROLL_TYPES.includes(node.roll.type)) throw new Error(`${where}: check node roll type must be one of ${ROLL_TYPES.join(', ')}`)
    validateConditionParams(node.roll.type, node.roll.params, `${where}, roll`)
    validateCompletionText(node, where)
  }

  if (node.type === 'seed') {
    if (node.seeds !== undefined) {
      if (!Array.isArray(node.seeds)) throw new Error(`${where}: seeds must be an array`)
      node.seeds.forEach((entry, i) => {
        if (!entry || typeof entry !== 'object') throw new Error(`${where}: seed[${i}] must be an object`)
        if (!SEED_TARGETS.includes(entry.target)) throw new Error(`${where}: seed[${i}] target must be one of ${SEED_TARGETS.join(', ')}`)
        validateSeedParams(entry.target, entry.params, `${where}, seed[${i}]`)
        if (entry.note !== undefined && !isNonEmptyString(entry.note)) {
          throw new Error(`${where}: seed[${i}] note must be a non-empty string when present`)
        }
      })
    }
    validateCompletionText(node, where)
  }

  if (node.type === 'mission') {
    validateMissionParams(node.mission, where)
    validateCompletionText(node, where)
  }

  if (node.type === 'choice') {
    if (!isNonEmptyString(node.text)) throw new Error(`${where}: choice node requires text (the prompt shown to the player)`)
    validateChoiceOptions(node.choiceOptions, where)
    validateCompletionText(node, where)
  }

  if (node.type === 'end') {
    if (!OUTCOMES.includes(node.outcome)) throw new Error(`${where}: end node requires outcome to be one of ${OUTCOMES.join(', ')}`)
    if (!isNonEmptyString(node.text)) throw new Error(`${where}: end node requires text`)
  }
}

// A 'mission' node injects a personalized mission into the player's mission
// list and blocks the walk until it resolves, branching on outcome exactly
// like a 'check' node's roll (see runGeneration). Its fields split into two
// different jobs, mirroring how server/data/mission-types.json actually
// gets picked from (see missionGenerator.js's pickOne/typeCandidates
// filtering and pickWeightedDifficulty):
//   - title/description are the opera's own authored narrative hook -- what
//     THIS node calls the mission in its own story (e.g. "Find the Quasar
//     Key"), not the name the real generator would eventually produce from
//     mission-types.json/flavor templates. Freeform, and may reference the
//     same {tagName} placeholders as text/completionText.
//   - tags are generation guidelines, not decoration: the same
//     include-list-with-fallback semantics mission-types.json's
//     requiresPlanetTags uses to narrow the candidate pool (every listed tag
//     must be present, but an empty/no-match result falls back to the
//     unfiltered pool rather than erroring) -- they tell the not-yet-built
//     opera engine what kind of mission to generate, they don't just get
//     printed somewhere.
//   - difficulty is a separate, independent knob from tags here exactly as
//     it is in pickWeightedDifficulty -- it never comes from tags matching,
//     it's either a direct author override or (left unset) the engine's own
//     weighted roll.
function validateMissionParams(mission, where) {
  if (!mission || typeof mission !== 'object') throw new Error(`${where}: mission node requires a mission object`)
  if (!isNonEmptyString(mission.title)) throw new Error(`${where}: mission requires a non-empty title`)
  if (mission.description !== undefined && !isNonEmptyString(mission.description)) {
    throw new Error(`${where}: mission description must be a non-empty string when present`)
  }
  if (mission.difficulty !== undefined && !MISSION_DIFFICULTIES.includes(mission.difficulty)) {
    throw new Error(`${where}: mission difficulty must be one of ${MISSION_DIFFICULTIES.join(', ')}`)
  }
  if (mission.tags !== undefined) {
    if (!Array.isArray(mission.tags) || !mission.tags.every(isNonEmptyString)) {
      throw new Error(`${where}: mission tags must be an array of non-empty strings`)
    }
  }
}

// A 'choice' node presents the player a decision (node.text is the prompt)
// and blocks the walk until they pick one, branching on choice_made exactly
// like a mission/check node branches on previous_outcome (see runGeneration)
// -- this is the third of the three generation-capable actions a true Opera
// needs (the other two: 'seed' adds shop items/missions, story 'effects'
// mutate the player's own state), not a recruit-stats gate. Each option's
// label is freeform and may reference {tagName} placeholders like any other
// text field; its id is what choice_made conditions on outgoing links match
// against, so ids must be unique within the node but don't need to be
// globally unique or match any fixed enum (contrast with previous_outcome's
// fixed success/failure/neutral).
function validateChoiceOptions(options, where) {
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(`${where}: choice node requires a non-empty choiceOptions array`)
  }
  const seenIds = new Set()
  options.forEach((option, i) => {
    if (!option || typeof option !== 'object') throw new Error(`${where}: choiceOptions[${i}] must be an object`)
    if (!isNonEmptyString(option.id)) throw new Error(`${where}: choiceOptions[${i}] requires a non-empty id`)
    if (!isNonEmptyString(option.label)) throw new Error(`${where}: choiceOptions[${i}] requires a non-empty label`)
    if (seenIds.has(option.id)) throw new Error(`${where}: duplicate choice option id "${option.id}"`)
    seenIds.add(option.id)
  })
}

// Optional "on_complete_message" equivalent -- shown once a node's outgoing
// link is actually taken (see runGeneration), regardless of which condition
// satisfied it.
function validateCompletionText(node, where) {
  if (node.completionText !== undefined && !isNonEmptyString(node.completionText)) {
    throw new Error(`${where}: completionText must be a non-empty string when present`)
  }
}

function validateLink(link, nodeIds, graphId) {
  if (!link || typeof link !== 'object') throw new Error(`Graph "${graphId}": link must be an object`)
  if (!isNonEmptyString(link.id)) throw new Error(`Graph "${graphId}": link missing a string id`)
  if (!nodeIds.has(link.from)) throw new Error(`Graph "${graphId}", link "${link.id}": unknown "from" node "${link.from}"`)
  if (!nodeIds.has(link.to)) throw new Error(`Graph "${graphId}", link "${link.id}": unknown "to" node "${link.to}"`)
  if (link.priority !== undefined && !isFiniteNumber(link.priority)) {
    throw new Error(`Graph "${graphId}", link "${link.id}": priority must be a number`)
  }

  const where = `Graph "${graphId}", link "${link.id}"`
  if (link.conditions !== undefined) {
    if (!Array.isArray(link.conditions)) throw new Error(`${where}: conditions must be an array`)
    link.conditions.forEach((condition, i) => {
      if (!condition || typeof condition !== 'object') throw new Error(`${where}: condition[${i}] must be an object`)
      validateConditionParams(condition.type, condition.params, `${where}, condition[${i}]`)
    })
  }
}

function validateGraphDefinition(def) {
  if (!def || typeof def !== 'object') throw new Error('Graph definition must be an object')
  if (!isNonEmptyString(def.id)) throw new Error('Graph definition missing a string id')
  if (!isNonEmptyString(def.title)) throw new Error(`Graph "${def.id}": missing a string title`)
  if (!Array.isArray(def.nodes) || def.nodes.length === 0) throw new Error(`Graph "${def.id}": nodes must be a non-empty array`)
  if (!Array.isArray(def.links)) throw new Error(`Graph "${def.id}": links must be an array`)

  const seenNodeIds = new Set()
  for (const node of def.nodes) {
    validateNode(node, def.id)
    if (seenNodeIds.has(node.id)) throw new Error(`Graph "${def.id}": duplicate node id "${node.id}"`)
    seenNodeIds.add(node.id)
  }

  const startNodes = def.nodes.filter(n => n.type === 'start')
  if (startNodes.length !== 1) throw new Error(`Graph "${def.id}": must have exactly one start node (found ${startNodes.length})`)
  if (!def.nodes.some(n => n.type === 'end')) throw new Error(`Graph "${def.id}": must have at least one end node`)

  const seenLinkIds = new Set()
  for (const link of def.links) {
    validateLink(link, seenNodeIds, def.id)
    if (seenLinkIds.has(link.id)) throw new Error(`Graph "${def.id}": duplicate link id "${link.id}"`)
    seenLinkIds.add(link.id)
  }

  return def
}

// Non-throwing structural warnings surfaced by the editor's "Validate"
// action -- these don't block save (a work-in-progress graph is allowed to
// have dead ends while you're still building it out).
function analyzeGraph(def) {
  const warnings = []
  const nodeIds = new Set(def.nodes.map(n => n.id))
  const outgoingCount = new Map(def.nodes.map(n => [n.id, 0]))
  for (const link of def.links) {
    outgoingCount.set(link.from, (outgoingCount.get(link.from) ?? 0) + 1)
  }

  for (const node of def.nodes) {
    if (node.type !== 'end' && outgoingCount.get(node.id) === 0) {
      warnings.push(`Node "${node.id}" (${node.type}) has no outgoing links and is not an end node -- dead end.`)
    }
  }

  const reachable = new Set()
  const start = def.nodes.find(n => n.type === 'start')
  if (start) {
    const stack = [start.id]
    while (stack.length > 0) {
      const current = stack.pop()
      if (reachable.has(current)) continue
      reachable.add(current)
      for (const link of def.links) {
        if (link.from === current && nodeIds.has(link.to)) stack.push(link.to)
      }
    }
  }
  for (const node of def.nodes) {
    if (!reachable.has(node.id)) warnings.push(`Node "${node.id}" (${node.type}) is unreachable from the start node.`)
  }

  for (const node of def.nodes) {
    const textFields = { text: node.text, completionText: node.completionText }
    if (node.type === 'mission' && node.mission) {
      textFields.missionTitle = node.mission.title
      textFields.missionDescription = node.mission.description
    }
    if (node.type === 'choice' && node.choiceOptions) {
      node.choiceOptions.forEach((option, i) => {
        textFields[`choiceOption[${i}].label`] = option.label
      })
    }
    for (const [field, value] of Object.entries(textFields)) {
      for (const tag of extractPlaceholders(value)) {
        if (!KNOWN_TAG_NAMES.has(tag)) {
          warnings.push(`Node "${node.id}" (${node.type}) ${field} references unknown tag "{${tag}}" -- not in the shared tag catalog.`)
        }
      }
    }
  }

  return warnings
}

// Deterministic PRNG so a given seed always produces the same walk (mulberry32).
function makeRng(seed) {
  let state
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    state = seed >>> 0
  } else {
    const str = String(seed ?? Date.now())
    state = 0
    for (let i = 0; i < str.length; i++) {
      state = (Math.imul(state, 31) + str.charCodeAt(i)) >>> 0
    }
  }
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function compare(actual, operator, expected) {
  switch (operator) {
    case '>': return actual > expected
    case '>=': return actual >= expected
    case '<': return actual < expected
    case '<=': return actual <= expected
    case '==': return actual === expected
    default: return false
  }
}

// Same matching rules as matchStep() in server/src/domain/opera.js.
function matchesAction(params, entry) {
  if (!entry || params.actionType !== entry.actionType) return false
  const match = params.match ?? {}
  const payload = entry.payload ?? {}

  if (params.actionType === 'execute_command') {
    if (match.command !== payload.command) return false
    if (Array.isArray(match.args)) {
      const args = payload.args ?? []
      if (match.args.length !== args.length) return false
      return match.args.every((value, i) => value === args[i])
    }
    return true
  }

  if (match.scope === 'any') return true
  return Object.entries(match).every(([key, value]) => {
    if (key === 'scope') return true
    return payload[key] === value
  })
}

// action_performed is a pure peek against the NEXT scripted action in
// initialState.actionsPerformed (a sequential cursor, not a search over the
// whole list) -- this must stay side-effect free here so that evaluating it
// for a candidate link that ultimately isn't chosen (e.g. a later condition
// on the same link fails) never advances the cursor. The cursor is only
// committed, once, for the link runGeneration actually takes -- see below.
function evaluateCondition(condition, { mockState, lastOutcome, lastChoice, rng, actionCursor }) {
  const p = condition.params ?? {}
  switch (condition.type) {
    case 'chance':
      return rng() * 100 < p.percentage
    case 'has_item':
      return mockState.items.includes(p.itemName)
    case 'previous_outcome':
      return lastOutcome === p.equals
    case 'crew_threshold':
      return compare(mockState.shipCrewCount ?? 0, p.operator, p.value)
    case 'action_performed':
      return matchesAction(p, mockState.actionsPerformed[actionCursor.value])
    case 'choice_made':
      return lastChoice === p.optionId
    default:
      return false
  }
}

function applyEffect(effect, mockState) {
  const p = effect.params ?? {}
  switch (effect.type) {
    case 'give_item':
      if (!mockState.items.includes(p.itemName)) mockState.items.push(p.itemName)
      return
    case 'apply_perk':
      if (!mockState.perks.includes(p.perkName)) mockState.perks.push(p.perkName)
      return
    case 'apply_flaw':
      if (!mockState.flaws.includes(p.flawName)) mockState.flaws.push(p.flawName)
      return
    case 'adjust_stat':
      mockState.attributes[p.attribute] = (mockState.attributes[p.attribute] ?? 0) + p.amount
      return
  }
}

function resolveRoll(roll, ctx) {
  if (roll.type === 'chance') {
    return evaluateCondition({ type: 'chance', params: roll.params }, ctx) ? 'success' : 'failure'
  }
  return 'failure'
}

const MAX_STEPS = 500

// Walks the graph from its single start node, following the highest-priority
// (lowest `priority` number) outgoing link whose conditions all pass at each
// step, applying story-node effects to a working copy of `initialState` as it
// goes. Deterministic for a given seed.
function runGeneration(def, { initialState, seed } = {}) {
  const nodesById = new Map(def.nodes.map(n => [n.id, n]))
  const linksByFrom = new Map()
  for (const link of def.links) {
    if (!linksByFrom.has(link.from)) linksByFrom.set(link.from, [])
    linksByFrom.get(link.from).push(link)
  }
  for (const links of linksByFrom.values()) {
    links.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  }

  const mockState = {
    items: [...(initialState?.items ?? [])],
    perks: [...(initialState?.perks ?? [])],
    flaws: [...(initialState?.flaws ?? [])],
    attributes: { ...(initialState?.attributes ?? {}) },
    actionsPerformed: [...(initialState?.actionsPerformed ?? [])],
    shipCrewCount: initialState?.shipCrewCount ?? 0,
  }
  const tags = { ...(initialState?.tags ?? {}) }
  const rng = makeRng(seed)
  // A ref object (not a plain number) so evaluateCondition can peek the
  // current position without runGeneration having to rebuild ctx every time
  // the cursor advances.
  const actionCursor = { value: 0 }
  const ctx = { mockState, lastOutcome: null, lastChoice: null, rng, actionCursor }

  // Mission nodes don't roll dice -- their outcome comes from actually
  // playing the mission in the real game, which this preview can't simulate.
  // Instead the author scripts the outcome of each mission node the walk is
  // expected to reach, in order (mirrors actionCursor's sequential-peek
  // pattern for action_performed). Missing an entry defaults to 'success' so
  // an author who hasn't scripted outcomes yet still gets a walkable preview.
  const missionOutcomes = [...(initialState?.missionOutcomes ?? [])]
  let missionCursor = 0

  // Choice nodes don't roll dice either -- the player picks, which this
  // preview can't simulate -- so the author scripts which option id the walk
  // should pick at each choice node reached, in order (same sequential-peek
  // pattern as missionOutcomes). Missing an entry defaults to the node's
  // first option rather than 'success', since there's no such outcome here.
  const choicesMade = [...(initialState?.choicesMade ?? [])]
  let choiceCursor = 0

  const path = []
  let current = def.nodes.find(n => n.type === 'start')
  let steps = 0

  while (current) {
    if (steps++ > MAX_STEPS) {
      return { path, reason: 'max_steps_exceeded', finalState: mockState }
    }

    let entry
    let missingTags = []
    if (current.type === 'story') {
      const effectsApplied = current.effects ?? []
      effectsApplied.forEach(effect => applyEffect(effect, mockState))
      const rendered = renderPreview(current.text, tags)
      missingTags = rendered.missing
      entry = { nodeId: current.id, type: current.type, text: rendered.text, effectsApplied }
    } else if (current.type === 'check') {
      ctx.lastOutcome = resolveRoll(current.roll, ctx)
      entry = { nodeId: current.id, type: current.type, outcome: ctx.lastOutcome }
    } else if (current.type === 'seed') {
      // Descriptive only -- no mockState/finalState effect. The not-yet-built
      // opera engine is meant to read node.seeds directly off the graph
      // definition once it exists; this just surfaces it as a walk step so
      // Quick Generation can preview which step would declare which seeds.
      entry = { nodeId: current.id, type: current.type, seeds: current.seeds ?? [] }
    } else if (current.type === 'mission') {
      const outcome = missionOutcomes[missionCursor] ?? 'success'
      missionCursor += 1
      ctx.lastOutcome = outcome
      const titleRendered = renderPreview(current.mission?.title, tags)
      const descRendered = renderPreview(current.mission?.description, tags)
      missingTags = [...new Set([...titleRendered.missing, ...descRendered.missing])]
      entry = {
        nodeId: current.id,
        type: current.type,
        mission: { ...current.mission, title: titleRendered.text, description: descRendered.text },
        outcome,
      }
    } else if (current.type === 'choice') {
      const rendered = renderPreview(current.text, tags)
      missingTags = rendered.missing
      const choiceOptions = (current.choiceOptions ?? []).map(option => {
        const labelRendered = renderPreview(option.label, tags)
        missingTags = [...new Set([...missingTags, ...labelRendered.missing])]
        return { id: option.id, label: labelRendered.text }
      })
      const choiceMade = choicesMade[choiceCursor] ?? choiceOptions[0]?.id
      choiceCursor += 1
      ctx.lastChoice = choiceMade
      entry = { nodeId: current.id, type: current.type, text: rendered.text, choiceOptions, choiceMade }
    } else if (current.type === 'end') {
      const rendered = renderPreview(current.text, tags)
      entry = { nodeId: current.id, type: current.type, text: rendered.text, outcome: current.outcome }
      if (rendered.missing.length > 0) entry.missingTags = rendered.missing
      path.push(entry)
      return { path, reason: 'end', endedAt: current.id, finalState: mockState }
    } else {
      const rendered = renderPreview(current.text, tags)
      missingTags = rendered.missing
      entry = { nodeId: current.id, type: current.type, text: rendered.text }
    }
    path.push(entry)

    const candidates = linksByFrom.get(current.id) ?? []
    const chosen = candidates.find(link =>
      (link.conditions ?? []).every(condition => evaluateCondition(condition, ctx))
    )

    if (!chosen) {
      return { path, reason: 'dead_end', endedAt: current.id, finalState: mockState }
    }

    // Commit the cursor advance only for the link actually taken, once per
    // action_performed condition on it -- see evaluateCondition's comment.
    for (const condition of chosen.conditions ?? []) {
      if (condition.type === 'action_performed') actionCursor.value += 1
    }
    if (current.completionText) {
      const rendered = renderPreview(current.completionText, tags)
      entry.completionText = rendered.text
      missingTags = [...new Set([...missingTags, ...rendered.missing])]
    }
    if (missingTags.length > 0) entry.missingTags = missingTags

    current = nodesById.get(chosen.to)
  }

  return { path, reason: 'dead_end', finalState: mockState }
}

module.exports = {
  NODE_TYPES,
  CONDITION_TYPES,
  EFFECT_TYPES,
  ROLL_TYPES,
  OUTCOMES,
  ATTRIBUTES,
  OPERATORS,
  ACTION_TYPES,
  SEED_TARGETS,
  MISSION_DIFFICULTIES,
  validateGraphDefinition,
  analyzeGraph,
  runGeneration,
  makeRng,
  matchesAction,
}
