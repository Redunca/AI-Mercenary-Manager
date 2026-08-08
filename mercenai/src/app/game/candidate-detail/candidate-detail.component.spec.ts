import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CandidateDetailComponent } from './candidate-detail.component';
import { CandidateService } from '../../core/candidate.service';
import { GameService } from '../../core/game.service';
import { Candidate } from '../../models/candidate';

const MOCK_CANDIDATE: Candidate = {
  id: '3',
  name: 'Test Candidate',
  jobTitle: 'Scout',
  archetype: 'well-rounded',
  personality: 'Analyst',
  attributes: {
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
  },
  hp: 10,
  maxHp: 10,
  perks: [],
  flaws: [],
  isQuestCandidate: false,
};

describe('CandidateDetailComponent', () => {
  let component: CandidateDetailComponent;
  let fixture: ComponentFixture<CandidateDetailComponent>;
  let candidateService: { candidates: Candidate[]; hireCandidate: jasmine.Spy };

  beforeEach(async () => {
    candidateService = {
      candidates: [MOCK_CANDIDATE],
      hireCandidate: jasmine.createSpy('hireCandidate'),
    };

    await TestBed.configureTestingModule({
      imports: [CandidateDetailComponent],
      providers: [
        { provide: CandidateService, useValue: candidateService },
        {
          provide: GameService,
          useValue: { recruits: [], player$: { value: { maxNumberOfRecruits: 5 } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CandidateDetailComponent);
    component = fixture.componentInstance;
    component.id = '3';
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  // Regression coverage: this used to infer "Roster full" from client-side
  // recruit counts regardless of the actual failure reason. It now shows
  // whatever the server actually said.
  it("surfaces the server's own error message on a failed hire, not a client-side guess", async () => {
    candidateService.hireCandidate.and.resolveTo({
      recruit: null,
      error: 'Candidate not found -- the pool may have refreshed',
    });
    fixture.detectChanges();

    component.registerCommands()['hire']();
    await fixture.whenStable();

    expect(component.hireError).toBe('Candidate not found -- the pool may have refreshed');
  });

  it('clears any previous error on a successful hire', async () => {
    component.hireError = 'Roster full (max 5 recruits)';
    candidateService.hireCandidate.and.resolveTo({
      recruit: { id: '9' },
      error: null,
    });
    fixture.detectChanges();

    component.registerCommands()['hire']();
    await fixture.whenStable();

    expect(component.hireError).toBeNull();
  });

  // Regression coverage: the global `recruit hire <id>` command
  // (command.service.ts) has no panel of its own, so on failure it routes
  // here and passes the error in as this @Input -- confirms the panel
  // actually displays it via the same hireError div its own local `hire`
  // command uses.
  it('renders an error passed in via the hireError input', () => {
    component.hireError = 'Roster full (max 5 recruits)';
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Roster full (max 5 recruits)');
  });
});
