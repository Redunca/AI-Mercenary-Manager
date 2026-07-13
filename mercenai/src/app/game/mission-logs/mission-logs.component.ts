import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LogService } from '../../core/log.service';
import { GameSyncService } from '../../core/game-sync.service';
import { isBanterTag } from '../../models/log';

@Component({
  selector: 'app-mission-logs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mission-logs.component.html',
  styleUrl: './mission-logs.component.scss'
})
export class MissionLogsComponent implements OnInit, OnDestroy {
  @Input() id!: number;

  logService = inject(LogService);
  private sync = inject(GameSyncService);

  readonly isBanterTag = isBanterTag;

  ngOnInit(): void {
    this.sync.watchMissionProgress();
  }

  ngOnDestroy(): void {
    this.sync.unwatchMissionProgress();
  }

  get logs() { return this.logService.missionLogs[this.id] ?? []; }

  registerCommands() { return {}; }
}
