import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { MissionService } from './mission.service';

describe('MissionService', () => {
  let service: MissionService;

  beforeEach(() => {
    // MissionService transitively injects GameApiService -> HttpClient, so
    // TestBed needs an HttpClient provider (see command.service.spec.ts's
    // comment for the same requirement on CommandService).
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MissionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
