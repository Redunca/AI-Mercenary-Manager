import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LogService } from '../../core/log.service';
import { isBanterTag } from '../../models/log';

@Component({
  selector: 'app-global-logs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './global-logs.component.html',
  styleUrl: './global-logs.component.scss',
})
export class GlobalLogsComponent {
  logService = inject(LogService);

  readonly isBanterTag = isBanterTag;

  get logs() {
    return this.logService.globalLogs;
  }

  registerCommands() {
    return {};
  }
}
