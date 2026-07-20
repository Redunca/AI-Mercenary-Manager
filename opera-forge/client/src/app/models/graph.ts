// Mirrors opera-forge/server/src/domain/graph.js. Kept as a separate,
// hand-written copy rather than a shared package -- these are two
// independent apps (client/server) per the plan.

export const NODE_TYPES = ['start', 'story', 'check', 'end'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const CONDITION_TYPES = ['chance', 'has_item', 'has_perk', 'has_flaw', 'previous_outcome', 'attribute_threshold'] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const EFFECT_TYPES = ['give_item', 'apply_perk', 'apply_flaw', 'adjust_stat'] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

export const ROLL_TYPES = ['chance', 'attribute_threshold'] as const;
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

export interface MockState {
  items: string[];
  perks: string[];
  flaws: string[];
  attributes: Partial<Record<Attribute, number>>;
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
  return { items: [], perks: [], flaws: [], attributes: {} };
}

export function defaultParamsFor(kind: 'condition', type: ConditionType): Record<string, unknown>
export function defaultParamsFor(kind: 'effect', type: EffectType): Record<string, unknown>
export function defaultParamsFor(_kind: 'condition' | 'effect', type: string): Record<string, unknown> {
  switch (type) {
    case 'chance':
      return { percentage: 50 };
    case 'has_item':
    case 'give_item':
      return { itemName: '' };
    case 'has_perk':
    case 'apply_perk':
      return { perkName: '' };
    case 'has_flaw':
    case 'apply_flaw':
      return { flawName: '' };
    case 'previous_outcome':
      return { equals: 'success' };
    case 'attribute_threshold':
      return { attribute: 'agility', operator: '>=', value: 0 };
    case 'adjust_stat':
      return { attribute: 'agility', amount: 1 };
    default:
      return {};
  }
}
