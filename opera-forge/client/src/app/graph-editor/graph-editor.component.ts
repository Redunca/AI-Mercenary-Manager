import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Connection, ConnectionControllerDirective, ConnectionSettings, Edge, HandleComponent, HtmlTemplateNode,
  NodeChange, EdgeChange, NodeHtmlTemplateDirective, VflowComponent,
} from 'ngx-vflow';
import { GraphService } from '../core/graph.service';
import { GraphLink, GraphNode } from '../models/graph';
import { NodePanelComponent } from './node-panel.component';
import { LinkPanelComponent } from './link-panel.component';
import { QuickGenerationComponent } from './quick-generation.component';

type VNode = HtmlTemplateNode<GraphNode>;

@Component({
  selector: 'app-graph-editor',
  standalone: true,
  imports: [
    CommonModule, FormsModule, VflowComponent, HandleComponent, NodeHtmlTemplateDirective, ConnectionControllerDirective,
    NodePanelComponent, LinkPanelComponent, QuickGenerationComponent,
  ],
  templateUrl: './graph-editor.component.html',
  styleUrl: './graph-editor.component.scss',
})
export class GraphEditorComponent implements OnInit {
  readonly graphId = input.required<string>();
  readonly back = output<void>();

  readonly graphService = inject(GraphService);

  readonly showGeneration = signal(false);

  readonly connectionSettings: ConnectionSettings = {
    validator: (connection: Connection) => connection.source !== connection.target,
  };

  readonly vflowNodes = computed<VNode[]>(() => {
    const def = this.graphService.graph();
    if (!def) return [];
    return def.nodes.map(node => ({
      id: node.id,
      type: 'html-template',
      point: node.position ?? { x: 0, y: 0 },
      width: 220,
      height: 96,
      draggable: true,
      data: node,
    }));
  });

  readonly vflowEdges = computed<Edge<GraphLink>[]>(() => {
    const def = this.graphService.graph();
    if (!def) return [];
    return def.links.map(link => ({
      id: link.id,
      source: link.from,
      target: link.to,
      type: 'default',
      data: link,
      edgeLabels: {
        center: { type: 'default', text: this.linkSummary(link) },
      },
    }));
  });

  async ngOnInit(): Promise<void> {
    await this.graphService.load(this.graphId());
  }

  linkSummary(link: GraphLink): string {
    const parts: string[] = [];
    if (link.priority) parts.push(`p${link.priority}`);
    if (link.conditions.length === 0) parts.push('always');
    else parts.push(`${link.conditions.length} cond.`);
    return parts.join(' · ');
  }

  nodePreview(node: GraphNode): string {
    if (node.type === 'start') return 'Entry point';
    if (node.type === 'story') return node.text ?? '';
    if (node.type === 'check') {
      const roll = node.roll;
      if (roll?.type === 'chance') return `Roll: ${roll.params['percentage']}% chance`;
      if (roll?.type === 'attribute_threshold') {
        return `Roll: ${roll.params['attribute']} ${roll.params['operator']} ${roll.params['value']}`;
      }
      return 'Roll: unconfigured';
    }
    return `Outcome: ${node.outcome ?? 'unset'} — ${node.text ?? ''}`;
  }

  addNode(type: 'story' | 'check' | 'end'): void {
    const point = { x: 80 + Math.random() * 400, y: 80 + Math.random() * 300 };
    this.graphService.addNode(type, point);
  }

  // Node/link deletion is handled exclusively via the explicit "Delete"
  // buttons in the side panels (see NodePanelComponent/LinkPanelComponent),
  // not via these change events. ngx-vflow's own 'remove' NodeChange/
  // EdgeChange events fire not just on a real user delete-key press but
  // also as an artifact of the [nodes]/[edges] inputs being rebuilt with
  // new object identities on every edit (which we always do, since the
  // graph is derived from an immutable domain model) -- reacting to them
  // here caused a runaway feedback loop that wiped the entire graph after
  // any single edit.
  onNodesChange(changes: NodeChange[]): void {
    for (const change of changes) {
      if (change.type === 'position') {
        this.graphService.moveNode(change.id, change.point);
      } else if (change.type === 'select') {
        if (change.selected) this.graphService.selectNode(change.id);
        else if (this.graphService.selectedNodeId() === change.id) this.graphService.selectNode(null);
      }
    }
  }

  onEdgesChange(changes: EdgeChange[]): void {
    for (const change of changes) {
      if (change.type === 'select') {
        if (change.selected) this.graphService.selectLink(change.id);
        else if (this.graphService.selectedLinkId() === change.id) this.graphService.selectLink(null);
      }
    }
  }

  onConnect(connection: Connection): void {
    this.graphService.addLink(connection.source, connection.target);
  }

  async save(): Promise<void> {
    await this.graphService.save();
  }
}
