'use strict'

// Dev-only tool: prints N randomly generated planets to the console so the
// generator (habitability/population/technology curves, tag matching,
// nicknames...) can be eyeballed and tuned without spinning up the server
// or a mission. Not wired into the game itself.
//
// Usage:
//   npm run planete            -> 10 planets
//   npm run planete -- 25      -> 25 planets
//   npm run planete -- --seed=42          -> deterministic run (10 planets)
//   npm run planete -- 25 --seed=42       -> deterministic run (25 planets)

const { loadData } = require('../src/dataLoader')
const { generatePlanet } = require('../src/engine/planetGenerator')
const { setSeed } = require('../src/utils/random')
const TagContext = require('../src/engine/context')

const DEFAULT_COUNT = 10

function parseArgs(argv) {
  let count = DEFAULT_COUNT
  let seed = null

  for (const arg of argv) {
    const seedMatch = arg.match(/^--seed=(\d+)$/)
    if (seedMatch) {
      seed = Number(seedMatch[1])
      continue
    }
    if (/^\d+$/.test(arg)) {
      count = Number(arg)
    }
  }

  return { count, seed }
}

function formatPlanet(planet, index) {
  return {
    '#': index + 1,
    name: planet.name,
    system: planet.systemId,
    position: planet.position,
    habitability: planet.habitability,
    population: planet.population,
    technology: planet.technology,
    tags: planet.tags.join(', '),
  }
}

function main() {
  const { count, seed } = parseArgs(process.argv.slice(2))

  if (seed !== null) {
    setSeed(seed)
    console.log(`Seed: ${seed} (deterministic)\n`)
  }

  const { planets, entityNames } = loadData()

  const rows = []
  for (let i = 0; i < count; i++) {
    // Fresh context per planet: TagContext accumulates tags across a full
    // mission generation pipeline (planet -> mission type -> events), but
    // here we only care about the planet stage, and each planet should be
    // independent of the others.
    const context = new TagContext()
    const planet = generatePlanet(planets, entityNames, context)
    rows.push(formatPlanet(planet, i))
  }

  console.log(`Generated ${count} planet(s):\n`)
  console.table(rows)
}

main()
