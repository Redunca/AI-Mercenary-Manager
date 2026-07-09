'use strict';

const { pickOne } = require('../utils/random');
const { pickName, resolveProvideValue } = require('./nameGenerator');

/**
 * Picks a planet template (optionally filtered by desired tags, e.g.
 * ["arid", "frontier"]) and writes all of its provided tags — including
 * a generated planetName — into the shared TagContext.
 *
 * Returns the planet template itself so the mission generator can later
 * pull its Approach/Aftermath description templates.
 */
function generatePlanet(planets, entityNames, context, { tags = [] } = {}) {
  let candidates = planets;
  if (tags.length > 0) {
    const filtered = planets.filter((p) => p.tags.some((t) => tags.includes(t)));
    if (filtered.length > 0) candidates = filtered;
  }

  const planet = pickOne(candidates);

  const planetName = pickName(entityNames, 'planet', planet.tags);
  context.set('planetName', planetName);

  for (const [key, spec] of Object.entries(planet.provides)) {
    context.set(key, resolveProvideValue(entityNames, spec));
  }

  return planet;
}

module.exports = { generatePlanet };
