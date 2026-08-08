const {
  BOSS_TABLE,
  buildEnemy,
  resolveAttack,
  runAutoBattle,
  gatherInvocationOptions,
  applyBaneEffect,
  applyBoonEffect,
  maybeInvoke,
} = require('../src/domain/combat')
const BANES_BOONS = require('../data/banes-boons.json')

function fixedRollAction(total) {
  return () => ({ d20: 0, bonus: 0, diceNotation: '—', total })
}

// Returns a rollAction that hits (a big total) when the attacker's score
// matches `hitScore`, and otherwise misses (a total of 0). Useful for
// controlling crew vs. enemy outcomes independently in a single battle,
// since crew and enemy attribute scores usually differ.
function scoreBasedRollAction(hitScore, hitTotal = 999, missTotal = 0) {
  return (score) => ({
    d20: 0,
    bonus: 0,
    diceNotation: '—',
    total: score === hitScore ? hitTotal : missTotal,
  })
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
    const rollInRange = jest
      .fn()
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
    const { hit, damage } = resolveAttack({
      attackerScore: 5,
      defenderGuard: 10,
      rollAction: fixedRollAction(20),
    })
    expect(hit).toBe(true)
    expect(damage).toBe(10)
  })

  test('a roll equal to Guard is a miss, not a hit', () => {
    const { hit, damage } = resolveAttack({
      attackerScore: 5,
      defenderGuard: 15,
      rollAction: fixedRollAction(15),
    })
    expect(hit).toBe(false)
    expect(damage).toBe(0)
  })

  test('a roll below Guard is a miss', () => {
    const { hit, damage } = resolveAttack({
      attackerScore: 5,
      defenderGuard: 15,
      rollAction: fixedRollAction(10),
    })
    expect(hit).toBe(false)
    expect(damage).toBe(0)
  })

  test('damage of 1 or 2 is clamped up to 3', () => {
    expect(
      resolveAttack({ attackerScore: 5, defenderGuard: 10, rollAction: fixedRollAction(11) })
        .damage,
    ).toBe(3)
    expect(
      resolveAttack({ attackerScore: 5, defenderGuard: 10, rollAction: fixedRollAction(12) })
        .damage,
    ).toBe(3)
  })

  test('damage of 3 or more is left as-is', () => {
    expect(
      resolveAttack({ attackerScore: 5, defenderGuard: 10, rollAction: fixedRollAction(13) })
        .damage,
    ).toBe(3)
    expect(
      resolveAttack({ attackerScore: 5, defenderGuard: 10, rollAction: fixedRollAction(25) })
        .damage,
    ).toBe(15)
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
    const rollAction = scoreBasedRollAction(
      enemy.agility >= enemy.might ? enemy.agility : enemy.might,
    )
    const result = runAutoBattle({ crew, enemy, rollAction })

    expect(result.enemyDefeated).toBe(false)
    expect(result.crewDefeated).toBe(true)
    expect(result.crewResults[0].maxHp).toBe(2) // 3 -> 2
    expect(result.crewResults[0].hp).toBe(0) // no longer patched up -- stays at 0, only the hospital heals this now
    expect(result.crewResults[0].status).toBe('active') // downed, but not dead: original max HP was 3, not halved from a much bigger number
  })

  test('a recruit dies once a knockout drops max HP to half its original value or below', () => {
    const enemy = buildEnemy('ROUTINE', (min, max) => (max === 1 ? 1 : min))
    const crew = [recruit({ hp: 3, maxHp: 4, originalMaxHp: 8 })] // 4 -> 3 after the hit, which is <= 8/2
    const rollAction = scoreBasedRollAction(
      enemy.agility >= enemy.might ? enemy.agility : enemy.might,
    )
    const result = runAutoBattle({ crew, enemy, rollAction })

    expect(result.crewResults[0].status).toBe('dead')
    expect(result.crewResults[0].hp).toBe(0)
    expect(result.crewResults[0].maxHp).toBe(3)
  })

  test('a HEAL charge intercepts a would-be knockout instead of applying the permanent penalty', () => {
    const enemy = buildEnemy('ROUTINE', (min, max) => (max === 1 ? 1 : min))
    const crew = [recruit()] // default 26/26 HP
    const rollAction = scoreBasedRollAction(
      enemy.agility >= enemy.might ? enemy.agility : enemy.might,
    )
    // The enemy always overkills whatever HP the recruit currently has, and
    // the crew (miss on every roll here) can't fight back, so with a single
    // HEAL charge: round 1 the KO is intercepted (revived to full), round 2
    // it isn't (charge spent) and the recruit is properly downed instead —
    // permanently losing 1 max HP, left at 0 HP for the hospital to heal.
    const result = runAutoBattle({ crew, enemy, rollAction, healCharges: 1 })

    expect(result.healsUsed).toBe(1)
    const finalRecruit = result.crewResults[0]
    expect(finalRecruit.maxHp).toBe(25)
    expect(finalRecruit.hp).toBe(0)
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
    const actorOrder = firstRound.entries.map((e) => e.actorId ?? 'enemy')
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
    const b = recruit({
      id: 2,
      name: 'B',
      hp: 100,
      maxHp: 100,
      attributes: { might: 1, agility: 1 },
    })
    const enemy = buildEnemy('ROUTINE', (min, max) => (max === 1 ? 1 : min))
    const pickTarget = jest.fn((targets) => targets[0])
    const rollAction = scoreBasedRollAction(
      enemy.agility >= enemy.might ? enemy.agility : enemy.might,
    )

    const result = runAutoBattle({ crew: [a, b], enemy, rollAction, pickTarget })

    // Round 1: A (3 HP) is one-shot and dies (its original max HP of 26 makes
    // the post-hit max HP of 2 fall well below half); round 2 the enemy can
    // therefore only ever be offered B.
    expect(result.crewResults.find((c) => c.id === 1).status).toBe('dead')
    expect(pickTarget).toHaveBeenCalledTimes(2)
    expect(pickTarget.mock.calls[0][0].map((t) => t.id).sort()).toEqual([1, 2])
    expect(pickTarget.mock.calls[1][0].map((t) => t.id)).toEqual([2])
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
      const armored = recruit({
        id: 2,
        attributes: { might: 0, agility: 0 },
        equippedArmor: { guardBonus: 2, requiredFortitude: 0 },
      })

      const withoutArmor = runAutoBattle({ crew: [unarmored], enemy, rollAction })
      const withArmor = runAutoBattle({ crew: [armored], enemy, rollAction })

      expect(withoutArmor.crewResults[0].hp).toBeLessThan(26)
      expect(withArmor.crewResults[0].hp).toBe(26)
    })

    test("grants no bonus when the wearer's Fortitude is below the armor's requirement", () => {
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

// --- Banes & Boons (curated subset, see server/data/banes-boons.json) -----

function makeCombatant(overrides = {}) {
  return {
    id: 1,
    name: 'Vex',
    attributes: {},
    hp: 26,
    maxHp: 26,
    activeEffects: new Set(),
    advantage: 0,
    guardBonus: 0,
    regenDice: null,
    ...overrides,
  }
}

function makeEnemyEffects(overrides = {}) {
  return {
    guard: 10,
    toughness: 10,
    resolve: 10,
    activeNames: new Set(),
    disadvantageNext: 0,
    disadvantage: 0,
    skipNextAttack: false,
    skipRestOfFight: false,
    persistentDamage: null,
    forcedTargetId: null,
    ...overrides,
  }
}

const bigRoll = () => ({ d20: 0, bonus: 0, diceNotation: '—', total: 999 })
const zeroRoll = () => ({ d20: 0, bonus: 0, diceNotation: '—', total: 0 })
const alwaysInvoke = () => 1 // <= INVOKE_CHANCE_PERCENT (40): always attempts
const neverInvoke = () => 100 // > INVOKE_CHANCE_PERCENT: never attempts
function fixedExploding(value) {
  return () => value
}

describe('banes and boons — gatherInvocationOptions', () => {
  test('returns nothing when the actor has no qualifying attribute score', () => {
    expect(gatherInvocationOptions(makeCombatant(), [], makeEnemyEffects())).toEqual([])
  })

  test('picks the highest Power Level tier the score qualifies for', () => {
    // Persistent Damage's levels are 2/4/6/8/9 -- a score of 6 qualifies up
    // through the power-6 tier, not the (unreached) power-8/9 tiers.
    const actor = makeCombatant({ attributes: { agility: 6 } })
    const pd = gatherInvocationOptions(actor, [], makeEnemyEffects()).find(
      (o) => o.name === 'Persistent Damage',
    )
    expect(pd.level.power).toBe(6)
  })

  test('excludes a bane already active on the enemy (anti-stack)', () => {
    // persuasion only unlocks Demoralized among the curated banes.
    const actor = makeCombatant({ attributes: { persuasion: 3 } })
    const enemyEffects = makeEnemyEffects({ activeNames: new Set(['Demoralized']) })
    expect(gatherInvocationOptions(actor, [], enemyEffects)).toEqual([])
  })

  test('excludes a boon already active on its would-be target (anti-stack)', () => {
    const actor = makeCombatant({ attributes: { fortitude: 3 } }) // only unlocks Resistance
    actor.activeEffects.add('Resistance')
    expect(gatherInvocationOptions(actor, [], makeEnemyEffects())).toEqual([])
  })

  test('excludes Heal when no ally is wounded', () => {
    const actor = makeCombatant({ id: 1, attributes: { learning: 1 } })
    const fine = makeCombatant({ id: 2, hp: 20, maxHp: 20 })
    const options = gatherInvocationOptions(actor, [actor, fine], makeEnemyEffects())
    expect(options.find((o) => o.name === 'Heal')).toBeUndefined()
  })

  test('Heal targets the most-wounded active ally', () => {
    const actor = makeCombatant({ id: 1, name: 'Doc', attributes: { learning: 9 } })
    const slight = makeCombatant({ id: 2, name: 'Slight', hp: 18, maxHp: 20 })
    const bad = makeCombatant({ id: 3, name: 'Bad', hp: 2, maxHp: 20 })
    const options = gatherInvocationOptions(actor, [actor, slight, bad], makeEnemyEffects())
    expect(options.find((o) => o.name === 'Heal').target.name).toBe('Bad')
  })

  test('Regeneration targets self, even when nobody is wounded', () => {
    const actor = makeCombatant({ attributes: { learning: 1 } })
    const options = gatherInvocationOptions(actor, [actor], makeEnemyEffects())
    const regen = options.find((o) => o.name === 'Regeneration')
    expect(regen.target).toBe(actor)
  })

  test('sorts qualifying options strongest Power Level first', () => {
    // Provoked's single tier (power 4) outranks Demoralized's (power 3) at
    // this score; persuasion doesn't unlock anything else curated.
    const actor = makeCombatant({ attributes: { persuasion: 4 } })
    const options = gatherInvocationOptions(actor, [], makeEnemyEffects())
    expect(options.map((o) => o.name)).toEqual(['Provoked', 'Demoralized'])
  })
})

describe('banes and boons — applyBaneEffect', () => {
  test('disadvantage_next (Knockdown): one-shot, not tracked for anti-stack', () => {
    const enemyEffects = makeEnemyEffects()
    applyBaneEffect(
      { name: 'Knockdown', data: BANES_BOONS.Knockdown, level: { power: 1, amount: 1 } },
      enemyEffects,
      1,
    )
    expect(enemyEffects.disadvantageNext).toBe(1)
    expect(enemyEffects.activeNames.has('Knockdown')).toBe(false)
  })

  test('skip_next (Stunned): one-shot, not tracked for anti-stack', () => {
    const enemyEffects = makeEnemyEffects()
    applyBaneEffect(
      { name: 'Stunned', data: BANES_BOONS.Stunned, level: { power: 4 } },
      enemyEffects,
      1,
    )
    expect(enemyEffects.skipNextAttack).toBe(true)
    expect(enemyEffects.activeNames.has('Stunned')).toBe(false)
  })

  test('skip_rest (Fear): persists, tracked for anti-stack', () => {
    const enemyEffects = makeEnemyEffects()
    applyBaneEffect({ name: 'Fear', data: BANES_BOONS.Fear, level: { power: 5 } }, enemyEffects, 1)
    expect(enemyEffects.skipRestOfFight).toBe(true)
    expect(enemyEffects.activeNames.has('Fear')).toBe(true)
  })

  test('persistent_damage: sets the tiered damage die, tracked for anti-stack', () => {
    const enemyEffects = makeEnemyEffects()
    const level = BANES_BOONS['Persistent Damage'].levels.find((l) => l.power === 6)
    applyBaneEffect(
      { name: 'Persistent Damage', data: BANES_BOONS['Persistent Damage'], level },
      enemyEffects,
      1,
    )
    expect(enemyEffects.persistentDamage).toEqual({ count: 1, sides: 8 })
    expect(enemyEffects.activeNames.has('Persistent Damage')).toBe(true)
  })

  test('disadvantage_persist (Demoralized): sets tiered persistent disadvantage, tracked for anti-stack', () => {
    const enemyEffects = makeEnemyEffects()
    const level = BANES_BOONS.Demoralized.levels.find((l) => l.power === 6)
    applyBaneEffect({ name: 'Demoralized', data: BANES_BOONS.Demoralized, level }, enemyEffects, 1)
    expect(enemyEffects.disadvantage).toBe(2)
    expect(enemyEffects.activeNames.has('Demoralized')).toBe(true)
  })

  test('redirect_target (Provoked): forces the enemy onto the invoker, tracked for anti-stack', () => {
    const enemyEffects = makeEnemyEffects()
    applyBaneEffect(
      { name: 'Provoked', data: BANES_BOONS.Provoked, level: { power: 4 } },
      enemyEffects,
      42,
    )
    expect(enemyEffects.forcedTargetId).toBe(42)
    expect(enemyEffects.activeNames.has('Provoked')).toBe(true)
  })
})

describe('banes and boons — applyBoonEffect', () => {
  test('heal_once (Heal): heals the target capped at max HP, and returns the amount healed', () => {
    const target = makeCombatant({ hp: 18, maxHp: 20 })
    const level = BANES_BOONS.Heal.levels.find((l) => l.power === 1)
    const healed = applyBoonEffect({ name: 'Heal', data: BANES_BOONS.Heal, level, target }, fixedExploding(5))
    expect(healed).toBe(5)
    expect(target.hp).toBe(20) // 18 + 5 = 23, capped at maxHp 20
  })

  test('advantage_persist (Bolster): sets tiered persistent advantage, tracked for anti-stack', () => {
    const target = makeCombatant()
    const level = BANES_BOONS.Bolster.levels.find((l) => l.power === 6)
    applyBoonEffect({ name: 'Bolster', data: BANES_BOONS.Bolster, level, target }, fixedExploding(1))
    expect(target.advantage).toBe(2)
    expect(target.activeEffects.has('Bolster')).toBe(true)
  })

  test('guard_bonus_persist (Resistance): sets tiered persistent Guard bonus, tracked for anti-stack', () => {
    const target = makeCombatant()
    const level = BANES_BOONS.Resistance.levels.find((l) => l.power === 7)
    applyBoonEffect({ name: 'Resistance', data: BANES_BOONS.Resistance, level, target }, fixedExploding(1))
    expect(target.guardBonus).toBe(9)
    expect(target.activeEffects.has('Resistance')).toBe(true)
  })

  test('heal_over_time (Regeneration): sets the tiered regen die, tracked for anti-stack', () => {
    const target = makeCombatant()
    const level = BANES_BOONS.Regeneration.levels.find((l) => l.power === 5)
    applyBoonEffect(
      { name: 'Regeneration', data: BANES_BOONS.Regeneration, level, target },
      fixedExploding(1),
    )
    expect(target.regenDice).toEqual({ count: 1, sides: 8 })
    expect(target.activeEffects.has('Regeneration')).toBe(true)
  })
})

describe('banes and boons — maybeInvoke', () => {
  test('returns null when rollPercent is not supplied', () => {
    const actor = makeCombatant({ attributes: { might: 5 } })
    const result = maybeInvoke(actor, [], makeEnemyEffects(), {
      rollAction: bigRoll,
      rollExploding: fixedExploding(1),
    })
    expect(result).toBeNull()
  })

  test('returns null when rollExploding is not supplied', () => {
    const actor = makeCombatant({ attributes: { might: 5 } })
    const result = maybeInvoke(actor, [], makeEnemyEffects(), {
      rollAction: bigRoll,
      rollPercent: alwaysInvoke,
    })
    expect(result).toBeNull()
  })

  test('returns null when the actor qualifies for nothing', () => {
    const result = maybeInvoke(makeCombatant(), [], makeEnemyEffects(), {
      rollAction: bigRoll,
      rollPercent: alwaysInvoke,
      rollExploding: fixedExploding(1),
    })
    expect(result).toBeNull()
  })

  test('returns null when the per-turn chance roll misses', () => {
    const actor = makeCombatant({ attributes: { might: 5 } })
    const result = maybeInvoke(actor, [], makeEnemyEffects(), {
      rollAction: bigRoll,
      rollPercent: neverInvoke,
      rollExploding: fixedExploding(1),
    })
    expect(result).toBeNull()
  })

  test('a bane already active on the enemy is not re-attempted', () => {
    const actor = makeCombatant({ attributes: { persuasion: 3 } }) // only unlocks Demoralized
    const enemyEffects = makeEnemyEffects({ activeNames: new Set(['Demoralized']) })
    const result = maybeInvoke(actor, [], enemyEffects, {
      rollAction: bigRoll,
      rollPercent: alwaysInvoke,
      rollExploding: fixedExploding(1),
    })
    expect(result).toBeNull()
  })

  test('a successful bane invocation (Knockdown) rolls, applies its effect, and is logged', () => {
    const actor = makeCombatant({ attributes: { agility: 1 } }) // only unlocks Knockdown
    const enemyEffects = makeEnemyEffects({ guard: 0 })
    const entry = maybeInvoke(actor, [], enemyEffects, {
      rollAction: bigRoll,
      rollPercent: alwaysInvoke,
      rollExploding: fixedExploding(1),
    })
    expect(entry).toMatchObject({
      actor: 'crew',
      actorId: actor.id,
      actorName: actor.name,
      invoke: { name: 'Knockdown', kind: 'bane', attribute: 'agility', success: true },
    })
    expect(enemyEffects.disadvantageNext).toBe(1)
  })

  test('a failed bane invocation applies no effect but is still logged', () => {
    const actor = makeCombatant({ attributes: { agility: 1 } })
    const enemyEffects = makeEnemyEffects({ guard: 999 })
    const entry = maybeInvoke(actor, [], enemyEffects, {
      rollAction: zeroRoll,
      rollPercent: alwaysInvoke,
      rollExploding: fixedExploding(1),
    })
    expect(entry.invoke).toMatchObject({ name: 'Knockdown', success: false })
    expect(enemyEffects.disadvantageNext).toBe(0)
  })

  test('a successful boon invocation (Heal) rolls, heals the target, and is logged', () => {
    const actor = makeCombatant({ id: 1, name: 'Doc', attributes: { learning: 1 } })
    const hurt = makeCombatant({ id: 2, name: 'Hurt', hp: 10, maxHp: 20 })
    const entry = maybeInvoke(actor, [actor, hurt], makeEnemyEffects(), {
      rollAction: bigRoll,
      rollPercent: alwaysInvoke,
      rollExploding: fixedExploding(4),
    })
    expect(entry.invoke).toMatchObject({
      name: 'Heal',
      kind: 'boon',
      targetName: 'Hurt',
      success: true,
      healedAmount: 4,
    })
    expect(hurt.hp).toBe(14)
  })
})

describe('banes and boons — runAutoBattle integration', () => {
  test('omitting rollPercent/rollExploding reproduces the original plain-attack-only simulation', () => {
    // A recruit whose attributes would otherwise qualify for several banes,
    // to prove the omission -- not a lack of qualification -- is what keeps
    // this deterministic and attack-only.
    const enemy = buildEnemy('ROUTINE', () => 0)
    const crew = [recruit({ attributes: { might: 8, agility: 8 } })]
    const result = runAutoBattle({ crew, enemy, rollAction: fixedRollAction(999) })

    expect(result.enemyDefeated).toBe(true)
    expect(result.rounds[0].entries.every((e) => !e.invoke)).toBe(true)
  })

  test('Persistent Damage ticks at the start of each of the enemy\'s subsequent turns', () => {
    const enemy = buildEnemy('ROUTINE', () => 0) // guard 0, might 6 (primary), agility 4, hp 40
    // agility 2 qualifies for Persistent Damage (power 2) and Knockdown
    // (power 1); Persistent Damage's higher power wins the pick.
    const crew = [recruit({ attributes: { agility: 2 } })]
    const rollAction = scoreBasedRollAction(2) // crew invocation (score 2) always hits; enemy's own attack (score 6) always misses

    const result = runAutoBattle({
      crew,
      enemy,
      rollAction,
      rollPercent: alwaysInvoke,
      rollExploding: fixedExploding(3), // 1d4 tier -> a deterministic 3 damage per tick
    })

    const round2Tick = result.rounds[1].entries.find((e) => e.persistentTick)
    expect(round2Tick).toMatchObject({ damage: 3 })
    expect(result.enemyFinalHp).toBeLessThan(enemy.hp)
  })

  test('Stunned causes the enemy to skip an attack in a real battle', () => {
    const enemy = buildEnemy('ROUTINE', () => 0) // might 6 (primary), agility 4, guard/toughness 0
    // might 4 qualifies Stunned (power 4) among others tied at power 4
    // (Provoked); Stunned is chosen deterministically (see its earlier
    // position in banes-boons.json, and gatherInvocationOptions' stable sort).
    const crew = [recruit({ id: 1, attributes: { might: 4 }, hp: 100, maxHp: 100, originalMaxHp: 100 })]
    const rollAction = scoreBasedRollAction(4)

    const result = runAutoBattle({
      crew,
      enemy,
      rollAction,
      rollPercent: alwaysInvoke,
      rollExploding: fixedExploding(1),
    })

    const skipped = result.rounds.flatMap((r) => r.entries).filter((e) => e.skipped)
    expect(skipped.length).toBeGreaterThan(0)
  })

  test('Provoked redirects the enemy onto the provoker, overriding pickTarget', () => {
    const enemy = buildEnemy('ROUTINE', () => 0) // guard/resolve 0
    const provoker = recruit({
      id: 1,
      name: 'Tank',
      attributes: { deception: 4 }, // deception only unlocks Provoked
      hp: 100,
      maxHp: 100,
      originalMaxHp: 100,
    })
    const other = recruit({
      id: 2,
      name: 'Other',
      attributes: {},
      hp: 100,
      maxHp: 100,
      originalMaxHp: 100,
    })
    const pickTarget = jest.fn((targets) => targets.find((t) => t.id === 2) || targets[0])
    const rollAction = scoreBasedRollAction(4) // Tank's Provoked invocation (score 4) always hits; everything else always misses

    const result = runAutoBattle({
      crew: [provoker, other],
      enemy,
      rollAction,
      pickTarget,
      rollPercent: alwaysInvoke,
      rollExploding: fixedExploding(1),
    })

    const enemyAttacks = result.rounds
      .flatMap((r) => r.entries)
      .filter((e) => e.actor === 'enemy' && e.targetId !== undefined)
    // Round 1: Provoked isn't active yet, so pickTarget's usual choice (id 2) is used.
    expect(enemyAttacks[0].targetId).toBe(2)
    // From then on, every attack redirects to the provoker (id 1) regardless of pickTarget.
    expect(enemyAttacks.slice(1).every((e) => e.targetId === 1)).toBe(true)
    expect(pickTarget).toHaveBeenCalledTimes(1)
  })
})
