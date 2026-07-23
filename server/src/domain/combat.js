const { computeGuard, bestCombatStat } = require('./recruit')
const { computeArmorGuardBonus } = require('./equipment')

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

function buildEnemy(difficulty, rollInRange, name = 'Hostiles') {
  const table = BOSS_TABLE[difficulty] || BOSS_TABLE.STANDARD
  const guard = rollInRange(table.guardMin, table.guardMax)
  const mightIsPrimary = rollInRange(0, 1) === 0

  return {
    name,
    hp: table.hp,
    maxHp: table.hp,
    guard,
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
 */
function runAutoBattle({ crew, enemy, rollAction, healCharges = 0, pickTarget }) {
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
  }))

  let enemyHp = enemy.hp
  let heals = healCharges
  const rounds = []
  const enemyStat = bestCombatStat({ might: enemy.might, agility: enemy.agility })

  const activeCrew = () => state.filter((c) => c.status === 'active')
  const choose = pickTarget || ((targets) => targets[Math.floor(Math.random() * targets.length)])

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
        const { attribute, score } = bestCombatStat(attacker.attributes)
        const { roll, hit, damage } = resolveAttack({
          attackerScore: score,
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
        const targets = activeCrew()
        if (targets.length === 0) continue
        const target = choose(targets)
        const targetGuard = computeGuard(
          target.attributes,
          computeArmorGuardBonus(target.attributes, target.equippedArmor),
        )
        const { roll, hit, damage } = resolveAttack({
          attackerScore: enemyStat.score,
          advantage: enemy.bossEdge,
          defenderGuard: targetGuard,
          rollAction,
        })
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

  // Crew members knocked out but still alive patch up to their (possibly
  // reduced) max HP once the fight is over, per the "healing after combat" rule.
  for (const c of state) {
    if (c.status === 'downed') {
      c.hp = c.maxHp
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

module.exports = { BOSS_TABLE, buildEnemy, resolveAttack, runAutoBattle }
