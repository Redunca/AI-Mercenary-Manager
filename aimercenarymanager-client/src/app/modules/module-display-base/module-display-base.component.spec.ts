import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModuleDisplayBaseComponent } from './module-display-base.component';

describe('ModuleDisplayBaseComponent', () => {
  let component: ModuleDisplayBaseComponent;
  let fixture: ComponentFixture<ModuleDisplayBaseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModuleDisplayBaseComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ModuleDisplayBaseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
