import { Component, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../core/game.service';
import { ShipService } from '../../core/ship.service';
import { EquipmentService, Equipment } from '../../core/equipment.service';
import {
  AttributeKey,
  PERK_ATTRIBUTE_MODIFIERS,
  levelForExperience,
  maxAttributeForLevel,
  attributePointCost,
} from '../../models/recruit';

@Component({
  selector: 'app-recruit-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './recruit-detail.component.html',
  styleUrl: './recruit-detail.component.scss',
})
export class RecruitDetailComponent implements OnInit {
  @Input() id!: string;
  game = inject(GameService);
  ships = inject(ShipService);
  private equipmentService = inject(EquipmentService);

  armorStash: Equipment[] = [];
  equippedArmor: Equipment | null = null;
  equipError: string | null = null;
  raiseError: string | null = null;

  get recruit() {
    return this.game.getRecruit(this.id);
  }

  get level(): number {
    return levelForExperience(this.recruit?.experience ?? 0);
  }

  // Cost/cap hint shown next to each attribute -- "capped at N" once the
  // recruit's level-derived ceiling is reached (see maxAttributeForLevel),
  // otherwise "+1 = N pts" (see attributePointCost).
  attributeCostLabel(key: AttributeKey): string {
    if (!this.recruit) return '';
    const current = this.recruit.attributes[key];
    const cap = maxAttributeForLevel(this.level);
    if (current >= cap) return `capped at ${cap}`;
    return `+1 = ${attributePointCost(current)} pts`;
  }

  get relationships() {
    return this.game.getRelationshipsFor(this.id).filter((r) => r.recruit);
  }

  // A recruit can come home from a mission at 0 HP and still be flagged
  // 'available' (see completeMission, server-side -- it doesn't check HP
  // before clearing crew back to available) -- without this, they render
  // identically to a fully healthy recruit and are one bad roll from
  // permadeath if sent straight back out.
  get isCritical(): boolean {
    if (!this.recruit) return false;
    return this.recruit.hp <= 0 && this.recruit.status !== 'dead' && this.recruit.status !== 'hospitalized';
  }

  ngOnInit() {
    this.refreshEquipment();
  }

  private refreshEquipment(): void {
    this.equipmentService.getEquipment().subscribe((state) => {
      this.armorStash = state.stash;
      this.equippedArmor =
        state.equipped.find((e) => e.assigned_to_recruit_id === Number(this.id)) || null;
    });
  }

  statBar(value: number): string {
    return '[' + '■'.repeat(value) + '□'.repeat(10 - value) + ']';
  }

  // Mechanical-effect annotation for a perk/flaw name, if it's one of the
  // curated entries in PERK_ATTRIBUTE_MODIFIERS -- null for purely
  // cosmetic perks/flaws (most of them).
  perkEffectLabel(name: string): string | null {
    const effect = PERK_ATTRIBUTE_MODIFIERS[name];
    if (!effect) return null;
    return `${effect.amount > 0 ? '+' : ''}${effect.amount} ${effect.attribute}`;
  }

  registerCommands() {
    return {
      rename: (newName: string) => {
        if (!newName) {
          console.warn('Usage: rename <newName>');
          return;
        }
        void this.game.renameRecruit(this.id, newName);
      },
      equip: (equipmentId: string) => {
        if (!equipmentId) {
          console.warn('Usage: equip <equipmentId>');
          return;
        }
        this.equipError = null;
        void this.equipmentService.equip(Number(equipmentId), Number(this.id)).then((result) => {
          if (result?.error) {
            this.equipError = result.error;
            return;
          }
          this.refreshEquipment();
        });
      },
      unequip: () => {
        if (!this.equippedArmor) {
          console.warn('No armor equipped');
          return;
        }
        this.equipError = null;
        void this.equipmentService.unequip(this.equippedArmor.id).then((result) => {
          if (result?.error) {
            this.equipError = result.error;
            return;
          }
          this.refreshEquipment();
        });
      },
      fire: () => {
        void this.game.fireRecruit(this.id).then((err) => {
          if (err) console.error(`[recruit fire] ${err}`);
        });
      },
      raise: (attribute: string) => {
        if (!attribute) {
          console.warn('Usage: raise <attribute>');
          return;
        }
        this.raiseError = null;
        void this.game.raiseAttribute(this.id, attribute).then((err) => {
          if (err) this.raiseError = err;
        });
      },
    };
  }
}
