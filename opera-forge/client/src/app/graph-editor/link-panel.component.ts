import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GraphService } from '../core/graph.service';
import {
  ACTION_MATCH_FIELDS,
  ACTION_TYPES,
  CONDITION_TYPES,
  Condition,
  ConditionType,
  GraphLink,
  OPERATORS,
  OUTCOMES,
  ActionType,
  defaultActionMatch,
  defaultParamsFor,
} from '../models/graph';

type MatchKind = 'any' | 'itemName' | 'recruitId' | 'shipId' | 'templateId' | 'seedId';
const MATCH_KEYS: Exclude<MatchKind, 'any'>[] = [
  'itemName',
  'recruitId',
  'shipId',
  'templateId',
  'seedId',
];

@Component({
  selector: 'app-link-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './link-panel.component.html',
  styleUrl: './link-panel.component.scss',
})
export class LinkPanelComponent {
  readonly link = input.required<GraphLink>();

  private graphService = inject(GraphService);

  readonly conditionTypes = CONDITION_TYPES;
  readonly operators = OPERATORS;
  readonly outcomes = OUTCOMES;
  readonly actionTypes = ACTION_TYPES;
  readonly matchKeys = MATCH_KEYS;

  // The 'choice_made' condition's optionId is defined by the link's source
  // node (a 'choice' node's own choiceOptions), not a fixed enum like
  // OUTCOMES -- look it up so the picker can offer a dropdown instead of a
  // freeform id the author has to retype correctly.
  choiceOptionsForLink(): { id: string; label: string }[] {
    const sourceNode = this.graphService.graph()?.nodes.find((n) => n.id === this.link().from);
    return sourceNode?.type === 'choice' ? (sourceNode.choiceOptions ?? []) : [];
  }

  setPriority(priority: number): void {
    this.graphService.updateLink(this.link().id, { priority });
  }

  addCondition(): void {
    const link = this.link();
    const condition: Condition = {
      type: 'chance',
      params: defaultParamsFor('condition', 'chance'),
    };
    this.graphService.updateLink(link.id, { conditions: [...link.conditions, condition] });
  }

  setConditionType(index: number, type: ConditionType): void {
    const link = this.link();
    const conditions = [...link.conditions];
    conditions[index] = { type, params: defaultParamsFor('condition', type) };
    this.graphService.updateLink(link.id, { conditions });
  }

  setConditionParam(index: number, key: string, value: unknown): void {
    const link = this.link();
    const conditions = [...link.conditions];
    conditions[index] = {
      ...conditions[index],
      params: { ...conditions[index].params, [key]: value },
    };
    this.graphService.updateLink(link.id, { conditions });
  }

  removeCondition(index: number): void {
    const link = this.link();
    this.graphService.updateLink(link.id, {
      conditions: link.conditions.filter((_, i) => i !== index),
    });
  }

  // Sets actionType and match in one shot rather than two chained
  // setConditionParam() calls -- each of those independently reads this
  // component's `link()` input to build its update, and a second call made
  // synchronously right after the first would still see the pre-update
  // value (this component's input signal only refreshes on Angular's next
  // change detection, not instantly within the same handler), so it would
  // silently clobber the actionType change with a match-only update built
  // from stale conditions.
  setActionType(index: number, actionType: ActionType): void {
    const link = this.link();
    const conditions = [...link.conditions];
    conditions[index] = {
      ...conditions[index],
      params: { actionType, match: defaultActionMatch(actionType) },
    };
    this.graphService.updateLink(link.id, { conditions });
  }

  actionMatchField(actionType: unknown): string | undefined {
    return ACTION_MATCH_FIELDS[actionType as ActionType];
  }

  setCommand(index: number, command: string): void {
    const match = (this.link().conditions[index].params['match'] as Record<string, unknown>) ?? {};
    this.setConditionParam(index, 'match', { ...match, command });
  }

  argsText(index: number): string {
    const match = this.link().conditions[index].params['match'] as
      Record<string, unknown> | undefined;
    const args = match?.['args'];
    return Array.isArray(args) ? args.join(', ') : '';
  }

  setArgsText(index: number, text: string): void {
    const match = (this.link().conditions[index].params['match'] as Record<string, unknown>) ?? {};
    const args = text.trim() ? text.split(',').map((s) => s.trim()) : undefined;
    const { args: _drop, ...rest } = match;
    this.setConditionParam(index, 'match', args ? { ...rest, args } : rest);
  }

  matchKind(index: number): MatchKind {
    const match = this.link().conditions[index].params['match'] as
      Record<string, unknown> | undefined;
    if (!match) return 'any';
    for (const key of MATCH_KEYS) {
      if (key in match) return key;
    }
    return 'any';
  }

  setMatchKind(index: number, kind: MatchKind): void {
    this.setConditionParam(index, 'match', kind === 'any' ? { scope: 'any' } : { [kind]: '' });
  }

  matchValue(index: number, key: string): string {
    const match = this.link().conditions[index].params['match'] as
      Record<string, unknown> | undefined;
    return (match?.[key] as string) ?? '';
  }

  setMatchValue(index: number, key: string, value: string): void {
    this.setConditionParam(index, 'match', { [key]: value });
  }

  deleteLink(): void {
    if (!confirm('Delete this link?')) return;
    this.graphService.deleteLink(this.link().id);
  }

  asNumber(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }
}
