import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { RecruitListComponent } from './recruit-list.component';

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
});
