import { Injectable } from '@angular/core';
import { ModulesType } from '../models/modules-type.enum';
import { ModuleDisplayBaseComponent } from '../modules/module-display-base/module-display-base.component';

@Injectable({
  providedIn: 'root'
})
export class LayoutService {


  pannels = [];

  public activePanel : ModuleDisplayBaseComponent;

  constructor() { 

    this.activePanel = new ModuleDisplayBaseComponent();
  }

  addPanel(panelType: ModulesType){

  }

  removePanel(panel: ModuleDisplayBaseComponent){

  }

  setActivePanel(panel: ModuleDisplayBaseComponent){

  }
}
