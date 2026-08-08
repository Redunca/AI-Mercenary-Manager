import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { MissionService } from '../../core/mission.service';
import { ShipService } from '../../core/ship.service';
import { GameSyncService } from '../../core/game-sync.service';
import { GameService } from '../../core/game.service';
import { OperaService } from '../../core/opera.service';
import { Recruit } from '../../models/recruit';

// Two owned recruits, capacity for five -- picked deliberately so
// totalRecruits' correct value (5, the roster cap) and the old bug's value
// (2, recruits.length) can never coincide.
const MOCK_RECRUITS: Recruit[] = [
  { id: '1', status: 'available' } as unknown as Recruit,
  { id: '2', status: 'hospitalized' } as unknown as Recruit,
];

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        {
          provide: GameService,
          useValue: {
            recruits: MOCK_RECRUITS,
            player$: {
              value: {
                maxAvailableMissions: 5,
                maxNumberOfRecruits: 5,
                tokens: 0,
              },
            },
          },
        },
        {
          provide: MissionService,
          useValue: { missionStates: {}, missions: [] },
        },
        {
          provide: ShipService,
          useValue: { getShipById: (_id: number) => undefined },
        },
        {
          provide: OperaService,
          useValue: { operas: [] },
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

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Regression test: totalRecruits used to count owned, non-dead recruits
  // (game.recruits.filter(...).length -- here that would be 2) instead of
  // the player's actual roster capacity, so the dashboard's "RECRUITS X / Y
  // available" line understated Y for any player who hadn't already hired
  // up to their cap. It should mirror totalMissions, which reads
  // maxAvailableMissions the same way.
  it('reads totalRecruits from the player\'s roster capacity, not from how many recruits are owned', () => {
    expect(component.totalRecruits).toBe(5);
    expect(component.totalRecruits).not.toBe(MOCK_RECRUITS.length);
  });
});
