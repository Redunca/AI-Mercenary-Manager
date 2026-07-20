import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GraphService } from '../core/graph.service';
import { ATTRIBUTES, EFFECT_TYPES, Effect, EffectType, GraphNode, OPERATORS, OUTCOMES, Outcome, RollType, defaultParamsFor } from '../models/graph';

@Component({
  selector: 'app-node-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './node-panel.component.html',
  styleUrl: './node-panel.component.scss',
})
export class NodePanelComponent {
  readonly node = input.required<GraphNode>();

  private graphService = inject(GraphService);

  readonly effectTypes = EFFECT_TYPES;
  readonly attributes = ATTRIBUTES;
  readonly operators = OPERATORS;
  readonly outcomes = OUTCOMES;

  setText(text: string): void {
    this.graphService.updateNode(this.node().id, { text });
  }

  setOutcome(outcome: Outcome): void {
    this.graphService.updateNode(this.node().id, { outcome });
  }

  setRollType(type: RollType): void {
    this.graphService.updateNode(this.node().id, { roll: { type, params: defaultParamsFor('condition', type) } });
  }

  setRollParam(key: string, value: unknown): void {
    const node = this.node();
    if (!node.roll) return;
    this.graphService.updateNode(node.id, { roll: { ...node.roll, params: { ...node.roll.params, [key]: value } } });
  }

  addEffect(): void {
    const node = this.node();
    const effect: Effect = { type: 'give_item', params: defaultParamsFor('effect', 'give_item') };
    this.graphService.updateNode(node.id, { effects: [...(node.effects ?? []), effect] });
  }

  setEffectType(index: number, type: EffectType): void {
    const node = this.node();
    const effects = [...(node.effects ?? [])];
    effects[index] = { type, params: defaultParamsFor('effect', type) };
    this.graphService.updateNode(node.id, { effects });
  }

  setEffectParam(index: number, key: string, value: unknown): void {
    const node = this.node();
    const effects = [...(node.effects ?? [])];
    effects[index] = { ...effects[index], params: { ...effects[index].params, [key]: value } };
    this.graphService.updateNode(node.id, { effects });
  }

  removeEffect(index: number): void {
    const node = this.node();
    const effects = (node.effects ?? []).filter((_, i) => i !== index);
    this.graphService.updateNode(node.id, { effects });
  }

  deleteNode(): void {
    const node = this.node();
    if (node.type === 'start') return;
    if (!confirm(`Delete node "${node.id}"? Links to/from it will also be removed.`)) return;
    this.graphService.deleteNode(node.id);
  }

  asNumber(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }
}
