import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { CommandService } from './command.service';
import { LayoutService } from './layout.service';
import { SelfService } from './self.service';
import { GameSyncService } from './game-sync.service';
import { PanelModule } from '../models/panel';

describe('CommandService', () => {
  let service: CommandService;
  let layout: LayoutService;

  beforeEach(() => {
    // CommandService transitively injects several HTTP-backed services
    // (MissionService, CandidateService, ShipService, ShopService,
    // GameSyncService -> GameApiService -> HttpClient). Without these
    // providers TestBed.inject(CommandService) throws a NullInjectorError
    // for HttpClient, so any test in this file needs them registered.
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CommandService);
    layout = TestBed.inject(LayoutService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('routes "recruit list" and its shorthand "recruit -l" to the same panel module', () => {
    const panelId = layout.addPanel(PanelModule.Dashboard);
    layout.setActivePanel(panelId);

    service.routeCommand('recruit list', panelId);
    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.RecruitList);

    layout.setPanelModule(panelId, PanelModule.Dashboard);
    service.routeCommand('recruit -l', panelId);
    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.RecruitList);

    layout.setPanelModule(panelId, PanelModule.Dashboard);
    service.routeCommand('recruit --list', panelId);
    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.RecruitList);
  });

  it('routes "ship detail <id>" and its shorthand "ship -d <id>" to the same panel module', () => {
    const panelId = layout.addPanel(PanelModule.Dashboard);
    layout.setActivePanel(panelId);

    service.routeCommand('ship detail 3', panelId);
    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.ShipDetail);
    expect(layout.getPanelById(panelId)?.data).toEqual({ id: '3' });

    layout.setPanelModule(panelId, PanelModule.Dashboard);
    service.routeCommand('ship -d 3', panelId);
    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.ShipDetail);
    expect(layout.getPanelById(panelId)?.data).toEqual({ id: '3' });
  });

  it('routes "mission list" and "mission -l" to the mission-list panel with no completed flag', () => {
    const panelId = layout.addPanel(PanelModule.Dashboard);
    layout.setActivePanel(panelId);

    service.routeCommand('mission list', panelId);
    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.MissionList);
    expect(layout.getPanelById(panelId)?.data).toBeFalsy();

    layout.setPanelModule(panelId, PanelModule.Dashboard);
    service.routeCommand('mission -l', panelId);
    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.MissionList);
    expect(layout.getPanelById(panelId)?.data).toBeFalsy();
  });

  it('routes "mission list --completed", "mission -c" and "mission --completed" to the mission-list panel with completed: true', () => {
    const panelId = layout.addPanel(PanelModule.Dashboard);
    layout.setActivePanel(panelId);

    service.routeCommand('mission list --completed', panelId);
    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.MissionList);
    expect(layout.getPanelById(panelId)?.data).toEqual({ completed: true });

    layout.setPanelModule(panelId, PanelModule.Dashboard);
    service.routeCommand('mission -c', panelId);
    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.MissionList);
    expect(layout.getPanelById(panelId)?.data).toEqual({ completed: true });

    layout.setPanelModule(panelId, PanelModule.Dashboard);
    service.routeCommand('mission --completed', panelId);
    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.MissionList);
    expect(layout.getPanelById(panelId)?.data).toEqual({ completed: true });
  });

  it('does not throw when a global command is routed against an unresolved panel id', () => {
    // Regression test: routeCommand used to do `panel.terminal?.setInput('')`
    // (missing optional chaining on `panel` itself). getPanelById(panelId)
    // returns null for an id that isn't tracked, which used to throw
    // "Cannot read properties of null" instead of failing gracefully.
    expect(() => service.routeCommand('help', 999999)).not.toThrow();
  });

  it('warns instead of throwing for an unknown command', () => {
    const warnSpy = spyOn(console, 'warn');
    expect(() => service.routeCommand('this-command-does-not-exist', 999999)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('routes bare "self" to the self panel', () => {
    const panelId = layout.addPanel(PanelModule.Dashboard);
    layout.setActivePanel(panelId);

    service.routeCommand('self', panelId);

    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.Self);
  });

  it('"self buy <id>" calls SelfService.buyUpgrade and resyncs on success', fakeAsync(() => {
    const panelId = layout.addPanel(PanelModule.Dashboard);
    layout.setActivePanel(panelId);

    const selfService = TestBed.inject(SelfService);
    const gameSync = TestBed.inject(GameSyncService);
    spyOn(selfService, 'buyUpgrade').and.resolveTo({ success: true });
    spyOn(gameSync, 'sync').and.resolveTo({} as any);

    service.routeCommand('self buy 3', panelId);
    tick();

    expect(selfService.buyUpgrade).toHaveBeenCalledWith(3);
    expect(gameSync.sync).toHaveBeenCalled();
    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.Self);
  }));

  it('"self buy <id>" logs the error and does not resync on failure', fakeAsync(() => {
    const panelId = layout.addPanel(PanelModule.Dashboard);
    layout.setActivePanel(panelId);

    const selfService = TestBed.inject(SelfService);
    const gameSync = TestBed.inject(GameSyncService);
    spyOn(selfService, 'buyUpgrade').and.resolveTo({ error: 'Insufficient tokens' });
    spyOn(gameSync, 'sync').and.resolveTo({} as any);
    const warnSpy = spyOn(console, 'warn');

    service.routeCommand('self buy 3', panelId);
    tick();

    expect(warnSpy).toHaveBeenCalledWith('Purchase failed:', 'Insufficient tokens');
    expect(gameSync.sync).not.toHaveBeenCalled();
  }));

  it('characterizes why a leaked newline corrupts the next command (motivates the UI fix)', () => {
    // Before the terminal-panel Enter-key preventDefault() fix, a trailing
    // "\n" from a previous command could stay in the textarea and get
    // prepended to whatever the user typed next, e.g. "logs\nmission start 3 1".
    // parse() splits on \s+ (which matches \n), so the leaked token becomes
    // the command name and completely swallows the intended command. This
    // test documents that failure mode: with a leaked newline, "logs" wins
    // over "mission start", proving the fix has to happen where the newline
    // is produced (the textarea), not by trying to sanitize it in parse().
    const panelId = layout.addPanel(PanelModule.Dashboard);
    layout.setActivePanel(panelId);
    layout.setPanelModule(panelId, PanelModule.MissionDetail, { id: 1 });

    service.routeCommand('logs\nmission start 3 1', panelId);

    expect(layout.getPanelById(panelId)?.module).toBe(PanelModule.Logs);
  });
});
