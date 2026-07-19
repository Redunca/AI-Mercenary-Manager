const { BOSS_TABLE, buildEnemy, resolveAttack, runAutoBattle } = require('../src/domain/combat')

function fixedRollAction(total) {
  return () => ({ d20: 0, bonus: 0, diceNotation: '—', total })
}

// Returns a rollAction that hits (a big total) when the attacker's score
// matches `hitScore`, and otherwise misses (a total of 0). Useful for
// controlling crew vs. enemy outcomes independently in a single battle,
// since crew and enemy attribute scores usually differ.
function scoreBasedRollAction(hitScore, hitTotal = 999, missTotal = 0) {
  return (score) => ({ d20: 0, bonus: 0, diceNotation: '—', total: score === hitScore ? hitTotal : missTotal })
}

function recruit(overrides = {}) {
  return {
    id: 1,
    name: 'Vex',
    attributes: { might: 2, agility: 4 },
    hp: 26,
    maxHp: 26,
    originalMaxHp: 26,
    ...overrides,
  }
}

describe('combat domain — buildEnemy', () => {
  test('scales HP, Guard range, attributes, and boss edge with mission difficulty', () => {
    for (const [difficulty, table] of Object.entries(BOSS_TABLE)) {
      const enemy = buildEnemy(difficulty, () => table.guardMin)
      expect(enemy.hp).toBe(table.hp)
      expect(enemy.maxHp).toBe(table.hp)
      expect(enemy.guard).toBe(table.guardMin)
      expect(enemy.bossEdge).toBe(table.edge)
      expect([enemy.might, enemy.agility].sort()).toEqual([table.secondary, table.primary].sort())
    }
  })

  test('falls back to the STANDARD table for an unknown difficulty', () => {
    const enemy = buildEnemy('NOT_A_TIER', () => 0)
    expect(enemy.hp).toBe(BOSS_TABLE.STANDARD.hp)
  })

  test('rolls Guard within the tier range and assigns Might/Agility based on the roll', () => {
    const rollInRange = jest.fn()
      .mockReturnValueOnce(BOSS_TABLE.HARD.guardMax) // guard roll
      .mockReturnValueOnce(1) // mightIsPrimary roll -> false, so agility is primary
    const enemy = buildEnemy('HARD', rollInRange)
    expect(enemy.guard).toBe(BOSS_TABLE.HARD.guardMax)
    expect(enemy.agility).toBe(BOSS_TABLE.HARD.primary)
    expect(enemy.might).toBe(BOSS_TABLE.HARD.secondary)
  })
})

describe('combat domain — resolveAttack', () => {
  test('a roll strictly above Guard is a hit dealing roll - Guard', () => {
    const { hit, damage } = resolveAttack({ attackerScore: 5, defenderGuard: 10, rollAction: fixedRollAction(20) })
    expect(hit).toBe(true)
    expect(damage).toBe(10)
  })

  test('a roll equal to Guard is a miss, not a hit', () => {
    const { hit, damage } = resolveAttack({ attackerScore: 5, defenderGuard: 15, rollAction: fixedRollAction(15) })
    expect(hit).toBe(false)
    expect(damage).toBe(0)
  })

  test('a roll below Guard is a miss', () => {
    const { hit, damage } = resolveAttack({ attackerScore: 5, defenderGuard: 15, rollAction: fixedRollAction(10) })
    expect(hit).toBe(false)
    expect(damage).toBe(0)
  })

  test('damage of 1 or 2 is clamped up to 3', () => {
    expect(resolveAttack({ attackerScore: 5, defenderGuard: 10, rollAction: fixedRollAction(11) }).damage).toBe(3)
    expect(resolveAttack({ attackerScore: 5, defenderGuard: 10, rollAction: fixedRollAction(12) }).damage).toBe(3)
  })

  test('damage of 3 or more is left as-is', () => {
    expect(resolveAttack({ attackerScore: 5, defenderGuard: 10, rollAction: fixedRollAction(13) }).damage).toBe(3)
    expect(resolveAttack({ attackerScore: 5, defenderGuard: 10, rollAction: fixedRollAction(25) }).damage).toBe(15)
  })

  test('passes advantage through to rollAction', () => {
    const rollAction = jest.fn().mockReturnValue({ d20: 0, bonus: 0, diceNotation: '—', total: 20 })
    resolveAttack({ attackerScore: 5, advantage: 2, defenderGuard: 10, rollAction })
    expect(rollAction).toHaveBeenCalledWith(5, 2)
  })
})

describe('combat domain — runAutoBattle', () => {
  test('the crew defeats the enemy: enemyDefeated is true, no crew member is hurt if the enemy never gets a turn', () => {
    // Recruit's agility (4) ties the enemy's agility (4 secondary) but the
    // crew is placed first in initiative on ties, and one hit (total 999)
    // vastly exceeds the enemy's 40 HP, so the enemy never gets to act.
    const enemy = buildEnemy('ROUTINE', () => 0) // guard 0, might primary (6) / agility secondary (4)
    const crew = [recruit()]
    const result = runAutoBattle({ crew, enemy, rollAction: fixedRollAction(999) })

    expect(result.enemyDefeated).toBe(true)
    expect(result.crewDefeated).toBe(false)
    expect(result.rounds).toHaveLength(1)
    expect(result.crewResults[0].hp).toBe(26)
    expect(result.crewResults[0].maxHp).toBe(26)
    expect(result.crewResults[0].status).toBe('active')
  })

  test('the enemy defeats the crew: crewDefeated is true and the recruit permanently loses 1 max HP', () => {
    // Enemy is faster (agility primary via mightIsPrimary=false) and always
    // hits (score 6); crew (score 4, might 2/agility 4 => best stat agility 4) always misses.
    const enemy = buildEnemy('ROUTINE', (min, max) => (max === 1 ? 1 : min)) // mightIsPrimary roll -> 1 (false); guard roll -> min
    const crew = [recruit({ hp: 3, maxHp: 3, originalMaxHp: 3 })] // any hit of 3+ brings this to exactly 0
    const rollAction = scoreBasedRollAction(enemy.agility >= enemy.might ? enemy.agility : enemy.might)
    const result = runAutoBattle({ crew, enemy, rollAction })

    expect(result.enemyDefeated).toBe(false)
    expect(result.crewDefeated).toBe(true)
    expect(result.crewResults[0].maxHp).toBe(2) // 3 -> 2
    expect(result.crewResults[0].hp).toBe(2) // patched back up to the new max after the fight
    expect(result.crewResults[0].status).toBe('active') // downed, but not dead: original max HP was 3, not halved from a much bigger number
  })

  test('a recruit dies once a knockout drops max HP to half its original value or below', () => {
    const enemy = buildEnemy('ROUTINE', (min, max) => (max === 1 ? 1 : min))
    const crew = [recruit({ hp: 3, maxHp: 4, originalMaxHp: 8 })] // 4 -> 3 after the hit, which is <= 8/2
    const rollAction = scoreBasedRollAction(enemy.agility >= enemy.might ? enemy.agility : enemy.might)
    const result = runAutoBattle({ crew, enemy, rollAction })

    expect(result.crewResults[0].status).toBe('dead')
    expect(result.crewResults[0].hp).toBe(0)
    expect(result.crewResults[0].maxHp).toBe(3)
  })

  test('a HEAL charge intercepts a would-be knockout instead of applying the permanent penalty', () => {
    const enemy = buildEnemy('ROUTINE', (min, max) => (max === 1 ? 1 : min))
    const crew = [recruit()] // default 26/26 HP
    const rollAction = scoreBasedRollAction(enemy.agility >= enemy.might ? enemy.agility : enemy.might)
    // The enemy always overkills whatever HP the recruit currently has, and
    // the crew (miss on every roll here) can't fight back, so with a single
    // HEAL charge: round 1 the KO is intercepted (revived to full), round 2
    // it isn't (charge spent) and the recruit is properly downed instead —
    // permanently losing 1 max HP, then patched back up to that new max.
    const result = runAutoBattle({ crew, enemy, rollAction, healCharges: 1 })

    expect(result.healsUsed).toBe(1)
    const finalRecruit = result.crewResults[0]
    expect(finalRecruit.maxHp).toBe(25)
    expect(finalRecruit.hp).toBe(25)
    expect(finalRecruit.status).toBe('active')
    expect(finalRecruit.revived).toBe(1)
  })

  test('initiative order follows Agility, faster combatants act first', () => {
    const fast = recruit({ id: 1, name: 'Fast', attributes: { might: 1, agility: 10 } })
    const slow = recruit({ id: 2, name: 'Slow', attributes: { might: 1, agility: 1 } })
    const enemy = buildEnemy('ROUTINE', () => 0) // agility 4 (secondary), between fast and slow
    // Nobody manages to hit anybody (miss every roll) so we just inspect turn order.
    const result = runAutoBattle({ crew: [slow, fast], enemy, rollAction: fixedRollAction(-999) })

    const firstRound = result.rounds[0]
    const actorOrder = firstRound.entries.map(e => e.actorId ?? 'enemy')
    expect(actorOrder.indexOf(1)).toBeLessThan(actorOrder.indexOf('enemy'))
    expect(actorOrder.indexOf('enemy')).toBeLessThan(actorOrder.indexOf(2))
  })

  test('stalemate safety valve: if nobody can ever hit, the battle ends without a false victory', () => {
    const enemy = buildEnemy('ROUTINE', () => 0)
    const crew = [recruit()]
    const result = runAutoBattle({ crew, enemy, rollAction: fixedRollAction(-999) })

    expect(result.enemyDefeated).toBe(false)
    expect(result.crewDefeated).toBe(true)
    expect(result.stalemate).toBe(true)
  })

  test('the enemy only ever targets active (not already downed or dead) crew members', () => {
    const a = recruit({ id: 1, name: 'A', hp: 3, maxHp: 3, attributes: { might: 1, agility: 1 } })
    const b = recruit({ id: 2, name: 'B', hp: 100, maxHp: 100, attributes: { might: 1, agility: 1 } })
    const enemy = buildEnemy('ROUTINE', (min, max) => (max === 1 ? 1 : min))
    const pickTarget = jest.fn(targets => targets[0])
    const rollAction = scoreBasedRollAction(enemy.agility >= enemy.might ? enemy.agility : enemy.might)

    const result = runAutoBattle({ crew: [a, b], enemy, rollAction, pickTarget })

    // Round 1: A (3 HP) is one-shot and dies (its original max HP of 26 makes
    // the post-hit max HP of 2 fall well below half); round 2 the enemy can
    // therefore only ever be offered B.
    expect(result.crewResults.find(c => c.id === 1).status).toBe('dead')
    expect(pickTarget).toHaveBeenCalledTimes(2)
    expect(pickTarget.mock.calls[0][0].map(t => t.id).sort()).toEqual([1, 2])
    expect(pickTarget.mock.calls[1][0].map(t => t.id)).toEqual([2])
  })

  describe('equipped armor', () => {
    // Guard 100 so the crew's own attacks never land on the enemy -- these
    // tests only care about the enemy's attacks landing (or not) on the crew.
    function unhittableEnemy() {
      return buildEnemy('ROUTINE', () => 100)
    }

    test('raises effective Guard enough to turn a would-be hit into a miss', () => {
      const enemy = unhittableEnemy()
      const rollAction = fixedRollAction(11) // > base Guard (10) but not > Guard+2 (12)

      const unarmored = recruit({ attributes: { might: 0, agility: 0 } })
      const armored = recruit({ id: 2, attributes: { might: 0, agility: 0 }, equippedArmor: { guardBonus: 2, requiredFortitude: 0 } })

      const withoutArmor = runAutoBattle({ crew: [unarmored], enemy, rollAction })
      const withArmor = runAutoBattle({ crew: [armored], enemy, rollAction })

      expect(withoutArmor.crewResults[0].hp).toBeLessThan(26)
      expect(withArmor.crewResults[0].hp).toBe(26)
    })

    test('grants no bonus when the wearer\'s Fortitude is below the armor\'s requirement', () => {
      const enemy = unhittableEnemy()
      const rollAction = fixedRollAction(11)
      const underqualified = recruit({
        attributes: { might: 0, agility: 0, fortitude: 1 },
        equippedArmor: { guardBonus: 2, requiredFortitude: 3 },
      })

      const result = runAutoBattle({ crew: [underqualified], enemy, rollAction })
      expect(result.crewResults[0].hp).toBeLessThan(26)
    })
  })
})
