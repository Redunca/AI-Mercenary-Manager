'use strict'

// Dev-only tool: runs a fixed crew through many simulated missions and tallies
// outcome distributions (completion rate, death rate, avg reward, HP lost,
// ship damage, event outcomes) per difficulty. Lets you eyeball whether the
// odds *feel* right — risk that matches the fiction, rewards worth the risk,
// event variety — without needing to grind it out by hand in the client.
//
// This reuses the real content/engine (dataLoader, missionGenerator, the
// recruit generator, and the dice/DC math) so the numbers reflect actual
// game data, not a guessed-at model. It does NOT go through game.service.js
// or the DB, so it deliberately ignores:
//   - Consumables (ATTRIBUTE_BOOST / HEAL / REPAIR) — no advantage, no
//     revives, no ship repair. This makes the simulated crew slightly more
//     fragile than a fully-equipped one; think of these numbers as a
//     "worst case, bare crew" baseline.
//   - Multi-event ship durability persistence across missions — each
//     simulated mission starts with a full-durability starter ship.
//   - Recruits carrying HP/history between missions — each mission starts
//     every crew member at full HP (a returning crew would usually be
//     healed between missions anyway).
//
// Usage:
//   npm run simulate                          -> 500 runs/difficulty, random crew
//   npm run simulate -- 2000                  -> 2000 runs/difficulty
//   npm run simulate -- 2000 --seed=42         -> deterministic run
//   npm run simulate -- --difficulty=PERILOUS  -> only simulate one difficulty
//   npm run simulate -- --crew=2               -> crew size (default 3)
//   npm run simulate -- --archetype=specialized -> force every recruit's archetype

const { loadData } = require('../src/dataLoader')
const { generateMission, DIFFICULTIES } = require('../src/engine/missionGenerator')
const { generateCandidate } = require('../src/domain/recruit')
const { rollAction, rollDie } = require('../src/services/dice.service')
const { setSeed, resetSeed, randInt } = require('../src/utils/random')
const path = require('path')
const fs = require('fs')

const DEFAULT_RUNS = 500
const DEFAULT_CREW_SIZE = 3
const STARTER_SHIP_DURABILITY = 10

function parseArgs(argv) {
  let runs = DEFAULT_RUNS
  let seed = null
  let difficulty = null
  let crewSize = DEFAULT_CREW_SIZE
  let archetype = null

  for (const arg of argv) {
    if (/^\d+$/.test(arg)) {
      runs = Number(arg)
      continue
    }
    const seedMatch = arg.match(/^--seed=(\d+)$/)
    if (seedMatch) {
      seed = Number(seedMatch[1])
      continue
    }
    const diffMatch = arg.match(/^--difficulty=(\w+)$/)
    if (diffMatch) {
      difficulty = diffMatch[1].toUpperCase()
      continue
    }
    const crewMatch = arg.match(/^--crew=(\d+)$/)
    if (crewMatch) {
      crewSize = Number(crewMatch[1])
      continue
    }
    const archMatch = arg.match(/^--archetype=([\w-]+)$/)
    if (archMatch) {
      archetype = archMatch[1]
      continue
    }
  }

  return { runs, seed, difficulty, crewSize, archetype }
}

function loadPerksFlaws() {
  const dataDir = path.join(__dirname, '../data')
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'perks-flaws.json'), 'utf8'))
}

// Builds a fresh crew of `size` recruits. If `archetype` is given, every
// recruit is forced onto that archetype's attribute table (specialized /
// well-rounded / jack-of-all-trades) so you can compare crew builds head to
// head instead of averaging over random archetypes.
//
// Uses utils/random's seeded randInt (the same stream generateMission()
// draws from) so --seed reproduces mission content AND crew content
// together. Dice rolls (rollAction/rollDie in dice.service.js) are NOT
// affected by --seed — they call Math.random() directly, same as they do
// in the real game — so outcomes still vary run to run even with a fixed
// seed. That's intentional: --seed is for reproducing *what mission/crew
// you got*, not for eliminating the actual risk you're trying to measure.
function buildCrew(size, perksFlaws, archetype) {
  const crew = []
  for (let i = 0; i < size; i++) {
    let candidate = generateCandidate(i + 1, perksFlaws, randInt)
    if (archetype && candidate.archetype !== archetype) {
      // Re-roll until we get the requested archetype rather than reaching
      // into generateCandidate's internals — keeps this script decoupled
      // from its implementation details.
      let attempts = 0
      while (candidate.archetype !== archetype && attempts < 200) {
        candidate = generateCandidate(i + 1, perksFlaws, randInt)
        attempts++
      }
    }
    crew.push({ ...candidate, status: 'active' })
  }
  return crew
}

// A self-contained re-implementation of game.service.js's resolveEvents(),
// stripped of DB/consumable interactions per the assumptions documented
// above. Mirrors: best-stat recruit selection, rollAction vs event.dc,
// and each failureConsequence branch (HP_LOSS/FORCED_DEPARTURE/SHIP_DAMAGE/
// NO_REWARD), including the "last crew member dies" full-party-wipe check.
function simulateMission(mission, crew) {
  const stats = {
    difficulty: mission.difficulty,
    eventCount: mission.events.length,
    eventsResolved: 0,
    eventOutcomes: [], // [{ type, success }]
    creditsEarned: 0,
    hpLost: 0,
    deaths: 0,
    forcedDeparture: false,
    shipDamageEvents: 0,
    shipBroken: false,
    partyWiped: false,
    rewardForfeited: false,
    failed: false,
  }

  let shipDurability = STARTER_SHIP_DURABILITY

  for (const event of mission.events) {
    const activeCrew = crew.filter((r) => r.status !== 'dead')
    if (activeCrew.length === 0) {
      stats.failed = true
      stats.partyWiped = true
      break
    }

    const bestRecruit = activeCrew.reduce((best, current) => {
      const currentStat = current.attributes[event.attribute] || 0
      const bestStat = best.attributes[event.attribute] || 0
      return currentStat > bestStat ? current : best
    })

    const roll = rollAction(bestRecruit.attributes[event.attribute], 0)
    const success = roll.total >= event.dc
    stats.eventsResolved++
    stats.eventOutcomes.push({ type: event.type, success })

    if (success) {
      stats.creditsEarned += event.reward.amount
      continue
    }

    if (event.failureConsequence === 'HP_LOSS') {
      const hpLost = rollDie(6)
      stats.hpLost += hpLost
      bestRecruit.hp = Math.max(0, bestRecruit.hp - hpLost)
      if (bestRecruit.hp === 0) {
        bestRecruit.status = 'dead'
        stats.deaths++
        if (crew.filter((r) => r.status !== 'dead').length === 0) {
          stats.failed = true
          stats.partyWiped = true
          break
        }
      }
    } else if (event.failureConsequence === 'FORCED_DEPARTURE') {
      stats.failed = true
      stats.forcedDeparture = true
      break
    } else if (event.failureConsequence === 'SHIP_DAMAGE') {
      stats.rewardForfeited = true
      stats.shipDamageEvents++
      shipDurability = Math.max(0, shipDurability - rollDie(6))
      if (shipDurability === 0) {
        stats.shipBroken = true
        stats.failed = true
        stats.forcedDeparture = true
        break
      }
    } else {
      // NO_REWARD
      stats.rewardForfeited = true
    }
  }

  stats.completed = !stats.failed
  return stats
}

function emptyAggregate(difficulty) {
  return {
    difficulty,
    runs: 0,
    completed: 0,
    partyWiped: 0,
    forcedDeparture: 0,
    shipBroken: 0,
    totalDeaths: 0,
    totalHpLost: 0,
    totalCreditsEarned: 0,
    totalPotentialCredits: 0,
    eventOutcomes: {}, // eventType -> { success, failure }
  }
}

function runSimulation({ runs, seed, difficulty, crewSize, archetype }) {
  if (seed !== null) setSeed(seed)

  const data = loadData()
  const perksFlaws = loadPerksFlaws()
  const difficulties = difficulty ? [difficulty] : DIFFICULTIES

  const results = {}
  for (const diff of difficulties) {
    if (!data.difficultyTables[diff]) {
      throw new Error(`Unknown difficulty "${diff}". Expected one of: ${DIFFICULTIES.join(', ')}`)
    }
    const agg = emptyAggregate(diff)
    for (let i = 0; i < runs; i++) {
      const crew = buildCrew(crewSize, perksFlaws, archetype)
      const mission = generateMission(data, { difficulty: diff })
      const result = simulateMission(mission, crew)

      agg.runs++
      if (result.completed) agg.completed++
      if (result.partyWiped) agg.partyWiped++
      if (result.forcedDeparture) agg.forcedDeparture++
      if (result.shipBroken) agg.shipBroken++
      agg.totalDeaths += result.deaths
      agg.totalHpLost += result.hpLost
      agg.totalCreditsEarned += result.creditsEarned
      agg.totalPotentialCredits += mission.events.reduce((sum, e) => sum + e.reward.amount, 0)

      for (const outcome of result.eventOutcomes) {
        if (!agg.eventOutcomes[outcome.type])
          agg.eventOutcomes[outcome.type] = { success: 0, failure: 0 }
        agg.eventOutcomes[outcome.type][outcome.success ? 'success' : 'failure']++
      }
    }
    results[diff] = agg
  }

  if (seed !== null) resetSeed()
  return results
}

function pct(n, d) {
  return d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`
}

function printReport(results, { runs, crewSize, archetype }) {
  console.log(
    `\nMission simulation — ${runs} runs/difficulty, crew size ${crewSize}${archetype ? `, archetype=${archetype}` : ''}\n`,
  )
  console.log(
    'DIFFICULTY'.padEnd(10),
    'COMPLETE'.padEnd(10),
    'WIPED'.padEnd(8),
    'FORCED-RET'.padEnd(11),
    'SHIP-BROKE'.padEnd(11),
    'AVG DEATHS'.padEnd(11),
    'AVG HP LOST'.padEnd(12),
    'AVG CREDITS'.padEnd(12),
    'CREDITS/POTENTIAL',
  )
  for (const diff of Object.keys(results)) {
    const a = results[diff]
    console.log(
      diff.padEnd(10),
      pct(a.completed, a.runs).padEnd(10),
      pct(a.partyWiped, a.runs).padEnd(8),
      pct(a.forcedDeparture, a.runs).padEnd(11),
      pct(a.shipBroken, a.runs).padEnd(11),
      (a.totalDeaths / a.runs).toFixed(2).padEnd(11),
      (a.totalHpLost / a.runs).toFixed(1).padEnd(12),
      (a.totalCreditsEarned / a.runs).toFixed(0).padEnd(12),
      pct(a.totalCreditsEarned, a.totalPotentialCredits),
    )
  }
  console.log(
    '\n(WIPED = entire crew died; FORCED-RET = mission ended early via forced departure or a broken ship)',
  )

  console.log('\nEvent type success rates (all difficulties combined):')
  const combined = {}
  for (const diff of Object.keys(results)) {
    for (const [type, o] of Object.entries(results[diff].eventOutcomes)) {
      if (!combined[type]) combined[type] = { success: 0, failure: 0 }
      combined[type].success += o.success
      combined[type].failure += o.failure
    }
  }
  for (const [type, o] of Object.entries(combined)) {
    console.log(
      `  ${type.padEnd(16)} ${pct(o.success, o.success + o.failure)} (${o.success + o.failure} occurrences)`,
    )
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2))
  const results = runSimulation(args)
  printReport(results, args)
}

module.exports = { runSimulation, simulateMission, buildCrew }
