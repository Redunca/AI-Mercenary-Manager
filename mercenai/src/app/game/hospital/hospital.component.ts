import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../core/game.service';
import { HospitalService } from '../../core/hospital.service';
import { GameSyncService } from '../../core/game-sync.service';
import { Recruit } from '../../models/recruit';

@Component({
  selector: 'app-hospital',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hospital.component.html',
  styleUrl: './hospital.component.scss',
})
export class HospitalComponent {
  private hospitalService = inject(HospitalService);
  private gameSync = inject(GameSyncService);
  game = inject(GameService);

  get slots(): number {
    return this.game.player$.value.hospitalSlots;
  }

  get healIntervalMs(): number {
    return this.game.player$.value.hospitalHealIntervalMs;
  }

  get hospitalizedRecruits(): Recruit[] {
    return this.game.recruits.filter((r) => r.status === 'hospitalized');
  }

  private admit(recruitId: string): void {
    void this.hospitalService.admitRecruit(Number(recruitId)).then((result) => {
      if (result?.error) {
        console.warn('Admit failed:', result.error);
        return;
      }
      void this.gameSync.sync();
    });
  }

  private discharge(recruitId: string): void {
    void this.hospitalService.dischargeRecruit(Number(recruitId)).then((result) => {
      if (result?.error) {
        console.warn('Discharge failed:', result.error);
        return;
      }
      void this.gameSync.sync();
    });
  }

  registerCommands() {
    return {
      admit: (recruitId: string) => {
        if (!recruitId) {
          console.warn('Usage: admit <recruitId>');
          return;
        }
        this.admit(recruitId);
      },
      discharge: (recruitId: string) => {
        if (!recruitId) {
          console.warn('Usage: discharge <recruitId>');
          return;
        }
        this.discharge(recruitId);
      },
    };
  }
}
