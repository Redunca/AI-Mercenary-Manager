import { Component, Input, OnInit } from '@angular/core';
import { Recruit } from '../../../models/recruit.model';
import { RecruitState } from '../../../models/recruit-state.enum';
import { Attributes } from '../../../models/attributes.model';
import { ModuleDisplayBaseComponent } from '../../module-display-base/module-display-base.component';
import { ModulesType } from '../../../models/modules-type.enum';

@Component({
  selector: 'app-recruit-list',
  standalone: true,
  imports: [],
  templateUrl: './recruit-list.component.html',
  styleUrl: './recruit-list.component.sass',
})
export class RecruitListComponent
  extends ModuleDisplayBaseComponent
  implements OnInit
{

  recruits: Recruit[] = [];
    /**
   * Recruit List
   */
  constructor() {
    super();
    this.commands["detail"] = ():void => {};
  }

  ngOnInit(): void {
    this.module = ModulesType.RecruitList;
    this.moduleTitle = "Recruit List"
    this.populateRecruitList();
  }
  

  private populateRecruitList(): void {
    this.recruits.push({
      name: 'Bob',
      id: 'alf-adf-4567',
      state: RecruitState.Available,
      attributes: { level: 1, mental: 0, physical: 3, social: 5 } as Attributes,
    } as Recruit);
    this.recruits.push({
      name: 'Jen',
      id: 'fgr-vlk-8463',
      state: RecruitState.Available,
      attributes: { level: 1, mental: 3, physical: 5, social: 0 } as Attributes,
    } as Recruit);
    this.recruits.push({
      name: 'Bilbur',
      id: 'poi-aze-2356',
      state: RecruitState.Available,
      attributes: { level: 1, mental: 5, physical: 0, social: 3 } as Attributes,
    } as Recruit);
    this.recruits.push({
      name: 'Desctructor',
      id: 'sdf-aze-1234',
      state: RecruitState.Available,
      attributes: { level: 1, mental: 3, physical: 0, social: 5 } as Attributes,
    } as Recruit);
  }
}
