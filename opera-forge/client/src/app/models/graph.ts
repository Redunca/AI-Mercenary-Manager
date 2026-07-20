// Mirrors opera-forge/server/src/domain/graph.js. Kept as a separate,
// hand-written copy rather than a shared package -- these are two
// independent apps (client/server) per the plan.

export const NODE_TYPES = ['start', 'story', 'check', 'end'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const CONDITION_TYPES = ['chance', 'has_item', 'previous_outcome'] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

// Mirrors the main game's remaining opera STEP_TYPES (server/src/domain/opera.js)
// so a story graph can require the same real-game beats the tutorial's opera
// checklist does. execute_command is covered by request_command below;
// equip_item_to_recruit is omitted because in the main game it's just
// equip_item under a different match shape, not a distinct action.
export const EFFECT_TYPES = [
  'give_item', 'adjust_stat', 'start_combat', 'request_command',
  'hire_recruit', 'assign_crew_to_ship', 'complete_quest',
  'purchase_item', 'purchase_quest_item', 'equip_item',
  'assign_item_to_ship', 'send_recruit_to_quest',
] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

// Mirrors the main game's combat difficulty ladder (server/src/domain/combat.js
// BOSS_TABLE). Only the difficulty is modeled here -- the main game abstracts
// a whole encounter into one difficulty-scaled combatant.
export const DIFFICULTIES = ['ROUTINE', 'STANDARD', 'HARD', 'PERILOUS', 'EPIC'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const ROLL_TYPES = ['chance'] as const;
export type RollType = (typeof ROLL_TYPES)[number];

export const OUTCOMES = ['success', 'failure', 'neutral'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const ATTRIBUTES = [
  'agility', 'fortitude', 'might', 'learning', 'logic',
  'perception', 'will', 'deception', 'persuasion', 'presence',
] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

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

export interface GraphNode {
  id: string;
  type: NodeType;
  position?: Position;
  // story
  text?: string;
  effects?: Effect[];
  // check
  roll?: Roll;
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

export interface CombatRecord {
  difficulty: Difficulty;
  enemyName: string;
  outcome: Outcome;
}

export interface CommandRecord {
  command: string;
  args: string;
}

// A logged occurrence of one of the STEP_TYPES-mirroring "beat" effects
// (hire_recruit, complete_quest, equip_item, etc.) -- these have no other
// state to mutate, so applying one just appends here.
export interface ActionRecord {
  type: EffectType;
  label: string;
}

// The player state seeded before a quick-generation walk starts.
export interface InitialMockState {
  items: string[];
  attributes: Partial<Record<Attribute, number>>;
}

// InitialMockState plus what a walk accumulates as it runs -- combats,
// requested commands, and logged beats are only ever produced by effects
// along the path, never seeded up front.
export interface MockState extends InitialMockState {
  combatsFought: CombatRecord[];
  commandsRequested: CommandRecord[];
  actionsTaken: ActionRecord[];
}

export interface GenerationStep {
  nodeId: string;
  type: NodeType;
  text?: string;
  effectsApplied?: Effect[];
  outcome?: Outcome;
}

export interface GenerationResult {
  path: GenerationStep[];
  reason: 'end' | 'dead_end' | 'max_steps_exceeded';
  endedAt?: string;
  finalState: MockState;
}

export function emptyMockState(): MockState {
  return { items: [], attributes: {}, combatsFought: [], commandsRequested: [], actionsTaken: [] };
}

export function defaultParamsFor(kind: 'condition', type: ConditionType): Record<string, unknown>
export function defaultParamsFor(kind: 'effect', type: EffectType): Record<string, unknown>
export function defaultParamsFor(_kind: 'condition' | 'effect', type: string): Record<string, unknown> {
  switch (type) {
    case 'chance':
      return { percentage: 50 };
    case 'has_item':
    case 'give_item':
    case 'purchase_quest_item':
      return { itemName: '' };
    case 'previous_outcome':
      return { equals: 'success' };
    case 'adjust_stat':
      return { attribute: 'agility', amount: 1 };
    case 'start_combat':
      return { difficulty: 'STANDARD', enemyName: '' };
    case 'request_command':
      return { command: '', args: '' };
    case 'hire_recruit':
    case 'assign_crew_to_ship':
    case 'complete_quest':
    case 'purchase_item':
    case 'equip_item':
    case 'assign_item_to_ship':
    case 'send_recruit_to_quest':
      return { label: '' };
    default:
      return {};
  }
}
