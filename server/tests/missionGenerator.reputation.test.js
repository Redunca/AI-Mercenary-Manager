const { generateMission } = require('../src/engine/missionGenerator')
const { loadData } = require('../src/dataLoader')
const { setSeed, resetSeed } = require('../src/utils/random')

// forFaction/againstFaction resolution (see missionGenerator.js's
// resolveAgainstFaction) -- exercised through the public generateMission()
// API across every mission type, rather than testing internals directly,
// mirroring this suite's existing convention (game.service.test.js's own
// comment on why it doesn't chase exact seeded content).
describe('generateMission for/against faction resolution', () => {
  const data = loadData()
  const orgNames = new Set([
    ...data.entityNames.categories.faction.map((e) => e.value),
    ...data.entityNames.categories.corporation.map((e) => e.value),
  ])
  const gangNames = new Set(data.entityNames.categories.gang.map((e) => e.value))

  beforeEach(() => setSeed(42))
  afterEach(() => resetSeed())

  test('ESCORT/RECON/EXTRACTION_OP (gang antagonists) are never "against" an org', () => {
    for (const type of ['ESCORT', 'RECON', 'EXTRACTION_OP']) {
      for (let i = 0; i < 10; i++) {
        const mission = generateMission(data, { missionType: type })
        expect(mission.againstFaction).toBeNull()
        expect(mission.forFaction).toBe(mission.tags.faction)
        expect(orgNames.has(mission.forFaction)).toBe(true)
      }
    }
  })

  test('DIPLOMACY is "against" the resolved faction antagonist', () => {
    for (let i = 0; i < 10; i++) {
      const mission = generateMission(data, { missionType: 'DIPLOMACY' })
      expect(mission.againstFaction).toBe(mission.tags.enemyGroupName)
      expect(orgNames.has(mission.againstFaction)).toBe(true)
      expect(gangNames.has(mission.againstFaction)).toBe(false)
      // The planet's own controlling org is excluded from the antagonist
      // pool by nameGenerator's usedNames tracking, so these can never
      // collide under current data -- see resolveAgainstFaction's comment.
      expect(mission.forFaction).toBe(mission.tags.faction)
      expect(mission.forFaction).not.toBe(mission.againstFaction)
    }
  })

  test('SABOTAGE is "against" the resolved corporation antagonist', () => {
    for (let i = 0; i < 10; i++) {
      const mission = generateMission(data, { missionType: 'SABOTAGE' })
      expect(mission.againstFaction).toBe(mission.tags.enemyGroupName)
      expect(orgNames.has(mission.againstFaction)).toBe(true)
    }
  })

  test('HEIST is "against" the target corporation, not its gang security', () => {
    for (let i = 0; i < 10; i++) {
      const mission = generateMission(data, { missionType: 'HEIST' })
      expect(mission.againstFaction).toBe(mission.tags.targetCorpName)
      expect(mission.againstFaction).not.toBe(mission.tags.securityGroupName)
      expect(gangNames.has(mission.tags.securityGroupName)).toBe(true)
    }
  })
})
