import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GlobalLogsComponent } from './global-logs.component';
import { LogService } from '../../core/log.service';
import { LogEntry } from '../../models/log';

const MOCK_GLOBAL_LOGS: LogEntry[] = [
  { tag: '[SYS]', message: 'Mission "Corridor Patrol" completed [SUCCESS].' },
  { tag: '[VEX→KADE]', message: 'Vex rolls their eyes.' },
];

describe('GlobalLogsComponent', () => {
  let component: GlobalLogsComponent;
  let fixture: ComponentFixture<GlobalLogsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GlobalLogsComponent],
      providers: [
        {
          provide: LogService,
          useValue: {
            missionLogs: {},
            globalLogs: MOCK_GLOBAL_LOGS,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GlobalLogsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('identifies a banter tag ([NAME_A→NAME_B]) via isBanterTag', () => {
    expect(component.isBanterTag('[VEX→KADE]')).toBe(true);
  });

  it('does not treat a SYS tag as banter', () => {
    expect(component.isBanterTag('[SYS]')).toBe(false);
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
