const { generateEvent } = require('../src/engine/eventGenerator')
const TagContext = require('../src/engine/context')

const STANDARD_DIFFICULTY = {
  dcBase: 15,
  dcVariance: 5,
  eventCount: 3,
  rewardRange: { min: 350, max: 500 },
  failureConsequences: ['NO_REWARD', 'HP_LOSS'],
}

const REFLECTION_ARCHETYPE = {
  id: 'LESSONS_LEARNED',
  eventType: 'REFLECTION',
  attribute: 'learning',
  beat: 'EXTRACTION',
  consumes: [],
  descriptionTemplates: ['The crew reflects on what this operation taught them.'],
  rewardDescriptions: ['Lessons Learned'],
}

const CREDITS_ARCHETYPE = {
  id: 'GATHER_INTEL',
  eventType: 'RECON',
  attribute: 'perception',
  beat: 'EXECUTION',
  consumes: [],
  descriptionTemplates: ['Gather evidence without being spotted.'],
  rewardDescriptions: ['Intelligence Bounty'],
}

describe('generateEvent', () => {
  test('REFLECTION archetypes always grant a flat 1 XP reward, not a difficulty-scaled credit amount', () => {
    const event = generateEvent(REFLECTION_ARCHETYPE, new TagContext(), STANDARD_DIFFICULTY)

    expect(event.type).toBe('REFLECTION')
    expect(event.reward).toEqual({ type: 'EXPERIENCE', amount: 1, description: 'Lessons Learned' })
  })

  test('every other archetype still grants a difficulty-scaled CREDITS reward', () => {
    const event = generateEvent(CREDITS_ARCHETYPE, new TagContext(), STANDARD_DIFFICULTY)

    expect(event.reward.type).toBe('CREDITS')
    expect(event.reward.amount).toBeGreaterThanOrEqual(STANDARD_DIFFICULTY.rewardRange.min)
    expect(event.reward.amount).toBeLessThanOrEqual(STANDARD_DIFFICULTY.rewardRange.max)
  })
})
