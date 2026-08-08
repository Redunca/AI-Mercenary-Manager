import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ShipDetailComponent } from './ship-detail.component';
import { ShipService } from '../../../core/ship.service';
import { ConsumableService } from '../../../core/consumable.service';
import { GameService } from '../../../core/game.service';
import { GameSyncService } from '../../../core/game-sync.service';
import { Recruit } from '../../../models/recruit';

const MOCK_RECRUITS: Recruit[] = [
  { id: '1', status: 'available', hp: 0, maxHp: 25 } as unknown as Recruit,
  { id: '2', status: 'available', hp: 18, maxHp: 18 } as unknown as Recruit,
];

describe('ShipDetailComponent', () => {
  let component: ShipDetailComponent;
  let fixture: ComponentFixture<ShipDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShipDetailComponent],
      providers: [
        { provide: ShipService, useValue: { ships$: of([]), getShipInventory: () => of([]) } },
        { provide: ConsumableService, useValue: { getConsumables: () => of([]) } },
        { provide: GameService, useValue: { recruits: MOCK_RECRUITS } },
        {
          provide: GameSyncService,
          useValue: { watchMissionProgress: () => {}, unwatchMissionProgress: () => {}, sync: () => {} },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShipDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Regression coverage: the crew list used to show only a recruit's name --
  // no HP, no status -- so a crew member who came home at 0 HP (still
  // flagged 'available' server-side; completeMission doesn't check HP) was
  // indistinguishable from a fully healthy one on the exact screen a player
  // checks before launching another mission.
  it('flags a 0 HP crew member as critical', () => {
    expect(component.isCritical(1)).toBe(true);
  });

  it('does not flag a healthy crew member as critical', () => {
    expect(component.isCritical(2)).toBe(false);
  });

  it('does not flag an unknown recruit id as critical', () => {
    expect(component.isCritical(999)).toBe(false);
  });
});
