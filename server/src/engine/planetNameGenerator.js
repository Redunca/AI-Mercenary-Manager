'use strict'

const { createSeededRng } = require('../utils/random')

// Each palette is a small CV(C) syllable kit: an onset (leading consonant
// cluster), a nucleus (vowel sound), and an optional coda (trailing
// consonant cluster, '' allowed for an open syllable). Concatenating
// onset+nucleus+coda gives one syllable; concatenating 1-3 syllables gives
// a pronounceable, invented word. Palettes are picked by planet tag so the
// *sound* fits the *place* (e.g. ice worlds lean on harsh k/th/sk, jungle
// worlds lean on soft l/m/r).
const PLANET_NAME_PALETTES = {
  ice: {
    onsets: ['kr', 'vor', 'fro', 'isk', 'nor', 'thal', 'vr'],
    nuclei: ['a', 'i', 'o', 'ai'],
    codas: ['', '', 'th', 'k', 'n', 'rn'],
  },
  volcanic: {
    onsets: ['zar', 'drak', 'mor', 'gor', 'vash', 'kaal'],
    nuclei: ['a', 'u', 'o'],
    codas: ['', '', 'g', 'k', 'x', 'rr'],
  },
  ocean: {
    onsets: ['mar', 'sel', 'wa', 'lir', 'tal', 'nau'],
    nuclei: ['a', 'e', 'i', 'ae'],
    codas: ['', '', 's', 'l', 'n'],
  },
  jungle: {
    onsets: ['vel', 'sil', 'mir', 'lyr', 'fen', 'or'],
    nuclei: ['a', 'e', 'i', 'ia'],
    codas: ['', '', 'l', 'n', 'ra'],
  },
  urban: {
    onsets: ['nex', 'zeph', 'vex', 'cor', 'tan', 'hal'],
    nuclei: ['a', 'e', 'o', 'y'],
    codas: ['', '', 'on', 'ex', 'yx'],
  },
  arid: {
    onsets: ['kess', 'rho', 'dun', 'sar', 'kor', 'bar'],
    nuclei: ['a', 'u', 'o'],
    codas: ['', '', 'sh', 'k', 'ra'],
  },
  // Used whenever none of the tag-specific palettes above match. Deliberately
  // bland/generic so it doesn't compete for "flavor" with the real palettes.
  default: {
    onsets: ['ar', 'el', 'on', 'ith', 'or', 'ka'],
    nuclei: ['a', 'e', 'i', 'o'],
    codas: ['', '', 'n', 'ra', 'on'],
  },
}

// Checked in order; the first entry with a matching tag wins. Keeping this
// as an explicit priority list (rather than e.g. scoring every match) means
// adding a new planet tag to planets.json never silently changes an
// existing biome's sound — it only takes effect once someone deliberately
// adds it here.
const PALETTE_TAG_PRIORITY = [
  { palette: 'ice', tags: ['ice', 'cold'] },
  { palette: 'volcanic', tags: ['volcanic', 'hot'] },
  { palette: 'ocean', tags: ['ocean'] },
  { palette: 'jungle', tags: ['jungle'] },
  { palette: 'urban', tags: ['urban', 'megacity', 'corporate'] },
  { palette: 'arid', tags: ['arid', 'frontier', 'mining', 'isolated', 'desert'] },
]

function paletteKeyForTags(tags) {
  for (const { palette, tags: matchTags } of PALETTE_TAG_PRIORITY) {
    if (matchTags.some((t) => tags.includes(t))) return palette
  }
  return 'default'
}

/** djb2 string hash, folded into an unsigned 32-bit int for use as a PRNG seed. */
function hashString(str) {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash * 33) ^ str.charCodeAt(i)) >>> 0
  }
  return hash >>> 0
}

function pickFrom(rng, array) {
  return array[Math.floor(rng() * array.length)]
}

function buildSyllable(palette, rng) {
  return (
    pickFrom(rng, palette.onsets) + pickFrom(rng, palette.nuclei) + pickFrom(rng, palette.codas)
  )
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** 1-2 syllables, used as one half of a hyphenated two-part name. */
function buildWordPart(palette, rng) {
  let part = buildSyllable(palette, rng)
  if (rng() < 0.15) part += buildSyllable(palette, rng)
  return part
}

/**
 * Procedurally builds a planet nickname out of invented sound syllables
 * instead of picking one from a fixed name list. The result is fully
 * deterministic given the same (systemId, position): that pairing is
 * hashed into a seed for a private PRNG, independent of the game's shared
 * random stream, so re-generating "the same planet" (e.g. re-rolling
 * everything else about it, or calling this from a dev script) always
 * produces the same name — the coordinate IS the name, in a sense.
 *
 * `tags` picks which sound palette to draw from (see PALETTE_TAG_PRIORITY);
 * everything else about the shape of the name (single word vs hyphenated
 * two-part, syllable count) is also decided by the same seeded roll, so it
 * varies from planet to planet without breaking determinism.
 */
function generatePlanetName(tags, systemId, position) {
  const palette = PLANET_NAME_PALETTES[paletteKeyForTags(tags)]
  const rng = createSeededRng(hashString(`${systemId}-${position}`))

  const twoPart = rng() < 0.5
  if (twoPart) {
    return `${capitalize(buildWordPart(palette, rng))}-${capitalize(buildWordPart(palette, rng))}`
  }

  const syllableCount = 2
  let word = ''
  for (let i = 0; i < syllableCount; i++) word += buildSyllable(palette, rng)
  return capitalize(word)
}

module.exports = {
  generatePlanetName,
  paletteKeyForTags,
  PLANET_NAME_PALETTES,
}
