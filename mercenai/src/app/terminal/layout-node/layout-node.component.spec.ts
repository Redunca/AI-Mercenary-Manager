import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayoutNodeComponent } from './layout-node.component';

describe('LayoutNodeComponent', () => {
  let component: LayoutNodeComponent;
  let fixture: ComponentFixture<LayoutNodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayoutNodeComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(LayoutNodeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
