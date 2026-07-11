import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { CommandService } from './command.service';
import { LayoutService } from './layout.service';
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
