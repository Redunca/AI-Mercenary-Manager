// Mirrors opera-forge/server/src/domain/graph.js. Kept as a separate,
// hand-written copy rather than a shared package -- these are two
// independent apps (client/server) per the plan.

export const NODE_TYPES = ['start', 'story', 'check', 'seed', 'mission', 'end'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

// What a 'seed' node can pre-declare for a not-yet-built opera engine to
// read later: a shop item (by name, same convention as has_item/give_item)
// or a mission (by templateId, same convention action_performed already
// uses for send_recruit_to_quest/purchase_quest_item match targets). Purely
// descriptive data today -- it has no effect on MockState or the real game.
export const SEED_TARGETS = ['shop', 'mission'] as const;
export type SeedTarget = (typeof SEED_TARGETS)[number];

// No has_perk/has_flaw/attribute_threshold here -- a true Opera (as opposed
// to the linear, listen-only tutorial) rarely needs a specific recruit with
// specific stats; it generates content (missions, shop items, choices) more
// than it gates on one recruit's build. crew_threshold stays: ship crew
// count is an aggregate ship stat, not a specific recruit's stat.
export const CONDITION_TYPES = ['chance', 'has_item', 'previous_outcome', 'crew_threshold', 'action_performed'] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

// Mirrors STEP_TYPES in server/src/domain/opera.js -- the vocabulary of
// gameplay actions the existing (linear checklist) Opera engine can detect.
// action_performed conditions reuse this exact vocabulary and match-object
// shape so a graph can express the same "wait for the player to do X" gates
// every step in server/data/operas/tutorial.json relies on.
export const ACTION_TYPES = [
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
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

// The single match key each action type is actually about (execute_command
// is handled separately via its own command/args fields -- see
// defaultActionMatch). Action types listed here skip the free-form
// any/itemName/recruitId/shipId/templateId picker entirely and go straight
// to demanding that one value, e.g. picking "purchase_item" immediately
// asks for an item name instead of offering a scope choice that doesn't
// apply to it. Action types not listed (hire_recruit -- no recruit id
// exists before the hire happens; assign_crew_to_ship/complete_quest --
// ambiguous which key applies) keep the free-form picker.
export type ActionMatchKey = 'itemName' | 'recruitId' | 'shipId' | 'templateId';
export const ACTION_MATCH_FIELDS: Partial<Record<ActionType, ActionMatchKey>> = {
  purchase_item: 'itemName',
  purchase_quest_item: 'itemName',
  equip_item: 'itemName',
  equip_item_to_recruit: 'itemName',
  assign_item_to_ship: 'itemName',
  send_recruit_to_quest: 'templateId',
};

export const EFFECT_TYPES = ['give_item', 'apply_perk', 'apply_flaw', 'adjust_stat'] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

export const ROLL_TYPES = ['chance'] as const;
export type RollType = (typeof ROLL_TYPES)[number];

export const OUTCOMES = ['success', 'failure', 'neutral'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const ATTRIBUTES = [
  'agility', 'fortitude', 'might', 'learning', 'logic',
  'perception', 'will', 'deception', 'persuasion', 'presence',
] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export const OPERATORS = ['>', '>=', '<', '<=', '=='] as const;
export type Operator = (typeof OPERATORS)[number];

// Mirrors the difficulty tags server/data/mission-names.json's flavor
// templates gate on (see models/tags.ts's TAG_CATALOG "difficulty" entry) --
// a mission node's own difficulty is one of these.
export const MISSION_DIFFICULTIES = ['ROUTINE', 'STANDARD', 'HARD', 'PERILOUS', 'EPIC'] as const;
export type MissionDifficulty = (typeof MISSION_DIFFICULTIES)[number];

export interface Position {
  x: number;
  y: number;
}

export interface Effect {
  type: EffectType;
  params: Record<string, unknown>;
}

export interface Roll {
  type: RollType;
  params: Record<string, unknown>;
}

export interface Seed {
  target: SeedTarget;
  // shop: { itemName: string }; mission: { templateId: string }.
  params: Record<string, unknown>;
  // Author-only context, e.g. why this is being seeded. Not consumed by
  // any engine -- shown in the node panel and in Quick Generation only.
  note?: string;
}

// A 'mission' node's personalized mission -- freeform (this is a bespoke,
// one-off mission the opera itself authors, e.g. "Find the Quasar Key", not
// a reference into server/data/mission-types.json's generic ESCORT/HEIST/
// etc. pool). title/description may reference the same {tagName}
// placeholders as text/completionText (see models/tags.ts).
export interface MissionDetails {
  title: string;
  description?: string;
  difficulty?: MissionDifficulty;
  tags?: string[];
}

export interface GraphNode {
  id: string;
  type: NodeType;
  position?: Position;
  // start: opera-level "on_start_message" equivalent, shown once on entry.
  // story/end: the beat's narrative text.
  text?: string;
  // story
  effects?: Effect[];
  // story/check/seed/mission: opera-level "on_complete_message" equivalent,
  // shown once this node's outgoing link is actually taken (regardless of
  // which condition satisfied it).
  completionText?: string;
  // check
  roll?: Roll;
  // seed: shop items / missions this opera wants seeded, read later by the
  // (not yet built) opera engine. No effect on the current game.
  seeds?: Seed[];
  // mission: injects this personalized mission into the player's mission
  // list and blocks the walk until it resolves, branching on outcome
  // exactly like a check node's roll (see runGeneration).
  mission?: MissionDetails;
  // end
  outcome?: Outcome;
}

export interface Condition {
  type: ConditionType;
  params: Record<string, unknown>;
}

export interface GraphLink {
  id: string;
  from: string;
  to: string;
  priority: number;
  conditions: Condition[];
}

export interface GraphDefinition {
  id: string;
  title: string;
  description?: string;
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphSummary {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
}

export interface ScriptedAction {
  actionType: ActionType;
  payload?: Record<string, unknown>;
}

export interface MockState {
  items: string[];
  perks: string[];
  flaws: string[];
  attributes: Partial<Record<Attribute, number>>;
  // Ordered script of actions the mock player is assumed to have performed,
  // consumed sequentially by action_performed conditions during the walk
  // (see runGeneration's actionCursor).
  actionsPerformed: ScriptedAction[];
  // Mock {tagName} -> value context, same vocabulary as models/tags.ts's
  // TAG_CATALOG, used to render text/completionText during the walk (see
  // runGeneration's use of renderPreview in the server domain module).
  tags: Record<string, string>;
  // Crew count of the mock player's ship, compared against by crew_threshold
  // conditions.
  shipCrewCount: number;
  // Ordered script of outcomes for each mission node the walk is expected to
  // reach -- a mission node doesn't roll dice like a check does (its real
  // outcome comes from actually playing the mission in-game, which this
  // preview can't simulate), so the author scripts it instead, same
  // sequential-peek pattern as actionsPerformed/actionCursor. A mission node
  // reached past the end of this list defaults to 'success'.
  missionOutcomes: Outcome[];
}

export interface GenerationStep {
  nodeId: string;
  type: NodeType;
  text?: string;
  effectsApplied?: Effect[];
  outcome?: Outcome;
  completionText?: string;
  seeds?: Seed[];
  // mission: the personalized mission (title/description rendered through
  // the tag context) this step resolved.
  mission?: MissionDetails;
  // {tagName} placeholders referenced by this step's text/completionText
  // that weren't resolved by the Quick Generation tag editor -- present
  // only when non-empty.
  missingTags?: string[];
}

export interface GenerationResult {
  path: GenerationStep[];
  reason: 'end' | 'dead_end' | 'max_steps_exceeded';
  endedAt?: string;
  finalState: MockState;
}

export function emptyMockState(): MockState {
  return { items: [], perks: [], flaws: [], attributes: {}, actionsPerformed: [], tags: {}, shipCrewCount: 0, missionOutcomes: [] };
}

export function defaultMissionDetails(): MissionDetails {
  return { title: 'New mission' };
}

export function defaultParamsFor(kind: 'condition', type: ConditionType): Record<string, unknown>
export function defaultParamsFor(kind: 'effect', type: EffectType): Record<string, unknown>
export function defaultParamsFor(kind: 'seed', type: SeedTarget): Record<string, unknown>
export function defaultParamsFor(_kind: 'condition' | 'effect' | 'seed', type: string): Record<string, unknown> {
  switch (type) {
    case 'chance':
      return { percentage: 50 };
    case 'has_item':
    case 'give_item':
      return { itemName: '' };
    case 'apply_perk':
      return { perkName: '' };
    case 'apply_flaw':
      return { flawName: '' };
    case 'previous_outcome':
      return { equals: 'success' };
    case 'crew_threshold':
      return { operator: '>=', value: 1 };
    case 'adjust_stat':
      return { attribute: 'agility', amount: 1 };
    case 'action_performed':
      return { actionType: 'execute_command', match: { command: '' } };
    case 'shop':
      return { itemName: '' };
    case 'mission':
      return { templateId: '' };
    default:
      return {};
  }
}

// execute_command requires a command string; action types in
// ACTION_MATCH_FIELDS go straight to their one relevant key; everything
// else defaults to scope:any.
export function defaultActionMatch(actionType: ActionType): Record<string, unknown> {
  if (actionType === 'execute_command') return { command: '' };
  const field = ACTION_MATCH_FIELDS[actionType];
  return field ? { [field]: '' } : { scope: 'any' };
}
