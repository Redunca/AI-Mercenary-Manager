// Pure logic for Opera Generating Logic (OGL) graphs, as consumed by the
// live game. Hand-ported from opera-forge/server/src/domain/graph.js --
// opera-forge is a deliberately standalone authoring app (see its own
// graph.js/tags.js header comments), so this is a hand-copy, not a shared
// import, matching that project's existing convention. Validation logic is
// kept identical to opera-forge's so a template that validates there is
// guaranteed to load here. The live-only additions are ACTION_TYPES gaining
// 'fire_recruit' (previously a documented gap -- see the comment below) and
// a non-throwing render() (see its own comment for why).

const NODE_TYPES = ['start', 'story', 'check', 'seed', 'mission', 'choice', 'end']
const CONDITION_TYPES = [
  'chance',
  'has_item',
  'previous_outcome',
  'crew_threshold',
  'action_performed',
  'choice_made',
]
const EFFECT_TYPES = ['give_item', 'apply_perk', 'apply_flaw', 'adjust_stat']
const ROLL_TYPES = ['chance']
const OUTCOMES = ['success', 'failure', 'neutral']
const SEED_TARGETS = ['shop', 'mission', 'candidate']
const ATTRIBUTES = [
  'agility',
  'fortitude',
  'might',
  'learning',
  'logic',
  'perception',
  'will',
  'deception',
  'persuasion',
  'presence',
]
const OPERATORS = ['>', '>=', '<', '<=', '==']
const MISSION_DIFFICULTIES = ['ROUTINE', 'STANDARD', 'HARD', 'PERILOUS', 'EPIC']

// Same vocabulary as opera-forge's graph.js ACTION_TYPES, now WITH
// 'fire_recruit' -- this file is the real engine opera-forge's own comment
// said would need to add it before a graph using it could actually run
// (see RecruitService.fireRecruit for the live implementation).
const ACTION_TYPES = [
  'hire_recruit',
  'fire_recruit',
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
        throw new Error(
          `${where}: condition "chance" requires a numeric percentage between 0 and 100`,
        )
      }
      return
    case 'has_item':
      if (!isNonEmptyString(p.itemName))
        throw new Error(`${where}: condition "has_item" requires an itemName string`)
      return
    case 'previous_outcome':
      if (!OUTCOMES.includes(p.equals))
        throw new Error(
          `${where}: condition "previous_outcome" requires equals to be one of ${OUTCOMES.join(', ')}`,
        )
      return
    case 'crew_threshold':
      if (!OPERATORS.includes(p.operator))
        throw new Error(
          `${where}: condition "crew_threshold" requires operator to be one of ${OPERATORS.join(', ')}`,
        )
      if (!isFiniteNumber(p.value))
        throw new Error(`${where}: condition "crew_threshold" requires a numeric value`)
      return
    case 'action_performed':
      validateActionMatch(p, where)
      return
    case 'choice_made':
      if (!isNonEmptyString(p.optionId))
        throw new Error(`${where}: condition "choice_made" requires an optionId string`)
      return
    default:
      throw new Error(`${where}: unknown condition type "${type}"`)
  }
}

function validateActionMatch(p, where) {
  if (!ACTION_TYPES.includes(p.actionType)) {
    throw new Error(
      `${where}: condition "action_performed" requires actionType to be one of ${ACTION_TYPES.join(', ')}`,
    )
  }
  if (!p.match || typeof p.match !== 'object') {
    throw new Error(`${where}: condition "action_performed" requires a match object`)
  }
  if (p.actionType === 'execute_command') {
    if (!isNonEmptyString(p.match.command)) {
      throw new Error(
        `${where}: action_performed execute_command match requires a "command" string`,
      )
    }
    return
  }
  if (p.match.scope !== 'any' && !('itemName' in p.match)) {
    const hasSpecificKey = ['recruitId', 'shipId', 'templateId', 'seedId'].some(
      (key) => key in p.match,
    )
    if (!hasSpecificKey) {
      throw new Error(
        `${where}: action_performed match must be {"scope":"any"} or a specific target`,
      )
    }
  }
}

function validateEffectParams(type, params, where) {
  const p = params ?? {}
  switch (type) {
    case 'give_item':
      if (!isNonEmptyString(p.itemName))
        throw new Error(`${where}: effect "give_item" requires an itemName string`)
      return
    case 'apply_perk':
      if (!isNonEmptyString(p.perkName))
        throw new Error(`${where}: effect "apply_perk" requires a perkName string`)
      return
    case 'apply_flaw':
      if (!isNonEmptyString(p.flawName))
        throw new Error(`${where}: effect "apply_flaw" requires a flawName string`)
      return
    case 'adjust_stat':
      if (!ATTRIBUTES.includes(p.attribute))
        throw new Error(`${where}: effect "adjust_stat" requires a known attribute`)
      if (!isFiniteNumber(p.amount))
        throw new Error(`${where}: effect "adjust_stat" requires a numeric amount`)
      return
    default:
      throw new Error(`${where}: unknown effect type "${type}"`)
  }
}

function validateSeedParams(target, params, where) {
  const p = params ?? {}
  switch (target) {
    case 'shop':
      if (!isNonEmptyString(p.itemName))
        throw new Error(`${where}: seed target "shop" requires an itemName string`)
      return
    case 'mission':
      if (!isNonEmptyString(p.templateId))
        throw new Error(`${where}: seed target "mission" requires a templateId string`)
      return
    case 'candidate':
      if (!isNonEmptyString(p.seedId))
        throw new Error(`${where}: seed target "candidate" requires a seedId string`)
      return
    default:
      throw new Error(`${where}: unknown seed target "${target}"`)
  }
}

function validateCompletionText(node, where) {
  if (node.completionText !== undefined && !isNonEmptyString(node.completionText)) {
    throw new Error(`${where}: completionText must be a non-empty string when present`)
  }
}

function validateMissionParams(mission, where) {
  if (!mission || typeof mission !== 'object')
    throw new Error(`${where}: mission node requires a mission object`)
  if (!isNonEmptyString(mission.title))
    throw new Error(`${where}: mission requires a non-empty title`)
  if (mission.description !== undefined && !isNonEmptyString(mission.description)) {
    throw new Error(`${where}: mission description must be a non-empty string when present`)
  }
  if (mission.difficulty !== undefined && !MISSION_DIFFICULTIES.includes(mission.difficulty)) {
    throw new Error(
      `${where}: mission difficulty must be one of ${MISSION_DIFFICULTIES.join(', ')}`,
    )
  }
  if (mission.tags !== undefined) {
    if (!Array.isArray(mission.tags) || !mission.tags.every(isNonEmptyString)) {
      throw new Error(`${where}: mission tags must be an array of non-empty strings`)
    }
  }
}

function validateChoiceOptions(options, where) {
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(`${where}: choice node requires a non-empty choiceOptions array`)
  }
  const seenIds = new Set()
  options.forEach((option, i) => {
    if (!option || typeof option !== 'object')
      throw new Error(`${where}: choiceOptions[${i}] must be an object`)
    if (!isNonEmptyString(option.id))
      throw new Error(`${where}: choiceOptions[${i}] requires a non-empty id`)
    if (!isNonEmptyString(option.label))
      throw new Error(`${where}: choiceOptions[${i}] requires a non-empty label`)
    if (seenIds.has(option.id))
      throw new Error(`${where}: duplicate choice option id "${option.id}"`)
    seenIds.add(option.id)
  })
}

function validateNode(node, graphId) {
  if (!node || typeof node !== 'object')
    throw new Error(`Graph "${graphId}": node must be an object`)
  if (!isNonEmptyString(node.id)) throw new Error(`Graph "${graphId}": node missing a string id`)
  if (!NODE_TYPES.includes(node.type))
    throw new Error(`Graph "${graphId}", node "${node.id}": unknown type "${node.type}"`)

  const where = `Graph "${graphId}", node "${node.id}"`

  if (node.type === 'start') {
    if (node.text !== undefined && !isNonEmptyString(node.text)) {
      throw new Error(`${where}: start node text must be a non-empty string when present`)
    }
  }

  if (node.type === 'story') {
    if (!isNonEmptyString(node.text)) throw new Error(`${where}: story node requires text`)
    if (node.effects !== undefined) {
      if (!Array.isArray(node.effects)) throw new Error(`${where}: effects must be an array`)
      node.effects.forEach((effect, i) => {
        if (!effect || typeof effect !== 'object')
          throw new Error(`${where}: effect[${i}] must be an object`)
        validateEffectParams(effect.type, effect.params, `${where}, effect[${i}]`)
      })
    }
    validateCompletionText(node, where)
  }

  if (node.type === 'check') {
    if (!node.roll || typeof node.roll !== 'object')
      throw new Error(`${where}: check node requires a roll`)
    if (!ROLL_TYPES.includes(node.roll.type))
      throw new Error(`${where}: check node roll type must be one of ${ROLL_TYPES.join(', ')}`)
    validateConditionParams(node.roll.type, node.roll.params, `${where}, roll`)
    validateCompletionText(node, where)
  }

  if (node.type === 'seed') {
    if (node.seeds !== undefined) {
      if (!Array.isArray(node.seeds)) throw new Error(`${where}: seeds must be an array`)
      node.seeds.forEach((entry, i) => {
        if (!entry || typeof entry !== 'object')
          throw new Error(`${where}: seed[${i}] must be an object`)
        if (!SEED_TARGETS.includes(entry.target))
          throw new Error(`${where}: seed[${i}] target must be one of ${SEED_TARGETS.join(', ')}`)
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
    if (!isNonEmptyString(node.text))
      throw new Error(`${where}: choice node requires text (the prompt shown to the player)`)
    validateChoiceOptions(node.choiceOptions, where)
    validateCompletionText(node, where)
  }

  if (node.type === 'end') {
    if (!OUTCOMES.includes(node.outcome))
      throw new Error(`${where}: end node requires outcome to be one of ${OUTCOMES.join(', ')}`)
    if (!isNonEmptyString(node.text)) throw new Error(`${where}: end node requires text`)
  }
}

function validateLink(link, nodeIds, graphId) {
  if (!link || typeof link !== 'object')
    throw new Error(`Graph "${graphId}": link must be an object`)
  if (!isNonEmptyString(link.id)) throw new Error(`Graph "${graphId}": link missing a string id`)
  if (!nodeIds.has(link.from))
    throw new Error(`Graph "${graphId}", link "${link.id}": unknown "from" node "${link.from}"`)
  if (!nodeIds.has(link.to))
    throw new Error(`Graph "${graphId}", link "${link.id}": unknown "to" node "${link.to}"`)
  if (link.priority !== undefined && !isFiniteNumber(link.priority)) {
    throw new Error(`Graph "${graphId}", link "${link.id}": priority must be a number`)
  }

  const where = `Graph "${graphId}", link "${link.id}"`
  if (link.conditions !== undefined) {
    if (!Array.isArray(link.conditions)) throw new Error(`${where}: conditions must be an array`)
    link.conditions.forEach((condition, i) => {
      if (!condition || typeof condition !== 'object')
        throw new Error(`${where}: condition[${i}] must be an object`)
      validateConditionParams(condition.type, condition.params, `${where}, condition[${i}]`)
    })
  }
}

function validateGraphDefinition(def) {
  if (!def || typeof def !== 'object') throw new Error('Graph definition must be an object')
  if (!isNonEmptyString(def.id)) throw new Error('Graph definition missing a string id')
  if (!isNonEmptyString(def.title)) throw new Error(`Graph "${def.id}": missing a string title`)
  if (!Array.isArray(def.nodes) || def.nodes.length === 0)
    throw new Error(`Graph "${def.id}": nodes must be a non-empty array`)
  if (!Array.isArray(def.links)) throw new Error(`Graph "${def.id}": links must be an array`)

  const seenNodeIds = new Set()
  for (const node of def.nodes) {
    validateNode(node, def.id)
    if (seenNodeIds.has(node.id))
      throw new Error(`Graph "${def.id}": duplicate node id "${node.id}"`)
    seenNodeIds.add(node.id)
  }

  const startNodes = def.nodes.filter((n) => n.type === 'start')
  if (startNodes.length !== 1)
    throw new Error(
      `Graph "${def.id}": must have exactly one start node (found ${startNodes.length})`,
    )
  if (!def.nodes.some((n) => n.type === 'end'))
    throw new Error(`Graph "${def.id}": must have at least one end node`)

  const seenLinkIds = new Set()
  for (const link of def.links) {
    validateLink(link, seenNodeIds, def.id)
    if (seenLinkIds.has(link.id))
      throw new Error(`Graph "${def.id}": duplicate link id "${link.id}"`)
    seenLinkIds.add(link.id)
  }

  return def
}

function compare(actual, operator, expected) {
  switch (operator) {
    case '>':
      return actual > expected
    case '>=':
      return actual >= expected
    case '<':
      return actual < expected
    case '<=':
      return actual <= expected
    case '==':
      return actual === expected
    default:
      return false
  }
}

// Same matching rules as matchStep() in the old server/src/domain/opera.js
// and matchesAction() in opera-forge's graph.js.
function matchesAction(params, actionType, payload) {
  if (params.actionType !== actionType) return false
  const match = params.match ?? {}

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

function extractPlaceholders(template) {
  if (typeof template !== 'string') return []
  const matches = template.matchAll(/\{(\w+)\}/g)
  return [...new Set([...matches].map((m) => m[1]))]
}

// Deliberately non-throwing, unlike server/src/utils/template.js's render()
// -- an opera's tag context only carries whatever the random mission-type
// draw actually published (see OperaService's tag-resolution comment), so a
// template referencing a tag that draw didn't provide is expected, not a
// bug. An unresolved {tag} is left literal in the text and the caller is
// told which tags were missing so it can log a warning -- narrative text
// failing to fully resolve must never crash live gameplay, matching every
// other opera hook in this codebase (recordOperaAction, ensureOperasForPlayer)
// being deliberately catch-and-log.
function render(template, tags) {
  const missing = []
  if (typeof template !== 'string') return { text: template, missing }
  const context = tags ?? {}
  const text = template.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in context) || context[key] === undefined || context[key] === '') {
      missing.push(key)
      return match
    }
    return context[key]
  })
  return { text, missing: [...new Set(missing)] }
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
  compare,
  matchesAction,
  extractPlaceholders,
  render,
}
