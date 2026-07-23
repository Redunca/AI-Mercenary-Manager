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

  const rewardAmount = randInt(difficultyTable.rewardRange.min, difficultyTable.rewardRange.max)
  const rewardDescription = pickOne(archetype.rewardDescriptions)

  const failureConsequences = archetype.failureConsequences || difficultyTable.failureConsequences
  const failureConsequence = pickOne(failureConsequences)

  return {
    id: archetype.id,
    beat: archetype.beat,
    type: archetype.eventType,
    attribute: archetype.attribute,
    dc,
    description,
    reward: {
      type: 'CREDITS',
      amount: rewardAmount,
      description: rewardDescription,
    },
    failureConsequence,
  }
}

module.exports = { generateEvent }
