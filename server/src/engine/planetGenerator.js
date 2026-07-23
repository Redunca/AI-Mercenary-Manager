'use strict'

const { pickOne, randInt, randGaussianInt } = require('../utils/random')
const { resolveProvideValue } = require('./nameGenerator')
const { generatePlanetName } = require('./planetNameGenerator')

// --- Stat generation tuning -------------------------------------------------
// All three stats are 0-5. Rolls cluster around MEAN via a Gaussian curve
// (see randGaussianInt) so most planets land near the mean while the
// extremes stay rare instead of impossible.
const HABITABILITY_MEAN = 4
const POPULATION_MEAN = 3
const TECHNOLOGY_MEAN = 4
const STAT_STD_DEV = 1.3

// A system doesn't exist as a persistent entity yet, so generatePlanet can
// invent one on the fly (letter + 6 digits, e.g. "W466875"). Callers that
// DO have a real system/position (e.g. a future galaxy generator) can pass
// them in via options to override this.
const SYSTEM_ID_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const SYSTEM_ID_MIN = 100000
const SYSTEM_ID_MAX = 999999
const MAX_SYSTEM_POSITION = 8 // planets 1..8, closest to the star = 1

// Position -> rough temperature band. Position 1 is closest to the star.
// This only ever *narrows* candidates that already match the caller's own
// tag request (see generatePlanet); it never overrides it.
const HOT_MAX_POSITION = 2 // positions 1-2 run hot
const COLD_MIN_POSITION = 4 // positions 4+ run cold
// positions in between (3) are temperate: no temperature tag added.

// A planet only earns a generated name once it's advanced enough for
// anyone to have named it: population AND technology both above 3.
const NICKNAME_MIN_POPULATION = 3
const NICKNAME_MIN_TECHNOLOGY = 3

// Level -> descriptive tag lookups. Index = the stat's numeric value.
// These are plain content strings, easy to rename without touching logic.
const HABITABILITY_TAGS = ['barren', 'hostile', 'marginal', 'habitable', 'lush', 'thriving']
const POPULATION_TAGS = [
  'uninhabited',
  'outpost',
  'settled',
  'populous',
  'crowded',
  'overpopulated',
]
// Index 0 is intentionally unused: technology is only ever 0 when population
// is 0, and "uninhabited" (from POPULATION_TAGS) already covers that case.
const TECHNOLOGY_TAGS = [null, 'primitive', 'industrial', 'developed', 'spacefaring', 'advanced']

function habitabilityTag(level) {
  return HABITABILITY_TAGS[level]
}

function populationTag(level) {
  return POPULATION_TAGS[level]
}

function technologyTag(level) {
  return TECHNOLOGY_TAGS[level] || null
}

/** Positions 1-2 run hot, 4+ run cold, 3 is temperate (no tag). */
function temperatureTagForPosition(position) {
  if (position <= HOT_MAX_POSITION) return 'hot'
  if (position >= COLD_MIN_POSITION) return 'cold'
  return null
}

/** All descriptive tags implied purely by the generated numbers/position. */
function statTagsFor(habitability, population, technology, position) {
  const tags = [habitabilityTag(habitability), populationTag(population)]
  const tech = technologyTag(technology)
  if (tech) tags.push(tech)
  const temperature = temperatureTagForPosition(position)
  if (temperature) tags.push(temperature)
  return tags
}

function generateSystemId() {
  const letter = SYSTEM_ID_LETTERS[randInt(0, SYSTEM_ID_LETTERS.length - 1)]
  const digits = randInt(SYSTEM_ID_MIN, SYSTEM_ID_MAX)
  return `${letter}${digits}`
}

/** 0 = nothing can live here, 5 = life is thriving. */
function generateHabitability() {
  return randGaussianInt(HABITABILITY_MEAN, 0, 5, STAT_STD_DEV)
}

/** 0 = no one lives here, 5 = the whole planet is populated. Never exceeds habitability. */
function generatePopulation(habitability) {
  const roll = randGaussianInt(POPULATION_MEAN, 0, 5, STAT_STD_DEV)
  return Math.min(roll, habitability)
}

/**
 * 0 = no technology at all, 4 = space-faring, 5 = very advanced.
 * Must be 0 iff population is 0; otherwise it's rolled independently of
 * population size (a tiny outpost can still be a cutting-edge research
 * facility).
 */
function generateTechnology(population) {
  if (population === 0) return 0
  return randGaussianInt(TECHNOLOGY_MEAN, 1, 5, STAT_STD_DEV)
}

function buildIdentifier(systemId, position) {
  return `${systemId}-${position}`
}

function qualifiesForNickname(population, technology) {
  return population > NICKNAME_MIN_POPULATION && technology > NICKNAME_MIN_TECHNOLOGY
}

/** "W466875-2" alone, or "W466875-2 \"Earth\"" once a nickname exists. */
function buildDisplayName(identifier, nickname) {
  return nickname ? `${identifier} "${nickname}"` : identifier
}

/**
 * Picks a planet template (optionally filtered by desired tags, e.g.
 * ["arid", "frontier"]), rolls its habitability/population/technology
 * stats, derives a system-position identifier and (if the stats qualify)
 * a generated nickname, and writes it all into the shared TagContext.
 *
 * Returns the planet template merged with all generated data, so the
 * mission generator can pull its Approach/Aftermath description templates
 * as well as the new stats.
 */
function generatePlanet(planets, entityNames, context, options = {}) {
  const {
    tags = [],
    systemId = generateSystemId(),
    position = randInt(1, MAX_SYSTEM_POSITION),
  } = options

  const habitability = generateHabitability()
  const population = generatePopulation(habitability)
  const technology = generateTechnology(population)
  const derivedTags = statTagsFor(habitability, population, technology, position)

  // The caller's own requested tags (e.g. a mission wanting a "jungle"
  // planet) come first and are never diluted by the stat/position tags.
  // Those only narrow further *within* whatever the caller already asked
  // for, and fall back harmlessly to the full pool when nothing matches.
  let candidates = planets
  if (tags.length > 0) {
    const filtered = planets.filter((p) => p.tags.some((t) => tags.includes(t)))
    if (filtered.length > 0) candidates = filtered
  }
  const statFiltered = candidates.filter((p) => p.tags.some((t) => derivedTags.includes(t)))
  if (statFiltered.length > 0) candidates = statFiltered

  const template = pickOne(candidates)
  const mergedTags = [...new Set([...template.tags, ...derivedTags])]

  const identifier = buildIdentifier(systemId, position)
  const nickname = qualifiesForNickname(population, technology)
    ? generatePlanetName(mergedTags, systemId, position)
    : null
  const name = buildDisplayName(identifier, nickname)

  context.set('planetName', name)
  context.set('planetIdentifier', identifier)
  context.set('planetNickname', nickname)

  for (const [key, spec] of Object.entries(template.provides)) {
    context.set(key, resolveProvideValue(entityNames, spec))
  }

  return {
    ...template,
    tags: mergedTags,
    systemId,
    position,
    identifier,
    nickname,
    name,
    habitability,
    population,
    technology,
  }
}

module.exports = {
  generatePlanet,
  generateSystemId,
  generateHabitability,
  generatePopulation,
  generateTechnology,
  temperatureTagForPosition,
  habitabilityTag,
  populationTag,
  technologyTag,
  buildIdentifier,
  buildDisplayName,
  qualifiesForNickname,
  MAX_SYSTEM_POSITION,
}
