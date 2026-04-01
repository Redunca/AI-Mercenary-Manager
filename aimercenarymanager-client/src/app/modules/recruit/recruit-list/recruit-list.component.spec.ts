import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecruitListComponent } from './recruit-list.component';

describe('RecruitListComponent', () => {
  let component: RecruitListComponent;
  let fixture: ComponentFixture<RecruitListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecruitListComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(RecruitListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
