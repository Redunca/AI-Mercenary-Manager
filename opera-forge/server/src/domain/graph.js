// Pure logic for Opera Generating Logic (OGL) graphs: schema validation,
// static analysis, and the "quick generation" walk. No file I/O -- see
// opera-forge/server/src/services/graph.service.js for the fs-touching
// orchestration that calls into this module.

const NODE_TYPES = ['start', 'story', 'check', 'end']
const CONDITION_TYPES = ['chance', 'has_item', 'previous_outcome']
// Mirrors the main game's remaining opera STEP_TYPES (server/src/domain/opera.js)
// so a story graph can require the same real-game beats the tutorial's opera
// checklist does. execute_command is covered by request_command below;
// equip_item_to_recruit is omitted because in the main game it's just
// equip_item under a different match shape, not a distinct action.
const EFFECT_TYPES = [
  'give_item', 'adjust_stat', 'start_combat', 'request_command',
  'hire_recruit', 'assign_crew_to_ship', 'complete_quest',
  'purchase_item', 'purchase_quest_item', 'equip_item',
  'assign_item_to_ship', 'send_recruit_to_quest',
]
const ROLL_TYPES = ['chance']
const OUTCOMES = ['success', 'failure', 'neutral']
const ATTRIBUTES = [
  'agility', 'fortitude', 'might', 'learning', 'logic',
  'perception', 'will', 'deception', 'persuasion', 'presence',
]
// Mirrors the main game's combat difficulty ladder (server/src/domain/combat.js
// BOSS_TABLE). Only the difficulty is modeled here -- the main game abstracts
// a whole encounter into one difficulty-scaled combatant.
const DIFFICULTIES = ['ROUTINE', 'STANDARD', 'HARD', 'PERILOUS', 'EPIC']
// Rough win chance per difficulty, used only to resolve a start_combat effect
// during quick-generation walks -- not a claim about the main game's actual
// combat math.
const COMBAT_WIN_CHANCE = { ROUTINE: 90, STANDARD: 75, HARD: 55, PERILOUS: 35, EPIC: 15 }

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
    default:
      throw new Error(`${where}: unknown condition type "${type}"`)
  }
}

function validateEffectParams(type, params, where) {
  const p = params ?? {}
  switch (type) {
    case 'give_item':
      if (!isNonEmptyString(p.itemName)) throw new Error(`${where}: effect "give_item" requires an itemName string`)
      return
    case 'adjust_stat':
      if (!ATTRIBUTES.includes(p.attribute)) throw new Error(`${where}: effect "adjust_stat" requires a known attribute`)
      if (!isFiniteNumber(p.amount)) throw new Error(`${where}: effect "adjust_stat" requires a numeric amount`)
      return
    case 'start_combat':
      if (!DIFFICULTIES.includes(p.difficulty)) throw new Error(`${where}: effect "start_combat" requires difficulty to be one of ${DIFFICULTIES.join(', ')}`)
      if (p.enemyName !== undefined && typeof p.enemyName !== 'string') throw new Error(`${where}: effect "start_combat" enemyName must be a string`)
      return
    case 'request_command':
      if (!isNonEmptyString(p.command)) throw new Error(`${where}: effect "request_command" requires a command string`)
      if (p.args !== undefined && typeof p.args !== 'string') throw new Error(`${where}: effect "request_command" args must be a string`)
      return
    case 'purchase_quest_item':
      if (!isNonEmptyString(p.itemName)) throw new Error(`${where}: effect "purchase_quest_item" requires an itemName string`)
      return
    case 'hire_recruit':
    case 'assign_crew_to_ship':
    case 'complete_quest':
    case 'purchase_item':
    case 'equip_item':
    case 'assign_item_to_ship':
    case 'send_recruit_to_quest':
      if (p.label !== undefined && typeof p.label !== 'string') throw new Error(`${where}: effect "${type}" label must be a string`)
      return
    default:
      throw new Error(`${where}: unknown effect type "${type}"`)
  }
}

function validateNode(node, graphId) {
  if (!node || typeof node !== 'object') throw new Error(`Graph "${graphId}": node must be an object`)
  if (!isNonEmptyString(node.id)) throw new Error(`Graph "${graphId}": node missing a string id`)
  if (!NODE_TYPES.includes(node.type)) throw new Error(`Graph "${graphId}", node "${node.id}": unknown type "${node.type}"`)

  const where = `Graph "${graphId}", node "${node.id}"`

  if (node.type === 'story') {
    if (!isNonEmptyString(node.text)) throw new Error(`${where}: story node requires text`)
    if (node.effects !== undefined) {
      if (!Array.isArray(node.effects)) throw new Error(`${where}: effects must be an array`)
      node.effects.forEach((effect, i) => {
        if (!effect || typeof effect !== 'object') throw new Error(`${where}: effect[${i}] must be an object`)
        validateEffectParams(effect.type, effect.params, `${where}, effect[${i}]`)
      })
    }
  }

  if (node.type === 'check') {
    if (!node.roll || typeof node.roll !== 'object') throw new Error(`${where}: check node requires a roll`)
    if (!ROLL_TYPES.includes(node.roll.type)) throw new Error(`${where}: check node roll type must be one of ${ROLL_TYPES.join(', ')}`)
    validateConditionParams(node.roll.type, node.roll.params, `${where}, roll`)
  }

  if (node.type === 'end') {
    if (!OUTCOMES.includes(node.outcome)) throw new Error(`${where}: end node requires outcome to be one of ${OUTCOMES.join(', ')}`)
    if (!isNonEmptyString(node.text)) throw new Error(`${where}: end node requires text`)
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

function evaluateCondition(condition, { mockState, lastOutcome, rng }) {
  const p = condition.params ?? {}
  switch (condition.type) {
    case 'chance':
      return rng() * 100 < p.percentage
    case 'has_item':
      return mockState.items.includes(p.itemName)
    case 'previous_outcome':
      return lastOutcome === p.equals
    default:
      return false
  }
}

// Returns the Effect entry to record in the walk's path (usually the effect
// itself, but start_combat enriches it with the rolled outcome so the UI can
// show what happened without re-deriving it from mockState).
function applyEffect(effect, mockState, ctx) {
  const p = effect.params ?? {}
  switch (effect.type) {
    case 'give_item':
      if (!mockState.items.includes(p.itemName)) mockState.items.push(p.itemName)
      return effect
    case 'adjust_stat':
      mockState.attributes[p.attribute] = (mockState.attributes[p.attribute] ?? 0) + p.amount
      return effect
    case 'start_combat': {
      const outcome = ctx.rng() * 100 < (COMBAT_WIN_CHANCE[p.difficulty] ?? 50) ? 'success' : 'failure'
      ctx.lastOutcome = outcome
      mockState.combatsFought.push({ difficulty: p.difficulty, enemyName: p.enemyName || '', outcome })
      return { type: effect.type, params: { ...p, outcome } }
    }
    case 'request_command':
      mockState.commandsRequested.push({ command: p.command, args: p.args || '' })
      return effect
    case 'purchase_quest_item':
      if (!mockState.items.includes(p.itemName)) mockState.items.push(p.itemName)
      mockState.actionsTaken.push({ type: effect.type, label: p.itemName })
      return effect
    case 'hire_recruit':
    case 'assign_crew_to_ship':
    case 'complete_quest':
    case 'purchase_item':
    case 'equip_item':
    case 'assign_item_to_ship':
    case 'send_recruit_to_quest':
      mockState.actionsTaken.push({ type: effect.type, label: p.label || '' })
      return effect
    default:
      return effect
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
    attributes: { ...(initialState?.attributes ?? {}) },
    combatsFought: [],
    commandsRequested: [],
    actionsTaken: [],
  }
  const rng = makeRng(seed)
  const ctx = { mockState, lastOutcome: null, rng }

  const path = []
  let current = def.nodes.find(n => n.type === 'start')
  let steps = 0

  while (current) {
    if (steps++ > MAX_STEPS) {
      return { path, reason: 'max_steps_exceeded', finalState: mockState }
    }

    if (current.type === 'story') {
      const effectsApplied = (current.effects ?? []).map(effect => applyEffect(effect, mockState, ctx))
      path.push({ nodeId: current.id, type: current.type, text: current.text, effectsApplied })
    } else if (current.type === 'check') {
      ctx.lastOutcome = resolveRoll(current.roll, ctx)
      path.push({ nodeId: current.id, type: current.type, outcome: ctx.lastOutcome })
    } else if (current.type === 'end') {
      path.push({ nodeId: current.id, type: current.type, text: current.text, outcome: current.outcome })
      return { path, reason: 'end', endedAt: current.id, finalState: mockState }
    } else {
      path.push({ nodeId: current.id, type: current.type })
    }

    const candidates = linksByFrom.get(current.id) ?? []
    const chosen = candidates.find(link =>
      (link.conditions ?? []).every(condition => evaluateCondition(condition, ctx))
    )

    if (!chosen) {
      return { path, reason: 'dead_end', endedAt: current.id, finalState: mockState }
    }
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
  DIFFICULTIES,
  validateGraphDefinition,
  analyzeGraph,
  runGeneration,
  makeRng,
}
