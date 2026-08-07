'use strict'

const { pickOne, rollWithVariance, randInt } = require('../utils/random')
const { render } = require('../utils/template')

/**
 * Builds a concrete event from an archetype (see data/events.json).
 * The archetype's `consumes` list must already be satisfied in the
 * context — the mission generator guarantees ordering (planet, then
 * mission-type placeholders, then events) so this always holds.
 */
function generateEvent(archetype, context, difficultyTable) {
  if (!context.hasAll(archetype.consumes)) {
    const missing = archetype.consumes.filter((k) => !context.has(k))
    throw new Error(
      `Event archetype "${archetype.id}" consumes unresolved tags: [${missing.join(', ')}]`,
    )
  }

  const dc = Math.max(1, rollWithVariance(difficultyTable.dcBase, difficultyTable.dcVariance))

  const descriptionTemplate = pickOne(archetype.descriptionTemplates)
  const description = render(descriptionTemplate, context.getAll())

  const rewardDescription = pickOne(archetype.rewardDescriptions)

  // REFLECTION always grants a flat 1 XP -- the Open Legend rule ("every XP
  // grants 3 attribute points") isn't difficulty-scaled the way a credit
  // bounty is, so it skips the normal rewardRange roll entirely.
  const reward =
    archetype.eventType === 'REFLECTION'
      ? { type: 'EXPERIENCE', amount: 1, description: rewardDescription }
      : {
          type: 'CREDITS',
          amount: randInt(difficultyTable.rewardRange.min, difficultyTable.rewardRange.max),
          description: rewardDescription,
        }

  const failureConsequences = archetype.failureConsequences || difficultyTable.failureConsequences
  const failureConsequence = pickOne(failureConsequences)

  return {
    id: archetype.id,
    beat: archetype.beat,
    type: archetype.eventType,
    attribute: archetype.attribute,
    dc,
    description,
    reward,
    failureConsequence,
  }
}

module.exports = { generateEvent }
