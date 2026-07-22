import { Injectable, computed, inject, signal } from '@angular/core';
import { GraphApiService } from './graph-api.service';
import { GraphDefinition, GraphLink, GraphNode, NodeType, defaultChoiceOptions, defaultMissionDetails } from '../models/graph';

let nodeCounter = 0;
let linkCounter = 0;

function nextNodeId(type: NodeType): string {
  nodeCounter += 1;
  return `${type}-${nodeCounter}-${Date.now().toString(36)}`;
}

function nextLinkId(): string {
  linkCounter += 1;
  return `link-${linkCounter}-${Date.now().toString(36)}`;
}

@Injectable({ providedIn: 'root' })
export class GraphService {
  private api = inject(GraphApiService);

  readonly graph = signal<GraphDefinition | null>(null);
  readonly dirty = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly warnings = signal<string[]>([]);

  readonly selectedNodeId = signal<string | null>(null);
  readonly selectedLinkId = signal<string | null>(null);

  readonly selectedNode = computed(() => {
    const id = this.selectedNodeId();
    return id ? (this.graph()?.nodes.find(n => n.id === id) ?? null) : null;
  });
  readonly selectedLink = computed(() => {
    const id = this.selectedLinkId();
    return id ? (this.graph()?.links.find(l => l.id === id) ?? null) : null;
  });

  async load(id: string): Promise<void> {
    this.loadError.set(null);
    this.selectedNodeId.set(null);
    this.selectedLinkId.set(null);
    try {
      const def = await this.api.getGraph(id);
      this.graph.set(def);
      this.dirty.set(false);
      await this.refreshWarnings();
    } catch (err) {
      this.loadError.set(errorMessage(err));
    }
  }

  async save(): Promise<boolean> {
    const def = this.graph();
    if (!def) return false;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const saved = await this.api.saveGraph(def);
      this.graph.set(saved);
      this.dirty.set(false);
      await this.refreshWarnings();
      return true;
    } catch (err) {
      this.saveError.set(errorMessage(err));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async refreshWarnings(): Promise<void> {
    const def = this.graph();
    if (!def) return;
    try {
      const { warnings } = await this.api.analyzeGraph(def.id);
      this.warnings.set(warnings);
    } catch {
      // Analysis is advisory only; ignore failures (e.g. unsaved new graph).
    }
  }

  updateMeta(title: string, description: string): void {
    this.mutate(def => ({ ...def, title, description }));
  }

  addNode(type: Exclude<NodeType, 'start'>, position: { x: number; y: number }): void {
    const id = nextNodeId(type);
    const base: GraphNode = { id, type, position };
    const node: GraphNode =
      type === 'story' ? { ...base, text: 'New story beat.', effects: [] } :
      type === 'check' ? { ...base, roll: { type: 'chance', params: { percentage: 50 } } } :
      type === 'seed' ? { ...base, seeds: [] } :
      type === 'mission' ? { ...base, mission: defaultMissionDetails() } :
      type === 'choice' ? { ...base, text: 'What do you do?', choiceOptions: defaultChoiceOptions() } :
      { ...base, outcome: 'neutral', text: 'The end.' };

    this.mutate(def => ({ ...def, nodes: [...def.nodes, node] }));
    this.selectedLinkId.set(null);
    this.selectedNodeId.set(id);
  }

  updateNode(id: string, patch: Partial<GraphNode>): void {
    this.mutate(def => ({
      ...def,
      nodes: def.nodes.map(n => (n.id === id ? { ...n, ...patch } : n)),
    }));
  }

  moveNode(id: string, position: { x: number; y: number }): void {
    this.updateNode(id, { position });
  }

  resizeNode(id: string, size: { width: number; height: number }): void {
    this.updateNode(id, { size });
  }

  deleteNode(id: string): void {
    this.mutate(def => ({
      ...def,
      nodes: def.nodes.filter(n => n.id !== id),
      links: def.links.filter(l => l.from !== id && l.to !== id),
    }));
    if (this.selectedNodeId() === id) this.selectedNodeId.set(null);
  }

  addLink(from: string, to: string): void {
    const link: GraphLink = { id: nextLinkId(), from, to, priority: 0, conditions: [] };
    this.mutate(def => ({ ...def, links: [...def.links, link] }));
    this.selectedNodeId.set(null);
    this.selectedLinkId.set(link.id);
  }

  updateLink(id: string, patch: Partial<GraphLink>): void {
    this.mutate(def => ({
      ...def,
      links: def.links.map(l => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }

  deleteLink(id: string): void {
    this.mutate(def => ({ ...def, links: def.links.filter(l => l.id !== id) }));
    if (this.selectedLinkId() === id) this.selectedLinkId.set(null);
  }

  selectNode(id: string | null): void {
    this.selectedNodeId.set(id);
    if (id) this.selectedLinkId.set(null);
  }

  selectLink(id: string | null): void {
    this.selectedLinkId.set(id);
    if (id) this.selectedNodeId.set(null);
  }

  private mutate(fn: (def: GraphDefinition) => GraphDefinition): void {
    const current = this.graph();
    if (!current) return;
    this.graph.set(fn(current));
    this.dirty.set(true);
  }
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'error' in err) {
    const inner = (err as { error?: unknown }).error;
    if (inner && typeof inner === 'object' && 'error' in inner) {
      return String((inner as { error?: unknown }).error);
    }
  }
  return err instanceof Error ? err.message : 'Unknown error';
}
