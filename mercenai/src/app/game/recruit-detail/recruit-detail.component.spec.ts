import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { RecruitDetailComponent } from './recruit-detail.component';
import { GameService } from '../../core/game.service';
import { ShipService } from '../../core/ship.service';
import { EquipmentService } from '../../core/equipment.service';
import { Recruit, RecruitAttributes } from '../../models/recruit';

const ZERO_ATTRIBUTES: RecruitAttributes = {
  agility: 0,
  fortitude: 0,
  might: 0,
  learning: 0,
  logic: 0,
  perception: 0,
  will: 0,
  deception: 0,
  persuasion: 0,
  presence: 0,
};

function recruit(overrides: Partial<Recruit>): Recruit {
  return {
    id: '1',
    name: 'Test Recruit',
    status: 'available',
    hp: 10,
    maxHp: 10,
    originalMaxHp: 10,
    attributes: ZERO_ATTRIBUTES,
    experience: 0,
    attributePoints: 0,
    ...overrides,
  };
}

describe('RecruitDetailComponent', () => {
  let component: RecruitDetailComponent;
  let fixture: ComponentFixture<RecruitDetailComponent>;
  let mockRecruit: Recruit;

  beforeEach(async () => {
    mockRecruit = recruit({});

    // RecruitDetailComponent injects GameService -> GameApiService ->
    // HttpClient, so TestBed needs an HttpClient provider (see
    // command.service.spec.ts's comment for the same requirement).
    // GameService/ShipService/EquipmentService are mocked directly so the
    // isCritical tests below can control the exact recruit under test.
    await TestBed.configureTestingModule({
      imports: [RecruitDetailComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: GameService,
          useValue: {
            getRecruit: (_id: string) => mockRecruit,
            getRelationshipsFor: (_id: string) => [],
          },
        },
        {
          provide: ShipService,
          useValue: { getShipForRecruit: (_id: number) => undefined },
        },
        {
          provide: EquipmentService,
          useValue: { getEquipment: () => of({ stash: [], equipped: [] }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecruitDetailComponent);
    component = fixture.componentInstance;
    component.id = '1';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Regression coverage: a recruit downed in combat can come home at 0 HP
  // still flagged 'available' server-side (completeMission doesn't check
  // HP), which previously rendered identically to a fully healthy recruit.
  it('flags an available recruit at 0 HP as critical', () => {
    mockRecruit = recruit({ status: 'available', hp: 0, maxHp: 25 });
    fixture.detectChanges();
    expect(component.isCritical).toBe(true);
  });

  it('does not flag a healthy available recruit as critical', () => {
    mockRecruit = recruit({ status: 'available', hp: 12, maxHp: 25 });
    fixture.detectChanges();
    expect(component.isCritical).toBe(false);
  });

  it('does not flag a hospitalized recruit at 0 HP as critical -- they are already where they need to be', () => {
    mockRecruit = recruit({ status: 'hospitalized', hp: 0, maxHp: 25 });
    fixture.detectChanges();
    expect(component.isCritical).toBe(false);
  });

  it('does not flag a dead recruit as critical -- DEAD already says enough', () => {
    mockRecruit = recruit({ status: 'dead', hp: 0, maxHp: 25 });
    fixture.detectChanges();
    expect(component.isCritical).toBe(false);
  });
});
