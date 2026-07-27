const DICE_TABLE = {
  0: { count: 0, sides: 0 },
  1: { count: 1, sides: 4 },
  2: { count: 1, sides: 6 },
  3: { count: 1, sides: 8 },
  4: { count: 1, sides: 10 },
  5: { count: 2, sides: 6 },
  6: { count: 2, sides: 8 },
  7: { count: 2, sides: 10 },
  8: { count: 3, sides: 8 },
  9: { count: 3, sides: 10 },
  10: { count: 4, sides: 8 },
}

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1
}

// Advantage rolls one extra attribute die per advantage level, then drops the
// lowest dice equal to that level (OpenLegend core rule). Disadvantage is the
// mirror image: a negative `advantage` rolls one extra die per level too, but
// drops the *highest* dice instead. Neither touches the d20 — except for a
// score of 0, which has no attribute dice to add to; there, advantage instead
// rerolls the d20 and keeps the higher result, while disadvantage rerolls and
// keeps the lower result.
function rollDice(score, advantage = 0) {
  const clamped = Math.min(10, Math.max(0, score))
  const entry = DICE_TABLE[clamped]
  if (entry.count === 0) return { sum: 0, notation: '—' }

  const magnitude = Math.abs(advantage)
  const rollCount = entry.count + magnitude
  const rolls = []
  for (let i = 0; i < rollCount; i++) {
    rolls.push(rollDie(entry.sides))
  }
  rolls.sort((a, b) => a - b)
  const kept = advantage < 0 ? rolls.slice(0, entry.count) : rolls.slice(magnitude)
  const sum = kept.reduce((total, roll) => total + roll, 0)
  const notation =
    advantage > 0
      ? `${rollCount}d${entry.sides} drop lowest ${advantage}`
      : advantage < 0
        ? `${rollCount}d${entry.sides} drop highest ${magnitude}`
        : `${entry.count}d${entry.sides}`
  return { sum, notation }
}

function rollAction(score, advantage = 0) {
  const clamped = Math.min(10, Math.max(0, score))
  if (DICE_TABLE[clamped].count === 0 && advantage !== 0) {
    const first = rollDie(20)
    const second = rollDie(20)
    const d20 = advantage > 0 ? Math.max(first, second) : Math.min(first, second)
    return { d20, bonus: 0, diceNotation: '—', total: d20 }
  }

  const d20 = rollDie(20)
  const { sum: bonus, notation } = rollDice(clamped, advantage)
  return { d20, bonus, diceNotation: notation, total: d20 + bonus }
}

function rollInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

module.exports = { rollDie, rollDice, rollAction, rollInRange }
