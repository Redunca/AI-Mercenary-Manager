import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { RecruitListComponent } from './recruit-list.component';
import { Recruit } from '../../models/recruit';

function recruit(overrides: Partial<Recruit>): Recruit {
  return { id: '1', name: 'Test', status: 'available', hp: 10, maxHp: 10, ...overrides } as Recruit;
}

describe('RecruitListComponent', () => {
  let component: RecruitListComponent;
  let fixture: ComponentFixture<RecruitListComponent>;

  beforeEach(async () => {
    // RecruitListComponent injects GameService -> GameApiService ->
    // HttpClient, so TestBed needs an HttpClient provider (see
    // command.service.spec.ts's comment for the same requirement).
    await TestBed.configureTestingModule({
      imports: [RecruitListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RecruitListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Regression coverage: a recruit downed in combat can come home at 0 HP
  // still flagged 'available' server-side (completeMission doesn't check
  // HP), which previously rendered identically to a fully healthy recruit.
  it('flags an available recruit at 0 HP as critical', () => {
    const r = recruit({ status: 'available', hp: 0, maxHp: 25 });
    expect(component.isCritical(r)).toBe(true);
    expect(component.statusLabel(r)).toBe('CRITICAL — needs hospital');
  });

  it('does not flag a healthy available recruit as critical', () => {
    const r = recruit({ status: 'available', hp: 12, maxHp: 25 });
    expect(component.isCritical(r)).toBe(false);
    expect(component.statusLabel(r)).toBe('Available');
  });

  it('does not flag a hospitalized recruit at 0 HP as critical -- they are already where they need to be', () => {
    const r = recruit({ status: 'hospitalized', hp: 0, maxHp: 25 });
    expect(component.isCritical(r)).toBe(false);
    expect(component.statusLabel(r)).toBe('Hospitalized');
  });

  it('does not flag a dead recruit as critical -- DEAD already says enough', () => {
    const r = recruit({ status: 'dead', hp: 0, maxHp: 25 });
    expect(component.isCritical(r)).toBe(false);
    expect(component.statusLabel(r)).toBe('DEAD');
  });
});
