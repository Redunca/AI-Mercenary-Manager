import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MissionDetailComponent } from './mission-detail.component';
import { MissionService } from '../../core/mission.service';
import { ShipService } from '../../core/ship.service';
import { GameSyncService } from '../../core/game-sync.service';
import { Mission } from '../../models/mission';
import { of } from 'rxjs';

const MOCK_MISSIONS: Mission[] = [
  {
    id: 1, name: 'Patrouille de couloir', description: 'Desc 1',
    difficulty: 'ROUTINE', events: [], assignedShipId: null, status: 'available',
  },
  {
    id: 2, name: 'Livraison express', description: 'Desc 2',
    difficulty: 'STANDARD', events: [], assignedShipId: null, status: 'available',
  },
];

describe('MissionDetailComponent', () => {
  let component: MissionDetailComponent;
  let fixture: ComponentFixture<MissionDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MissionDetailComponent],
      providers: [
        {
          provide: MissionService,
          useValue: {
            missions: MOCK_MISSIONS,
            missionStates: {},
            getState: (_id: number) => undefined,
          },
        },
        {
          provide: ShipService,
          useValue: {
            getShipById: (_id: number) => undefined,
            ships$: of([]),
          },
        },
        {
          provide: GameSyncService,
          useValue: {
            watchMissionProgress: () => {},
            unwatchMissionProgress: () => {},
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MissionDetailComponent);
    component = fixture.componentInstance;
  });

  it('retourne la mission avec id=1', () => {
    component.id = 1;
    expect(component.mission).not.toBeNull();
    expect(component.mission?.id).toBe(1);
    expect(component.mission?.name).toBe('Patrouille de couloir');
  });

  it('retourne la mission avec id=2', () => {
    component.id = 2;
    expect(component.mission).not.toBeNull();
    expect(component.mission?.id).toBe(2);
    expect(component.mission?.name).toBe('Livraison express');
  });

  it('retourne null pour un id inexistant', () => {
    component.id = 999;
    expect(component.mission).toBeNull();
  });

  it('utilise find() et non l\'accès par index — id=2 n\'est pas missions[2]', () => {
    // Avec l'ancien bug missions[2] retournait undefined (hors bornes sur 2 éléments)
    // Avec le fix missions.find(m => m.id === 2) retourne la bonne mission
    component.id = 2;
    expect(component.mission?.id).toBe(2);
  });
});
