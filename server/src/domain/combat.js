const { computeGuard, bestCombatStat } = require('./recruit')
const { computeArmorGuardBonus } = require('./equipment')
const BANES_BOONS = require('../../data/banes-boons.json')

// Enemies represent the whole "enemy group" named by a COMBAT event
// (e.g. enemyGroupName) as a single combatant, built using the Boss NPC
// Build table from the core rules (all recruits are level 1 for now, so
// boss level is scaled off mission difficulty instead of party level).
const BOSS_TABLE = {
  ROUTINE: { hp: 40, guardMin: 12, guardMax: 17, primary: 6, secondary: 4, edge: 1 },
  STANDARD: { hp: 50, guardMin: 13, guardMax: 18, primary: 6, secondary: 4, edge: 1 },
  HARD: { hp: 60, guardMin: 14, guardMax: 19, primary: 7, secondary: 5, edge: 2 },
  PERILOUS: { hp: 70, guardMin: 15, guardMax: 20, primary: 7, secondary: 5, edge: 2 },
  EPIC: { hp: 75, guardMin: 16, guardMax: 21, primary: 8, secondary: 6, edge: 2 },
}

const MAX_ROUNDS = 100 // safety valve against a theoretical (near-impossible) endless stalemate

// Chance (out of 100) that a crew member with a qualifying bane/boon (see
// maybeInvoke below) attempts it instead of a plain attack on their turn.
// Tunable. Invocation is only ever attempted when `rollPercent`/
// `rollExploding` dependencies are supplied to runAutoBattle -- omitting
// them reproduces the original plain-attack-only battle simulation exactly,
// so every existing caller/test that doesn't know about banes/boons is
// unaffected. Deliberately a dependency distinct from `rollInRange` (rather
// than e.g. `rollInRange(1, 100)`), so a caller/test that already mocks
// rollInRange for something else (buildEnemy's stat rolls) can't
// accidentally also start driving this unrelated heuristic.
const INVOKE_CHANCE_PERCENT = 40

function buildEnemy(difficulty, rollInRange, name = 'Hostiles') {
  const table = BOSS_TABLE[difficulty] || BOSS_TABLE.STANDARD
  const guard = rollInRange(table.guardMin, table.guardMax)
  const mightIsPrimary = rollInRange(0, 1) === 0

  return {
    name,
    hp: table.hp,
    maxHp: table.hp,
    guard,
    // This simple NPC stat block doesn't differentiate Guard from Toughness
    // from Resolve the way a recruit's attributes do (see
    // domain/recruit.js's computeGuard) -- one rolled number represents the
    // enemy's overall defense against every curated bane in
    // server/data/banes-boons.json, whichever of the three it nominally
    // targets.
    toughness: guard,
    resolve: guard,
    might: mightIsPrimary ? table.primary : table.secondary,
    agility: mightIsPrimary ? table.secondary : table.primary,
    bossEdge: table.edge,
  }
}

// A damaging attack: roll d20 + attribute dice (via rollAction) against the
// defender's Guard. A roll that merely equals Guard is not a hit (the crew's
// rules only trigger damage on a strictly higher roll). Any hit deals at
// least 3 damage.
function resolveAttack({ attackerScore, advantage = 0, defenderGuard, rollAction }) {
  const roll = rollAction(attackerScore, advantage)
  const hit = roll.total > defenderGuard
  let damage = 0
  if (hit) {
    damage = roll.total - defenderGuard
    if (damage < 3) damage = 3
  }
  return { roll, hit, damage }
}

// --- Banes & Boons (Open Legend Chapter 3, curated subset) --------------
//
// Any crew member may, on their turn, attempt a curated bane against the
// enemy or a curated boon on an ally instead of a plain attack. Qualifying
// requires an attribute score at least equal to the effect's Power Level;
// invoking rolls that attribute (via the same `rollAction` used for plain
// attacks) against the target's defense (banes) or a Challenge Rating of
// 10 + 2xPower Level (boons). Effects live only for the duration of this one
// battle -- nothing here is persisted to the recruit. See
// server/data/banes-boons.json for the curated table and
// server/src/services/log.service.js's summarizeCombatEntry for how an
// `invoke`-shaped round entry becomes a log line.

// Among an entry's allowed attributes, the invoker uses whichever they're
// strongest in (maximizes both their qualifying Power Level and their roll).
function bestQualifyingAttribute(attributes, allowedAttributes) {
  let best = null
  for (const attribute of allowedAttributes) {
    const score = attributes[attribute] || 0
    if (!best || score > best.score) best = { attribute, score }
  }
  return best
}

// The highest Power Level tier the given score qualifies for, or null if it
// doesn't meet even the lowest tier. `levels` must be sorted ascending by
// power (true of every entry in banes-boons.json).
function levelFor(levels, score) {
  let chosen = null
  for (const level of levels) {
    if (level.power <= score) chosen = level
  }
  return chosen
}

function rollDiceTotal(dice, rollExploding) {
  let total = 0
  for (let i = 0; i < dice.count; i++) total += rollExploding(dice.sides)
  return total
}

// Gathers every bane the actor qualifies to attempt against the enemy (not
// already active on it) and every boon they qualify to attempt on an ally,
// sorted strongest-qualifying-Power-Level first. Heal-type boons target the
// most-wounded active ally (and are skipped if nobody's hurt); the rest
// target the actor themself.
function gatherInvocationOptions(actor, allies, enemyEffects) {
  const options = []
  for (const [name, data] of Object.entries(BANES_BOONS)) {
    const qualifier = bestQualifyingAttribute(actor.attributes, data.attributes)
    if (!qualifier) continue
    const level = levelFor(data.levels, qualifier.score)
    if (!level) continue

    if (data.kind === 'bane') {
      if (enemyEffects.activeNames.has(name)) continue
      options.push({ name, data, level, score: qualifier.score, attribute: qualifier.attribute })
      continue
    }

    // heal_once specifically (not heal_over_time -- see Regeneration) needs an
    // already-wounded target: it shares its gating attribute with Heal, whose
    // finer-grained power tiers always match or beat Regeneration's sparser
    // ones on the same score, so if both competed for the same "wounded
    // ally" pool Heal would deterministically win every tie and Regeneration
    // could never actually be picked. Targeting self proactively instead
    // (like the other persist-type boons) keeps it reachable, and reads
    // fine narratively too -- regeneration is something you set up before
    // you need it, not a reactive burst heal.
    const target = data.resolution === 'heal_once'
      ? allies
          .filter((a) => a.hp < a.maxHp)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
      : actor
    if (!target || target.activeEffects.has(name)) continue
    options.push({
      name,
      data,
      level,
      score: qualifier.score,
      attribute: qualifier.attribute,
      target,
    })
  }
  return options.sort((a, b) => b.level.power - a.level.power)
}

function applyBaneEffect(option, enemyEffects, actorId) {
  const { name, data, level } = option
  switch (data.resolution) {
    case 'disadvantage_next':
      enemyEffects.disadvantageNext = level.amount
      return
    case 'skip_next':
      enemyEffects.skipNextAttack = true
      return
    case 'skip_rest':
      enemyEffects.skipRestOfFight = true
      break
    case 'persistent_damage':
      enemyEffects.persistentDamage = level.dice
      break
    case 'disadvantage_persist':
      enemyEffects.disadvantage = level.amount
      break
    case 'redirect_target':
      enemyEffects.forcedTargetId = actorId
      break
    default:
      return
  }
  enemyEffects.activeNames.add(name)
}

// Returns the amount healed for heal_once (useful for the invocation's log
// line), or undefined for every other resolution kind.
function applyBoonEffect(option, rollExploding) {
  const { name, data, level, target } = option
  switch (data.resolution) {
    case 'heal_once': {
      const healed = rollDiceTotal(level.dice, rollExploding)
      target.hp = Math.min(target.maxHp, target.hp + healed)
      return healed
    }
    case 'advantage_persist':
      target.advantage = level.amount
      break
    case 'guard_bonus_persist':
      target.guardBonus = level.amount
      break
    case 'heal_over_time':
      target.regenDice = level.dice
      break
    default:
      return
  }
  target.activeEffects.add(name)
}

// Attempts a bane/boon instead of a plain attack for the given crew member's
// turn. Returns a round-log entry if one was attempted (successfully or
// not), or null if the actor should attack normally this turn -- either
// nothing qualified, the per-turn chance didn't hit, or (the default) no
// `rollPercent`/`rollExploding` dependency was supplied at all. The chance
// check is written so an unconfigured/absent `rollPercent` (e.g. a mock
// that returns undefined) safely resolves to "don't invoke" rather than
// "always invoke".
function maybeInvoke(actor, allies, enemyEffects, { rollAction, rollPercent, rollExploding }) {
  if (!rollPercent || !rollExploding) return null
  const options = gatherInvocationOptions(actor, allies, enemyEffects)
  if (options.length === 0) return null
  const attemptsInvocation = rollPercent() <= INVOKE_CHANCE_PERCENT
  if (!attemptsInvocation) return null

  const option = options[0]
  const { name, data, score, attribute } = option
  const roll = rollAction(score)
  let success
  let defenderScore
  let healedAmount

  if (data.kind === 'bane') {
    defenderScore = enemyEffects[data.defense]
    success = roll.total > defenderScore
    if (success) applyBaneEffect(option, enemyEffects, actor.id)
  } else {
    defenderScore = 10 + 2 * option.level.power
    success = roll.total >= defenderScore
    if (success) healedAmount = applyBoonEffect(option, rollExploding)
  }

  return {
    actor: 'crew',
    actorId: actor.id,
    actorName: actor.name,
    invoke: {
      name,
      kind: data.kind,
      attribute,
      targetName: option.target?.name,
      roll,
      success,
      healedAmount,
    },
  }
}

/**
 * Simulates a full auto-battle: the whole active crew vs. a single enemy.
 * Purely functional given its inputs — no I/O, no randomness besides what's
 * injected via rollAction — so it can be unit tested deterministically.
 *
 * @param {Array<{id, name, attributes, hp, maxHp, originalMaxHp, equippedArmor}>} crew
 * @param {object} enemy - as returned by buildEnemy()
 * @param {(score:number, advantage?:number) => {d20,bonus,diceNotation,total}} rollAction
 * @param {number} healCharges - number of HEAL consumables available to intercept a KO this battle
 * @param {(activeCrew: Array) => object} [pickTarget] - defaults to uniform random pick
 * @param {() => number} [rollPercent] - enables banes/boons invocation when supplied (a 1-100 roll)
 * @param {(sides:number) => number} [rollExploding] - required alongside rollPercent for damage/healing math
 */
function runAutoBattle({
  crew,
  enemy,
  rollAction,
  healCharges = 0,
  pickTarget,
  rollPercent,
  rollExploding,
}) {
  const state = crew.map((c) => ({
    id: c.id,
    name: c.name,
    attributes: c.attributes,
    hp: c.hp,
    maxHp: c.maxHp,
    originalMaxHp: c.originalMaxHp ?? c.maxHp,
    equippedArmor: c.equippedArmor ?? null,
    status: 'active', // active | downed | dead
    revived: 0,
    // Banes & Boons working state -- see the section above. Scoped to this
    // battle only; never read from or written back to the caller's `crew`.
    activeEffects: new Set(),
    advantage: 0,
    guardBonus: 0,
    regenDice: null,
  }))

  let enemyHp = enemy.hp
  let heals = healCharges
  const rounds = []
  const enemyStat = bestCombatStat({ might: enemy.might, agility: enemy.agility })
  const enemyEffects = {
    guard: enemy.guard,
    toughness: enemy.toughness,
    resolve: enemy.resolve,
    activeNames: new Set(),
    disadvantageNext: 0,
    disadvantage: 0,
    skipNextAttack: false,
    skipRestOfFight: false,
    persistentDamage: null,
    forcedTargetId: null,
  }

  const activeCrew = () => state.filter((c) => c.status === 'active')
  const choose = pickTarget || ((targets) => targets[Math.floor(Math.random() * targets.length)])
  const diceDeps = { rollAction, rollPercent, rollExploding }

  let round = 0
  let stalemate = false
  while (enemyHp > 0 && activeCrew().length > 0) {
    if (round >= MAX_ROUNDS) {
      stalemate = true
      break
    }
    round += 1
    const entries = []

    const order = [...activeCrew().map((ref) => ({ type: 'crew', ref })), { type: 'enemy' }].sort(
      (a, b) => {
        const aAg = a.type === 'crew' ? a.ref.attributes.agility || 0 : enemy.agility
        const bAg = b.type === 'crew' ? b.ref.attributes.agility || 0 : enemy.agility
        return bAg - aAg
      },
    )

    for (const combatant of order) {
      if (enemyHp <= 0 || activeCrew().length === 0) break

      if (combatant.type === 'crew') {
        const attacker = combatant.ref
        if (attacker.status !== 'active') continue

        if (attacker.regenDice) {
          const healed = rollDiceTotal(attacker.regenDice, rollExploding)
          attacker.hp = Math.min(attacker.maxHp, attacker.hp + healed)
          entries.push({
            actor: 'crew',
            actorId: attacker.id,
            actorName: attacker.name,
            regenTick: true,
            healed,
            hpAfter: attacker.hp,
          })
        }

        const invokeEntry = maybeInvoke(attacker, activeCrew(), enemyEffects, diceDeps)
        if (invokeEntry) {
          entries.push(invokeEntry)
          continue
        }

        const { attribute, score } = bestCombatStat(attacker.attributes)
        const { roll, hit, damage } = resolveAttack({
          attackerScore: score,
          advantage: attacker.advantage,
          defenderGuard: enemy.guard,
          rollAction,
        })
        enemyHp = Math.max(0, enemyHp - damage)
        entries.push({
          actor: 'crew',
          actorId: attacker.id,
          actorName: attacker.name,
          attribute,
          roll,
          hit,
          damage,
          enemyHpAfter: enemyHp,
        })
      } else {
        if (enemyEffects.persistentDamage) {
          const tickDamage = rollDiceTotal(enemyEffects.persistentDamage, rollExploding)
          enemyHp = Math.max(0, enemyHp - tickDamage)
          entries.push({ actor: 'enemy', persistentTick: true, damage: tickDamage, enemyHpAfter: enemyHp })
          if (enemyHp <= 0) break
        }
        if (enemyEffects.skipNextAttack || enemyEffects.skipRestOfFight) {
          enemyEffects.skipNextAttack = false
          entries.push({ actor: 'enemy', skipped: true })
          continue
        }

        const targets = activeCrew()
        if (targets.length === 0) continue
        const forced = targets.find((t) => t.id === enemyEffects.forcedTargetId)
        const target = forced || choose(targets)
        const targetGuard =
          computeGuard(
            target.attributes,
            computeArmorGuardBonus(target.attributes, target.equippedArmor),
          ) + target.guardBonus
        const { roll, hit, damage } = resolveAttack({
          attackerScore: enemyStat.score,
          advantage: enemy.bossEdge - enemyEffects.disadvantage - enemyEffects.disadvantageNext,
          defenderGuard: targetGuard,
          rollAction,
        })
        enemyEffects.disadvantageNext = 0
        const entry = {
          actor: 'enemy',
          targetId: target.id,
          targetName: target.name,
          attribute: enemyStat.attribute,
          roll,
          hit,
          damage,
        }
        if (hit) {
          target.hp = Math.max(0, target.hp - damage)
          if (target.hp === 0) {
            if (heals > 0) {
              heals -= 1
              target.hp = target.maxHp
              target.revived += 1
              entry.revived = true
            } else {
              target.status = 'downed'
              target.maxHp -= 1
              entry.downed = true
              if (target.maxHp <= target.originalMaxHp / 2) {
                target.status = 'dead'
                entry.died = true
              }
            }
          }
        }
        entry.targetHpAfter = target.hp
        entries.push(entry)
      }
    }
    rounds.push({ round, entries })
  }

  const enemyDefeated = enemyHp <= 0
  const crewDefeated = !enemyDefeated && (activeCrew().length === 0 || stalemate)

  // Crew members knocked out but still alive are no longer patched up to
  // full HP once the fight is over -- they come home hurt (possibly at 0 HP)
  // and only recover once admitted to the hospital (see hospital.service.js).
  // 'downed' itself must not leak out as a persisted status, so it still
  // reverts to 'active' here.
  for (const c of state) {
    if (c.status === 'downed') {
      c.status = 'active'
    }
  }

  return {
    rounds,
    enemyDefeated,
    crewDefeated,
    stalemate,
    enemyFinalHp: enemyHp,
    healsUsed: healCharges - heals,
    crewResults: state.map((c) => ({
      id: c.id,
      hp: c.hp,
      maxHp: c.maxHp,
      status: c.status,
      revived: c.revived,
    })),
  }
}

module.exports = {
  BOSS_TABLE,
  buildEnemy,
  resolveAttack,
  runAutoBattle,
  // Exported for direct, precise unit testing of the banes/boons resolution
  // pipeline (qualification, level selection, anti-stack, success/failure,
  // and each resolution type's mutation) without needing to orchestrate full
  // multi-round battles/turn order.
  gatherInvocationOptions,
  applyBaneEffect,
  applyBoonEffect,
  maybeInvoke,
}
