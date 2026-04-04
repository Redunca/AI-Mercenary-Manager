import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TerminalPanelComponent } from './terminal-panel.component';

describe('TerminalPanelComponent', () => {
  let component: TerminalPanelComponent;
  let fixture: ComponentFixture<TerminalPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TerminalPanelComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TerminalPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
