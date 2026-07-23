import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Connection,
  ConnectionControllerDirective,
  ConnectionSettings,
  Edge,
  EdgeLabelHtmlTemplateDirective,
  HandleComponent,
  HtmlTemplateNode,
  NodeChange,
  EdgeChange,
  NodeHtmlTemplateDirective,
  ResizableComponent,
  VflowComponent,
} from 'ngx-vflow';
import { GraphService } from '../core/graph.service';
import { GraphLink, GraphNode } from '../models/graph';
import { NodePanelComponent } from './node-panel.component';
import { LinkPanelComponent } from './link-panel.component';
import { QuickGenerationComponent } from './quick-generation.component';

type VNode = HtmlTemplateNode<GraphNode>;

// A node's live width/height, once ngx-vflow's own resize handles take over
// (see the `resizable` div in the template), lives in ngx-vflow's internal
// model, not ours -- our persisted `size` only needs to seed that model on
// its first mount. Handing ngx-vflow a brand-new vnode object (see
// vflowNodes below) whenever `size` changes forces it to remount the node,
// which re-triggers that same first-mount seeding and can bounce the live
// size back to a stale value. Comparing nodes with `size` excluded lets a
// resize-only update reuse the existing vnode/mount and skip that churn.
function sameNodeIgnoringSize(a: GraphNode, b: GraphNode): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof GraphNode>;
  keys.delete('size');
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

@Component({
  selector: 'app-graph-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    VflowComponent,
    HandleComponent,
    NodeHtmlTemplateDirective,
    EdgeLabelHtmlTemplateDirective,
    ConnectionControllerDirective,
    ResizableComponent,
    NodePanelComponent,
    LinkPanelComponent,
    QuickGenerationComponent,
  ],
  templateUrl: './graph-editor.component.html',
  styleUrl: './graph-editor.component.scss',
})
export class GraphEditorComponent implements OnInit, OnDestroy {
  readonly graphId = input.required<string>();
  readonly back = output<void>();

  readonly graphService = inject(GraphService);

  readonly showGeneration = signal(false);

  readonly connectionSettings: ConnectionSettings = {
    validator: (connection: Connection) => connection.source !== connection.target,
  };

  // ngx-vflow reconciles [nodes]/[edges] by object identity, not just id --
  // handing it a brand new wrapper object for every entry on every graph
  // edit causes it to tear down and remount unrelated nodes (visible as a
  // "grow" flicker, and fatal to an in-progress drag, since the DOM element
  // d3-drag is bound to gets swapped out mid-gesture). Since unedited nodes
  // keep the same object reference across our immutable domain updates
  // (see GraphService.mutate), we cache wrappers keyed by that reference so
  // only genuinely-changed nodes/links get a new wrapper.
  private nodeWrapperCache = new Map<string, { domainNode: GraphNode; vnode: VNode }>();
  private linkWrapperCache = new Map<string, { domainLink: GraphLink; edge: Edge<GraphLink> }>();
  private positionDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private sizeDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly vflowNodes = computed<VNode[]>(() => {
    const def = this.graphService.graph();
    if (!def) return [];
    const nextCache = new Map<string, { domainNode: GraphNode; vnode: VNode }>();
    const nodes = def.nodes.map((node) => {
      const cached = this.nodeWrapperCache.get(node.id);
      const reusable =
        cached && (cached.domainNode === node || sameNodeIgnoringSize(cached.domainNode, node));
      const entry = reusable
        ? { domainNode: node, vnode: cached!.vnode }
        : {
            domainNode: node,
            vnode: {
              id: node.id,
              type: 'html-template',
              point: node.position ?? { x: 0, y: 0 },
              width: node.size?.width ?? 220,
              height: node.size?.height ?? 96,
              draggable: true,
              data: node,
            } as VNode,
          };
      nextCache.set(node.id, entry);
      return entry.vnode;
    });
    this.nodeWrapperCache = nextCache;
    return nodes;
  });

  readonly vflowEdges = computed<Edge<GraphLink>[]>(() => {
    const def = this.graphService.graph();
    if (!def) return [];
    const nextCache = new Map<string, { domainLink: GraphLink; edge: Edge<GraphLink> }>();
    const edges = def.links.map((link) => {
      const cached = this.linkWrapperCache.get(link.id);
      const entry =
        cached && cached.domainLink === link
          ? cached
          : {
              domainLink: link,
              edge: {
                id: link.id,
                source: link.from,
                target: link.to,
                type: 'default' as const,
                data: link,
                edgeLabels: {
                  center: { type: 'html-template' as const, data: link },
                },
              },
            };
      nextCache.set(link.id, entry);
      return entry.edge;
    });
    this.linkWrapperCache = nextCache;
    return edges;
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
    if (node.type === 'start') return node.text ? `Entry point — ${node.text}` : 'Entry point';
    if (node.type === 'story') return node.text ?? '';
    if (node.type === 'check') {
      const roll = node.roll;
      if (roll?.type === 'chance') return `Roll: ${roll.params['percentage']}% chance`;
      return 'Roll: unconfigured';
    }
    if (node.type === 'seed') {
      const seeds = node.seeds ?? [];
      if (seeds.length === 0) return 'Seeds: (none configured)';
      return `Seeds: ${seeds.map((s) => (s.target === 'shop' ? `shop item "${s.params['itemName'] || '?'}"` : `mission "${s.params['templateId'] || '?'}"`)).join(', ')}`;
    }
    if (node.type === 'mission') {
      const mission = node.mission;
      if (!mission?.title) return 'Mission: (untitled)';
      return `Mission${mission.difficulty ? ` (${mission.difficulty})` : ''}: ${mission.title}`;
    }
    if (node.type === 'choice') {
      const options = node.choiceOptions ?? [];
      const labels = options.map((o) => o.label || o.id).join(' / ');
      return `Choice: ${node.text ?? ''}${labels ? ` [${labels}]` : ''}`;
    }
    return `Outcome: ${node.outcome ?? 'unset'} — ${node.text ?? ''}`;
  }

  addNode(type: 'story' | 'check' | 'seed' | 'mission' | 'choice' | 'end'): void {
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
        // ngx-vflow's own NodeModel signal drives the node's visual
        // position live while dragging -- it doesn't need our [nodes]
        // input to change frame-by-frame. Committing every intermediate
        // point straight into the domain model would rebuild the whole
        // wrapper cache mid-gesture and (per the comment above) tear down
        // the very node being dragged, killing the drag. Debounce so we
        // only persist once the pointer settles.
        // ngx-vflow also reports a 'position' change with the node's
        // *current, unmoved* point around unrelated updates (e.g. a
        // resize) -- committing that no-op would hand vflowNodes a new
        // `position` object reference for a value that didn't actually
        // change, defeating sameNodeIgnoringSize's reuse check below and
        // forcing the same disruptive remount it exists to avoid.
        const current = this.graphService.graph()?.nodes.find((n) => n.id === change.id);
        const currentPoint = current?.position ?? { x: 0, y: 0 };
        if (currentPoint.x !== change.point.x || currentPoint.y !== change.point.y) {
          this.debouncedMoveNode(change.id, change.point);
        }
      } else if (change.type === 'size') {
        // ngx-vflow reports a node's rendered box size on every layout
        // pass, not just on an actual drag-resize (e.g. once on initial
        // mount) -- only treat it as a user edit (dirty + persisted) when
        // it actually differs from what's already on the domain node, so
        // merely opening/viewing a graph doesn't mark it dirty.
        const current = this.graphService.graph()?.nodes.find((n) => n.id === change.id);
        const currentSize = current?.size ?? { width: 220, height: 96 };
        if (currentSize.width !== change.size.width || currentSize.height !== change.size.height) {
          // Same rationale as the position debounce above: ngx-vflow's own
          // resize drag drives the node's live size, and rebuilding the
          // wrapper cache mid-drag would tear down the node being resized.
          this.debouncedResizeNode(change.id, change.size);
        }
      } else if (change.type === 'select') {
        if (change.selected) this.graphService.selectNode(change.id);
        else if (this.graphService.selectedNodeId() === change.id)
          this.graphService.selectNode(null);
      }
    }
  }

  private debouncedMoveNode(id: string, point: { x: number; y: number }): void {
    const existing = this.positionDebounceTimers.get(id);
    if (existing) clearTimeout(existing);
    this.positionDebounceTimers.set(
      id,
      setTimeout(() => {
        this.positionDebounceTimers.delete(id);
        this.graphService.moveNode(id, point);
      }, 250),
    );
  }

  private debouncedResizeNode(id: string, size: { width: number; height: number }): void {
    const existing = this.sizeDebounceTimers.get(id);
    if (existing) clearTimeout(existing);
    this.sizeDebounceTimers.set(
      id,
      setTimeout(() => {
        this.sizeDebounceTimers.delete(id);
        this.graphService.resizeNode(id, size);
      }, 250),
    );
  }

  ngOnDestroy(): void {
    for (const timer of this.positionDebounceTimers.values()) clearTimeout(timer);
    this.positionDebounceTimers.clear();
    for (const timer of this.sizeDebounceTimers.values()) clearTimeout(timer);
    this.sizeDebounceTimers.clear();
  }

  onEdgesChange(changes: EdgeChange[]): void {
    for (const change of changes) {
      if (change.type === 'select') {
        if (change.selected) this.graphService.selectLink(change.id);
        else if (this.graphService.selectedLinkId() === change.id)
          this.graphService.selectLink(null);
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
