import { Component, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../core/game.service';
import { ShipService } from '../../core/ship.service';
import { EquipmentService, Equipment } from '../../core/equipment.service';

@Component({
  selector: 'app-recruit-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './recruit-detail.component.html',
  styleUrl: './recruit-detail.component.scss'
})
export class RecruitDetailComponent implements OnInit {
  @Input() id!: string;
  game = inject(GameService);
  ships = inject(ShipService);
  private equipmentService = inject(EquipmentService);

  armorStash: Equipment[] = [];
  equippedArmor: Equipment | null = null;
  equipError: string | null = null;

  get recruit() {
    return this.game.getRecruit(this.id);
  }

  ngOnInit() {
    this.refreshEquipment();
  }

  private refreshEquipment(): void {
    this.equipmentService.getEquipment().subscribe(state => {
      this.armorStash = state.stash;
      this.equippedArmor = state.equipped.find(e => e.assigned_to_recruit_id === Number(this.id)) || null;
    });
  }

  statBar(value: number): string {
    return '[' + '■'.repeat(value) + '□'.repeat(10 - value) + ']';
  }

  registerCommands() {
    return {
      'rename': (newName: string) => {
        if (!newName) { console.warn('Usage: rename <newName>'); return; }
        void this.game.renameRecruit(this.id, newName);
      },
      'equip': (equipmentId: string) => {
        if (!equipmentId) { console.warn('Usage: equip <equipmentId>'); return; }
        this.equipError = null;
        void this.equipmentService.equip(Number(equipmentId), Number(this.id)).then(result => {
          if (result?.error) { this.equipError = result.error; return; }
          this.refreshEquipment();
        });
      },
      'unequip': () => {
        if (!this.equippedArmor) { console.warn('No armor equipped'); return; }
        this.equipError = null;
        void this.equipmentService.unequip(this.equippedArmor.id).then(result => {
          if (result?.error) { this.equipError = result.error; return; }
          this.refreshEquipment();
        });
      }
    };
  }
}
