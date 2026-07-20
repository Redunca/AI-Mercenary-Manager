import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GraphService } from '../core/graph.service';
import { CONDITION_TYPES, Condition, ConditionType, GraphLink, OUTCOMES, defaultParamsFor } from '../models/graph';

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
  readonly outcomes = OUTCOMES;

  setPriority(priority: number): void {
    this.graphService.updateLink(this.link().id, { priority });
  }

  addCondition(): void {
    const link = this.link();
    const condition: Condition = { type: 'chance', params: defaultParamsFor('condition', 'chance') };
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
    conditions[index] = { ...conditions[index], params: { ...conditions[index].params, [key]: value } };
    this.graphService.updateLink(link.id, { conditions });
  }

  removeCondition(index: number): void {
    const link = this.link();
    this.graphService.updateLink(link.id, { conditions: link.conditions.filter((_, i) => i !== index) });
  }

  deleteLink(): void {
    if (!confirm('Delete this link?')) return;
    this.graphService.deleteLink(this.link().id);
  }

  asNumber(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }
}
