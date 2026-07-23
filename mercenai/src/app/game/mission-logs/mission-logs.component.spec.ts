import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MissionLogsComponent } from './mission-logs.component';
import { LogService } from '../../core/log.service';
import { GameSyncService } from '../../core/game-sync.service';
import { LogEntry } from '../../models/log';

const MOCK_LOGS: Record<number, LogEntry[]> = {
  1: [
    { tag: '[SYS]', message: 'Departure confirmed.', missionId: 1 },
    { tag: '[IA]', message: 'No anomaly detected.', missionId: 1 },
    { tag: '[KADE]', message: '"Let\'s go."', missionId: 1 },
    { tag: '[VEX→KADE]', message: 'Vex rolls their eyes.', missionId: 1 },
  ],
};

describe('MissionLogsComponent', () => {
  let component: MissionLogsComponent;
  let fixture: ComponentFixture<MissionLogsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MissionLogsComponent],
      providers: [
        {
          provide: LogService,
          useValue: {
            missionLogs: MOCK_LOGS,
            globalLogs: [],
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

    fixture = TestBed.createComponent(MissionLogsComponent);
    component = fixture.componentInstance;
    component.id = 1;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('identifies a banter tag ([NAME_A→NAME_B]) via isBanterTag', () => {
    expect(component.isBanterTag('[VEX→KADE]')).toBe(true);
  });

  it('does not treat SYS/IA/monologue tags as banter', () => {
    expect(component.isBanterTag('[SYS]')).toBe(false);
    expect(component.isBanterTag('[IA]')).toBe(false);
    expect(component.isBanterTag('[KADE]')).toBe(false);
  });

  it('applies the tag-banter class only to the banter-tagged log entry in the rendered DOM', () => {
    fixture.detectChanges();
    const tagEls = fixture.nativeElement.querySelectorAll('.tag') as NodeListOf<HTMLElement>;

    const banterEl = Array.from(tagEls).find((el) => el.textContent?.includes('→'));
    const nonBanterEls = Array.from(tagEls).filter((el) => !el.textContent?.includes('→'));

    expect(banterEl).toBeTruthy();
    expect(banterEl?.classList.contains('tag-banter')).toBe(true);

    expect(nonBanterEls.length).toBeGreaterThan(0);
    for (const el of nonBanterEls) {
      expect(el.classList.contains('tag-banter')).toBe(false);
    }
  });
});
