import { Injectable } from '@angular/core';
import { Panel } from '../models/panel';


export type LayoutNode =
  | {
    type: 'leaf';
    panelId: number;
  }
  | {
    type: 'split';
    direction: 'row' | 'column';
    panelId: number;
    children: [LayoutNode, LayoutNode];
  };

@Injectable({
  providedIn: 'root'
})
export class LayoutService {

  private nextId = 1;
  root: LayoutNode | null = null;
  panels: Record<number, Panel> = {};
  activePanelId: number | null = null;

  addPanel(module: string, data?: any) {
    const id = this.nextId++;

    this.panels[id] = { id, module, data };

    if (!this.root) {
      this.root = { type: 'leaf', panelId: id };
    }

    this.activePanelId = id;
    return id;
  }
  getPanelById(panelId: number) {
    return this.panels[panelId] ?? null;
  }

  removePanel(id: number) {
    delete this.panels[id];

    if (this.activePanelId === id) {
      const remaining = Object.keys(this.panels).map(Number);
      this.activePanelId = remaining.length ? remaining[0] : null;
    }
  }

  setActivePanel(id: number) {
    this.activePanelId = id;
  }

  split(panelId: number, direction: 'row' | 'column') {
    const nodeId = this.nextId++;
    const newPanelId = this.addPanel('none');
    if (this.root && panelId) {
      this.root = this.replaceLeaf(this.root, panelId, {
        type: 'split',
        direction,
        panelId: nodeId,
        children: [
          { type: 'leaf', panelId },
          { type: 'leaf', panelId: newPanelId }
        ]
      });
    }

  }

  removeLeaf(node: LayoutNode, targetId: number): LayoutNode | null {
    if (node.type === 'leaf') {
      return node.panelId === targetId ? null : node;
    }

    const left = this.removeLeaf(node.children[0], targetId);
    const right = this.removeLeaf(node.children[1], targetId);

    if (!left && !right) return null;
    if (!left) return right!;
    if (!right) return left!;

    return { ...node, children: [left, right] };
  }
  closePanel(panelId: number) {
    if (this.root) {
      this.root = this.removeLeaf(this.root, panelId);
    }
  }

  replaceLeaf(node: LayoutNode, targetId: number, replacement: LayoutNode): LayoutNode {
    if (node.type === 'leaf') {
      return node.panelId === targetId ? replacement : node;
    }

    return {
      ...node,
      children: [
        this.replaceLeaf(node.children[0], targetId, replacement),
        this.replaceLeaf(node.children[1], targetId, replacement)
      ]
    };
  }
}
