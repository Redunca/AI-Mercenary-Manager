import { Component, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OperaService } from '../../core/opera.service';
import { OperaSummary } from '../../models/opera';
import { LogEntry, isBanterTag } from '../../models/log';

@Component({
  selector: 'app-opera-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './opera-detail.component.html',
  styleUrl: './opera-detail.component.scss',
})
export class OperaDetailComponent {
  @Input() id!: string;

  operaService = inject(OperaService);

  readonly isBanterTag = isBanterTag;

  get opera(): OperaSummary | null {
    return this.operaService.getState(this.id) ?? null;
  }

  get logs(): LogEntry[] {
    return this.operaService.logs[this.id] ?? [];
  }

  registerCommands() {
    return {
      choose: (optionId: string) => {
        if (!optionId) {
          console.warn('Usage: choose <optionId>');
          return;
        }
        void this.operaService.chooseOpera(this.id, optionId).then((err) => {
          if (err) console.error(`[opera choose] ${err}`);
        });
      },
    };
  }
}
