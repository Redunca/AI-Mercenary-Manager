import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { MissionListComponent } from './mission-list.component';
import { MissionService } from '../../core/mission.service';
import { Mission } from '../../models/mission';

describe('MissionListComponent', () => {
  let component: MissionListComponent;
  let fixture: ComponentFixture<MissionListComponent>;
  let missionService: MissionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MissionListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
    .compileComponents();

    fixture = TestBed.createComponent(MissionListComponent);
    component = fixture.componentInstance;
    missionService = TestBed.inject(MissionService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the live sync missions by default', () => {
    const liveMissions = [{ id: 1, name: 'Live', status: 'available' } as unknown as Mission];
    missionService.missions = liveMissions;

    expect(component.missions).toBe(liveMissions);
  });

  it('fetches and shows mission history when the completed input flips to true', async () => {
    const history = [{ id: 9, name: 'Old mission', status: 'success' } as unknown as Mission];
    spyOn(missionService, 'getMissionHistory').and.returnValue(Promise.resolve(history));

    fixture.componentRef.setInput('completed', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(missionService.getMissionHistory).toHaveBeenCalled();
    expect(component.missions).toEqual(history);
    expect(component.historyLoading).toBeFalse();
    expect(component.historyError).toBeNull();
  });

  it('falls back to the live missions when completed flips back to false', async () => {
    const liveMissions = [{ id: 2, name: 'Live', status: 'in_progress' } as unknown as Mission];
    missionService.missions = liveMissions;
    spyOn(missionService, 'getMissionHistory').and.returnValue(Promise.resolve([]));

    fixture.componentRef.setInput('completed', true);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentRef.setInput('completed', false);
    fixture.detectChanges();

    expect(component.missions).toBe(liveMissions);
  });

  it('surfaces an error and keeps historyLoading falsy if the history fetch fails', async () => {
    spyOn(missionService, 'getMissionHistory').and.returnValue(Promise.reject(new Error('network down')));

    fixture.componentRef.setInput('completed', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.historyError).toBeTruthy();
    expect(component.historyLoading).toBeFalse();
  });

  it("registers a local 'completed' command alongside 'detail'", () => {
    const commands = component.registerCommands();
    expect(typeof commands['detail']).toBe('function');
    expect(typeof commands['completed']).toBe('function');
  });
});
