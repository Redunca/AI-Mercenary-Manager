import { Injectable } from '@angular/core';
import { Panel, PanelModule } from '../models/panel';
import { Subject } from 'rxjs';


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
  activePanelChanged = new Subject<number>();

  addPanel(module: PanelModule, data?: any) {
    console.log("Trying to add panel ", module, " with ", data);
    const id = this.nextId++;

    this.panels[id] = { id, module, data };

    if (!this.root) {
      this.root = { type: 'leaf', panelId: id };
    }

    this.activePanelId = id;
    console.log("Existing tree :", this.root);
    console.log("Existing panels :", this.panels);
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
  if (this.panels[id]) {
    this.activePanelId = id;
    this.activePanelChanged.next(id);
  }
}

  private collectPanelIds(node: LayoutNode | null, set: Set<number>) {
  if (!node) return;

  if (node.type === 'leaf') {
    set.add(node.panelId);
    return;
  }

  // split node
  this.collectPanelIds(node.children[0], set);
  this.collectPanelIds(node.children[1], set);
}


  clearInactivePanels() {
    const activeIds = new Set<number>();
    this.collectPanelIds(this.root, activeIds);

    // Remove panels that are no longer in the tree
    for (const id of Object.keys(this.panels).map(Number)) {
      if (!activeIds.has(id)) {
        delete this.panels[id];
      }
    }

    // Adjust the active panel if necessary
    if (this.activePanelId && !activeIds.has(this.activePanelId)) {
      this.activePanelId = activeIds.size ? [...activeIds][0] : null;
    }
  }


  setPanelModule(panelId: number, module: PanelModule, data?: any) {
    const panel = this.panels[panelId];
    if (!panel) return;

    panel.module = module;
    panel.data = data ?? null;
    this.clearInactivePanels();
    this.activePanelChanged.next(this.activePanelId ?? 0);
  }


  split(panelId: number, direction: 'row' | 'column') {
    const newPanelId = this.addPanel(PanelModule.None);
    if (this.root && panelId) {
      this.root = this.replaceLeaf(this.root, panelId, {
        type: 'split',
        direction,
        panelId: -1,
        children: [
          { type: 'leaf', panelId },
          { type: 'leaf', panelId: newPanelId }
        ]
      });
    }
    this.clearInactivePanels();
    this.activePanelChanged.next(this.activePanelId ?? 0);
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
    this.clearInactivePanels();
    //Dans ce cas on vient de fermer le seul panel ouvert, on en ouvre un nouveau
    if(Object.keys(this.panels).length == 0){
      this.addPanel(PanelModule.None);
    }
    this.activePanelChanged.next(this.activePanelId ?? 0);
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

findPath(node: LayoutNode | null, targetId: number, path: LayoutNode[] = []): LayoutNode[] | null {
  if (!node) return null;

  if (node.type === 'leaf') {
    return node.panelId === targetId ? [...path, node] : null;
  }

  const left = this.findPath(node.children[0], targetId, [...path, node]);
  if (left) return left;

  const right = this.findPath(node.children[1], targetId, [...path, node]);
  if (right) return right;

  return null;
}
getSibling(node: LayoutNode, parent: LayoutNode, direction: 'left' | 'right' | 'up' | 'down'): LayoutNode | null {
  if (parent.type !== 'split') return null;

  const [a, b] = parent.children;

  if (parent.direction === 'row') {
    if (direction === 'left' && b === node) return a;
    if (direction === 'right' && a === node) return b;
  }

  if (parent.direction === 'column') {
    if (direction === 'up' && b === node) return a;
    if (direction === 'down' && a === node) return b;
  }

  return null;
}

findLeaf(node: LayoutNode): number {
  if (node.type === 'leaf') return node.panelId;
  return this.findLeaf(node.children[0]);
}


focus(direction: 'left' | 'right' | 'up' | 'down') {
  if (!this.activePanelId || !this.root) return;

  const path = this.findPath(this.root, this.activePanelId);
  if (!path) return;

  // the active leaf is the last element
  const leaf = path[path.length - 1];

  // walk back up the tree
  for (let i = path.length - 2; i >= 0; i--) {
    const parent = path[i];
    const sibling = this.getSibling(leaf, parent, direction);

    if (sibling) {
      const newId = this.findLeaf(sibling);
      this.activePanelId = newId;
      this.activePanelChanged.next(this.activePanelId);
      return;
    }
  }
}


}
