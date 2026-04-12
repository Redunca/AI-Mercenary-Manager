import { Injectable } from '@angular/core';
import { Panel } from '../models/panel';

@Injectable({
  providedIn: 'root'
})
export class LayoutService {

  private nextId = 1;

  panels: Panel[] = [];
  activePanelId: number | null = null;

  addPanel(module: string, data?: any) {
  const panel: Panel = {
    id: this.nextId++,
    module,
    data: data ?? null,
    terminal: undefined
  };

  this.panels.push(panel);
  this.activePanelId = panel.id;
}
  getPanelById(panelId: number) {
    return this.panels.find(panel => panel.id === panelId);
  }

  removePanel(id: number) {
    this.panels = this.panels.filter(p => p.id !== id);
    if (this.activePanelId === id) {
      this.activePanelId = this.panels.length ? this.panels[0].id : null;
    }
  }

  setActivePanel(id: number) {
    this.activePanelId = id;
  }
}