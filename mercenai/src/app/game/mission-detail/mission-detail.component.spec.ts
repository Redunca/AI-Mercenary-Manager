import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MissionDetailComponent } from './mission-detail.component';
import { MissionService } from '../../core/mission.service';
import { ShipService } from '../../core/ship.service';
import { GameSyncService } from '../../core/game-sync.service';
import { Mission } from '../../models/mission';
import { of } from 'rxjs';

const MOCK_MISSIONS: Mission[] = [
  {
    id: 1,
    name: 'Corridor Patrol',
    description: 'Desc 1',
    difficulty: 'ROUTINE',
    events: [],
    assignedShipId: null,
    status: 'available',
  },
  {
    id: 2,
    name: 'Express Delivery',
    description: 'Desc 2',
    difficulty: 'STANDARD',
    events: [],
    assignedShipId: null,
    status: 'available',
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

  it('returns the mission with id=1', () => {
    component.id = 1;
    expect(component.mission).not.toBeNull();
    expect(component.mission?.id).toBe(1);
    expect(component.mission?.name).toBe('Corridor Patrol');
  });

  it('returns the mission with id=2', () => {
    component.id = 2;
    expect(component.mission).not.toBeNull();
    expect(component.mission?.id).toBe(2);
    expect(component.mission?.name).toBe('Express Delivery');
  });

  it('returns null for a nonexistent id', () => {
    component.id = 999;
    expect(component.mission).toBeNull();
  });

  it('uses find() and not index access — id=2 is not missions[2]', () => {
    // With the old bug, missions[2] returned undefined (out of bounds for 2 elements)
    // With the fix, missions.find(m => m.id === 2) returns the correct mission
    component.id = 2;
    expect(component.mission?.id).toBe(2);
  });
});
