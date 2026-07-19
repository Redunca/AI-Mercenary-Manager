import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    // AppComponent transitively injects the terminal window's whole service
    // graph (CommandService -> ... -> GameApiService -> HttpClient), so
    // TestBed needs an HttpClient provider (see command.service.spec.ts's
    // comment for the same requirement).
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'mercenai' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('mercenai');
  });

  // Regression coverage for the actual template: app.component.html just
  // hosts <app-terminal-window>, not the default CLI-generated <h1> — the
  // previous version of this test asserted on that stale boilerplate and
  // would never actually catch a rendering regression here.
  it('renders the terminal window', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-terminal-window')).toBeTruthy();
  });
});
