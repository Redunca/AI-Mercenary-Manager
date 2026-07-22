import { Component, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GraphApiService } from '../core/graph-api.service';
import {
  ACTION_MATCH_FIELDS, ACTION_TYPES, ATTRIBUTES, OUTCOMES, ActionType, Attribute, GenerationResult, MockState, Outcome,
  ScriptedAction, defaultActionMatch,
} from '../models/graph';
import { TAG_CATALOG, exampleTagValues } from '../models/tags';

function parseList(text: string): string[] {
  return text.split(',').map(s => s.trim()).filter(Boolean);
}

// Same match-shape convention as action_performed conditions on links (see
// LinkPanelComponent) -- 'any' means {scope: "any"}, execute_command uses
// {command, args?}, everything else is a single specific-target key.
type MatchKind = 'any' | 'itemName' | 'recruitId' | 'shipId' | 'templateId' | 'seedId';
const MATCH_KEYS: Exclude<MatchKind, 'any'>[] = ['itemName', 'recruitId', 'shipId', 'templateId', 'seedId'];

@Component({
  selector: 'app-quick-generation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quick-generation.component.html',
  styleUrl: './quick-generation.component.scss',
})
export class QuickGenerationComponent {
  readonly graphId = input.required<string>();

  private api = inject(GraphApiService);

  readonly attributes = ATTRIBUTES;
  readonly actionTypes = ACTION_TYPES;
  readonly matchKeys = MATCH_KEYS;
  readonly tagCatalog = TAG_CATALOG;
  readonly outcomes = OUTCOMES;

  readonly itemsText = signal('');
  readonly perksText = signal('');
  readonly flawsText = signal('');
  readonly attributeValues = signal<Partial<Record<Attribute, number>>>({});
  readonly actionsPerformed = signal<ScriptedAction[]>([]);
  readonly seed = signal(String(Math.floor(Math.random() * 1e9)));
  readonly tagValues = signal<Record<string, string>>({});
  readonly shipCrewCount = signal(0);
  readonly missionOutcomes = signal<Outcome[]>([]);
  readonly choicesMade = signal<string[]>([]);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<GenerationResult | null>(null);

  setAttribute(attr: Attribute, value: number): void {
    this.attributeValues.update(v => ({ ...v, [attr]: value }));
  }

  asNumber(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  tagValue(name: string): string {
    return this.tagValues()[name] ?? '';
  }

  setTagValue(name: string, value: string): void {
    this.tagValues.update(v => ({ ...v, [name]: value }));
  }

  fillExampleTags(): void {
    this.tagValues.set(exampleTagValues());
  }

  clearTags(): void {
    this.tagValues.set({});
  }

  randomizeSeed(): void {
    this.seed.set(String(Math.floor(Math.random() * 1e9)));
  }

  addMissionOutcome(): void {
    this.missionOutcomes.update(outcomes => [...outcomes, 'success']);
  }

  setMissionOutcome(index: number, outcome: Outcome): void {
    this.missionOutcomes.update(outcomes => {
      const next = [...outcomes];
      next[index] = outcome;
      return next;
    });
  }

  removeMissionOutcome(index: number): void {
    this.missionOutcomes.update(outcomes => outcomes.filter((_, i) => i !== index));
  }

  addChoiceMade(): void {
    this.choicesMade.update(choices => [...choices, '']);
  }

  setChoiceMade(index: number, optionId: string): void {
    this.choicesMade.update(choices => {
      const next = [...choices];
      next[index] = optionId;
      return next;
    });
  }

  removeChoiceMade(index: number): void {
    this.choicesMade.update(choices => choices.filter((_, i) => i !== index));
  }

  addAction(): void {
    this.actionsPerformed.update(actions => [...actions, { actionType: 'execute_command', payload: { command: '' } }]);
  }

  setActionType(index: number, actionType: ActionType): void {
    this.setAction(index, { actionType, payload: defaultActionMatch(actionType) });
  }

  actionMatchField(actionType: unknown): string | undefined {
    return ACTION_MATCH_FIELDS[actionType as ActionType];
  }

  removeAction(index: number): void {
    this.actionsPerformed.update(actions => actions.filter((_, i) => i !== index));
  }

  private setAction(index: number, action: ScriptedAction): void {
    this.actionsPerformed.update(actions => {
      const next = [...actions];
      next[index] = action;
      return next;
    });
  }

  private setPayload(index: number, payload: Record<string, unknown>): void {
    const action = this.actionsPerformed()[index];
    this.setAction(index, { ...action, payload });
  }

  matchKind(index: number): MatchKind {
    const payload = this.actionsPerformed()[index].payload ?? {};
    for (const key of MATCH_KEYS) {
      if (key in payload) return key;
    }
    return 'any';
  }

  setMatchKind(index: number, kind: MatchKind): void {
    this.setPayload(index, kind === 'any' ? { scope: 'any' } : { [kind]: '' });
  }

  matchValue(index: number, key: string): string {
    const payload = this.actionsPerformed()[index].payload;
    return (payload?.[key] as string) ?? '';
  }

  setMatchValue(index: number, key: string, value: string): void {
    this.setPayload(index, { [key]: value });
  }

  setCommand(index: number, command: string): void {
    const payload = this.actionsPerformed()[index].payload ?? {};
    this.setPayload(index, { ...payload, command });
  }

  argsText(index: number): string {
    const args = this.actionsPerformed()[index].payload?.['args'];
    return Array.isArray(args) ? args.join(', ') : '';
  }

  setArgsText(index: number, text: string): void {
    const payload = this.actionsPerformed()[index].payload ?? {};
    const args = text.trim() ? text.split(',').map(s => s.trim()) : undefined;
    const { args: _drop, ...rest } = payload;
    this.setPayload(index, args ? { ...rest, args } : rest);
  }

  async generate(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const initialState: MockState = {
      items: parseList(this.itemsText()),
      perks: parseList(this.perksText()),
      flaws: parseList(this.flawsText()),
      attributes: this.attributeValues(),
      actionsPerformed: this.actionsPerformed(),
      tags: this.tagValues(),
      shipCrewCount: this.shipCrewCount(),
      missionOutcomes: this.missionOutcomes(),
      choicesMade: this.choicesMade(),
    };
    try {
      this.result.set(await this.api.generate(this.graphId(), initialState, this.seed()));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      this.loading.set(false);
    }
  }
}
