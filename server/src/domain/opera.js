// Pure logic for Opera step matching. No DB access -- see
// server/src/services/opera.service.js for the DB-touching orchestration
// that calls into this module.

const STEP_TYPES = [
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

// Maps a step's declared `type` to the action name recordOperaAction() is
// actually called with. Most are 1:1; equip_item_to_recruit shares
// equip_item's emitted action because the game only has one equip mechanism
// (EquipmentService.equipArmor, recruit-only) -- the two types are
// distinguished purely by `match` shape, never by a different action name.
const STEP_TYPE_ACTION = {
  hire_recruit: 'hire_recruit',
  assign_crew_to_ship: 'assign_crew_to_ship',
  complete_quest: 'complete_quest',
  purchase_item: 'purchase_item',
  purchase_quest_item: 'purchase_quest_item',
  equip_item: 'equip_item',
  equip_item_to_recruit: 'equip_item',
  assign_item_to_ship: 'assign_item_to_ship',
  send_recruit_to_quest: 'send_recruit_to_quest',
  execute_command: 'execute_command',
}

function actionForStep(step) {
  return STEP_TYPE_ACTION[step.type]
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function validateStep(step, operaId) {
  if (!step || typeof step !== 'object') {
    throw new Error(`Opera "${operaId}": step must be an object`)
  }
  if (!isNonEmptyString(step.id)) {
    throw new Error(`Opera "${operaId}": step missing a string id`)
  }
  if (!STEP_TYPES.includes(step.type)) {
    throw new Error(`Opera "${operaId}", step "${step.id}": unknown type "${step.type}"`)
  }
  if (!isNonEmptyString(step.description)) {
    throw new Error(`Opera "${operaId}", step "${step.id}": missing a string description`)
  }
  if (!step.match || typeof step.match !== 'object') {
    throw new Error(`Opera "${operaId}", step "${step.id}": missing a match object`)
  }
  if (step.type === 'execute_command' && !isNonEmptyString(step.match.command)) {
    throw new Error(`Opera "${operaId}", step "${step.id}": execute_command match requires a "command" string`)
  }
  if (step.type !== 'execute_command' && step.match.scope !== 'any' && !('itemName' in step.match)) {
    // Every non-command type supports {scope:"any"}; anything else must be
    // a recognizable specific-target match (itemName, recruitId, shipId,
    // templateId) -- validated loosely here since the exact key varies by
    // type (see the match-shape table in the plan), just requiring *some*
    // specific key so a typo'd match object fails loudly at startup.
    const hasSpecificKey = ['recruitId', 'shipId', 'templateId'].some(key => key in step.match)
    if (!hasSpecificKey) {
      throw new Error(`Opera "${operaId}", step "${step.id}": match must be {"scope":"any"} or a specific target`)
    }
  }
}

function validateOperaDefinition(def) {
  if (!def || typeof def !== 'object') {
    throw new Error('Opera definition must be an object')
  }
  if (!isNonEmptyString(def.id)) {
    throw new Error('Opera definition missing a string id')
  }
  if (!isNonEmptyString(def.title)) {
    throw new Error(`Opera "${def.id}": missing a string title`)
  }
  if (typeof def.auto_start !== 'boolean') {
    throw new Error(`Opera "${def.id}": auto_start must be a boolean`)
  }
  if (def.step_order !== 'sequential' && def.step_order !== 'checklist') {
    throw new Error(`Opera "${def.id}": step_order must be "sequential" or "checklist"`)
  }
  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    throw new Error(`Opera "${def.id}": steps must be a non-empty array`)
  }

  const seenStepIds = new Set()
  for (const step of def.steps) {
    validateStep(step, def.id)
    if (seenStepIds.has(step.id)) {
      throw new Error(`Opera "${def.id}": duplicate step id "${step.id}"`)
    }
    seenStepIds.add(step.id)
  }

  return def
}

// True when every field of `match` (other than "scope") is satisfied by the
// corresponding field on `payload`. {"scope":"any"} always matches (for
// non-command types); execute_command never has a "scope" field -- it
// always compares "command" and, if present, "args".
function matchStep(step, actionType, payload) {
  if (actionForStep(step) !== actionType) return false

  const match = step.match
  if (step.type === 'execute_command') {
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

// Sequential: only the earliest incomplete step listens. Checklist: every
// incomplete step listens. Returns the subset of those listening steps whose
// mapped action matches `actionType` (candidates for matchStep()).
function listeningSteps(definition, completedStepIds, actionType) {
  const completed = new Set(completedStepIds)
  const incomplete = definition.steps.filter(step => !completed.has(step.id))

  const candidates = definition.step_order === 'sequential'
    ? incomplete.slice(0, 1)
    : incomplete

  return actionType == null
    ? candidates
    : candidates.filter(step => actionForStep(step) === actionType)
}

function isOperaComplete(definition, completedStepIds) {
  const completed = new Set(completedStepIds)
  return definition.steps.every(step => completed.has(step.id))
}

module.exports = {
  STEP_TYPES,
  STEP_TYPE_ACTION,
  actionForStep,
  validateOperaDefinition,
  matchStep,
  listeningSteps,
  isOperaComplete,
}
