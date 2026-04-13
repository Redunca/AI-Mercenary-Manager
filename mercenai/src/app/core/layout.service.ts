import { Injectable } from '@angular/core';
import { Panel, PanelModule } from '../models/panel';


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
    this.activePanelId = id;
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

    // Supprimer les panels qui ne sont plus dans l'arbre
    for (const id of Object.keys(this.panels).map(Number)) {
      if (!activeIds.has(id)) {
        delete this.panels[id];
      }
    }

    // Ajuster le panneau actif si nécessaire
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
