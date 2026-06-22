import { Component, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LogService } from '../../core/log.service';

@Component({
  selector: 'app-mission-logs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mission-logs.component.html',
  styleUrl: './mission-logs.component.scss'
})
export class MissionLogsComponent {
  @Input() id!: number;

  logService = inject(LogService);

  get logs() { return this.logService.missionLogs[this.id] ?? []; }

  registerCommands() { return {}; }
}
