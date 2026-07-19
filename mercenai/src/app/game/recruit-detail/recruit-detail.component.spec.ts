import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { RecruitDetailComponent } from './recruit-detail.component';

describe('RecruitDetailComponent', () => {
  let component: RecruitDetailComponent;
  let fixture: ComponentFixture<RecruitDetailComponent>;

  beforeEach(async () => {
    // RecruitDetailComponent injects GameService -> GameApiService ->
    // HttpClient, so TestBed needs an HttpClient provider (see
    // command.service.spec.ts's comment for the same requirement).
    await TestBed.configureTestingModule({
      imports: [RecruitDetailComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(RecruitDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
