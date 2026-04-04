import { Component, OnInit } from '@angular/core';
import { ModuleDisplayBaseComponent } from '../../module-display-base/module-display-base.component';
import { ModulesType } from '../../../models/modules-type.enum';

@Component({
  selector: 'app-recruit-detail',
  standalone: true,
  imports: [],
  templateUrl: './recruit-detail.component.html',
  styleUrl: './recruit-detail.component.sass'
})
export class RecruitDetailComponent extends ModuleDisplayBaseComponent implements OnInit{
  
  /**
   * RecruitDetail
   */
  constructor() {
    super();
    this.commands["rename"] = ():void => {};
  }
  
  ngOnInit(): void {
    this.module = ModulesType.RecruitDetail;
    this.moduleTitle = "Recruit Detail"
  }

}
