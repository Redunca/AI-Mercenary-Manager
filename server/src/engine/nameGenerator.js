'use strict'

const { pickOne } = require('../utils/random')

/**
 * Picks a name from entityNames.categories[category], preferring entries
 * whose tags overlap with `preferredTags`. Falls back to the full pool
 * if nothing matches, so a slightly-too-specific tag filter never blocks
 * generation entirely.
 */
function pickName(entityNames, category, preferredTags = [], exclude = []) {
  const pool = entityNames.categories[category]
  if (!pool || pool.length === 0) {
    throw new Error(`No entity-names pool found for category "${category}"`)
  }

  let candidates = pool
  if (preferredTags.length > 0) {
    const filtered = pool.filter((entry) => entry.tags.some((t) => preferredTags.includes(t)))
    if (filtered.length > 0) candidates = filtered
  }

  // Avoid handing back a name already used elsewhere in this mission
  // (e.g. clientName and targetName both drawing "person" shouldn't
  // coincidentally resolve to the same individual), unless doing so
  // would leave no candidates at all.
  if (exclude.length > 0) {
    const unused = candidates.filter((entry) => !exclude.includes(entry.value))
    if (unused.length > 0) candidates = unused
  }

  return pickOne(candidates).value
}

/**
 * Resolves a "provides" spec value from planets.json / mission-types.json.
 * A spec is either:
 *  - a plain string literal (used as-is), or
 *  - { category, tags? } which triggers a pickName() lookup.
 */
function resolveProvideValue(entityNames, spec, exclude = []) {
  if (typeof spec === 'string') return spec
  if (spec && typeof spec === 'object' && spec.category) {
    return pickName(entityNames, spec.category, spec.tags || [], exclude)
  }
  throw new Error(`Invalid "provides" spec: ${JSON.stringify(spec)}`)
}

module.exports = { pickName, resolveProvideValue }
