import { Injectable } from '@angular/core';

interface DiceEntry {
  count: number;
  sides: number;
}

const DICE_TABLE: Record<number, DiceEntry> = {
  0:  { count: 0, sides: 0  },
  1:  { count: 1, sides: 4  },
  2:  { count: 1, sides: 6  },
  3:  { count: 1, sides: 8  },
  4:  { count: 1, sides: 10 },
  5:  { count: 2, sides: 6  },
  6:  { count: 2, sides: 8  },
  7:  { count: 2, sides: 10 },
  8:  { count: 3, sides: 8  },
  9:  { count: 3, sides: 10 },
  10: { count: 4, sides: 8  },
};

export interface ActionRoll {
  d20: number;
  bonus: number;
  diceNotation: string;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class DiceService {

  rollDie(sides: number): number {
    return Math.floor(Math.random() * sides) + 1;
  }

  rollDice(score: number): { sum: number; notation: string } {
    const clamped = Math.min(10, Math.max(0, score));
    const entry = DICE_TABLE[clamped];
    if (entry.count === 0) return { sum: 0, notation: '—' };

    let sum = 0;
    for (let i = 0; i < entry.count; i++) {
      sum += this.rollDie(entry.sides);
    }
    return { sum, notation: `${entry.count}d${entry.sides}` };
  }

  rollAction(score: number): ActionRoll {
    const d20 = this.rollDie(20);
    const { sum: bonus, notation } = this.rollDice(score);
    return { d20, bonus, diceNotation: notation, total: d20 + bonus };
  }

  rollInRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
