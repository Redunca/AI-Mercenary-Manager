const {
  insertLogEntries,
  buildPhaseLogs,
  buildEventResultLogs,
  pickPlanetTagQuote,
  buildBanterLog,
  buildCombatRoundLog,
  buildCombatEventLogs,
  getRecentMissionMessages,
} = require('../src/services/log.service')
const planetTags = require('../data/planet-tags.json')
const banterPairs = require('../data/banter/pairs.json')
const personalityPairs = require('../data/banter/personality-pairs.json')

describe('insertLogEntries', () => {
  test('inserts one row per entry, defaulting missionId to null', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) }
    const entries = [
      { tag: '[SYS]', message: 'A message', missionId: 5 },
      { tag: '[IA]', message: 'Another message' },
    ]

    await insertLogEntries(client, 1, entries)

    expect(client.query).toHaveBeenCalledTimes(2)
    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO log_entries'),
      [1, '[SYS]', 'A message', 5, null],
    )
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO log_entries'),
      [1, '[IA]', 'Another message', null, null],
    )
  })
})

describe('getRecentMissionMessages', () => {
  test('queries the most recent messages for this player/mission, most-recent first', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [{ message: 'B' }, { message: 'A' }] }),
    }

    const result = await getRecentMissionMessages(client, 1, 5)

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT message FROM log_entries'),
      [1, 5, 10],
    )
    expect(result).toEqual(['B', 'A'])
  })

  test('defaults to an empty array when the mission has no prior log entries', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) }

    const result = await getRecentMissionMessages(client, 1, 5)

    expect(result).toEqual([])
  })
})

describe('pickPlanetTagQuote', () => {
  test("single tag match returns a line from that tag's pool", () => {
    const result = pickPlanetTagQuote({ tags: ['isolated'], channel: 'sys' })
    expect(planetTags.isolated.sys).toContain(result)
  })

  test('multiple tag matches pick from the union of both pools', () => {
    const union = [...planetTags.arid.ia, ...planetTags.hot.ia]
    for (let i = 0; i < 20; i++) {
      const result = pickPlanetTagQuote({ tags: ['arid', 'hot'], channel: 'ia' })
      expect(union).toContain(result)
    }
  })

  test('returns null when none of the tags have flavor content', () => {
    expect(pickPlanetTagQuote({ tags: ['not-a-real-tag'], channel: 'sys' })).toBeNull()
  })

  test('returns null when tags is null, undefined, or empty (missing planet)', () => {
    expect(pickPlanetTagQuote({ tags: null, channel: 'sys' })).toBeNull()
    expect(pickPlanetTagQuote({ tags: undefined, channel: 'sys' })).toBeNull()
    expect(pickPlanetTagQuote({ tags: [], channel: 'sys' })).toBeNull()
  })

  test('an unrecognized tag mixed with a valid one does not crash and resolves via the valid one', () => {
    for (let i = 0; i < 10; i++) {
      const result = pickPlanetTagQuote({ tags: ['not-a-real-tag', 'isolated'], channel: 'ia' })
      expect(planetTags.isolated.ia).toContain(result)
    }
  })

  test('avoids a line that was just used, when an unused alternative exists', () => {
    const [justUsed, ...rest] = planetTags.isolated.sys
    for (let i = 0; i < 20; i++) {
      const result = pickPlanetTagQuote({ tags: ['isolated'], channel: 'sys', avoid: [justUsed] })
      expect(rest).toContain(result)
    }
  })

  test('falls back to reusing a line when every candidate is in avoid', () => {
    const result = pickPlanetTagQuote({
      tags: ['isolated'],
      channel: 'sys',
      avoid: planetTags.isolated.sys,
    })
    expect(planetTags.isolated.sys).toContain(result)
  })
})

describe('buildPhaseLogs', () => {
  const base = {
    failed: false,
    rewardForfeited: false,
    recruitName: 'Kade',
    context: {
      missionId: 1,
      missionName: 'Corridor Patrol',
      missionDifficulty: 'ROUTINE',
      planet: null,
      actingRecruit: null,
      crew: [],
    },
  }

  test('EN_ROUTE includes a SYS/IA/recruit mission log and a global departure log', () => {
    const { mission, global } = buildPhaseLogs({ ...base, phase: 'EN_ROUTE' })

    expect(mission).toHaveLength(3)
    expect(mission[0].tag).toBe('[SYS]')
    expect(mission[0].message).toContain('[Corridor Patrol · ROUTINE]')
    expect(mission[1].tag).toBe('[IA]')
    expect(mission[2].tag).toBe('[KADE]')
    expect(mission[2].message).toMatch(/^".*"$/)
    expect(mission.every((e) => e.missionId === 1)).toBe(true)

    expect(global).toHaveLength(1)
    expect(global[0].message).toContain('Mission "Corridor Patrol" launched')
    expect(global[0].message).toContain('Kade')
  })

  test('EVENT includes a recruit line but no global log', () => {
    const { mission, global } = buildPhaseLogs({ ...base, phase: 'EVENT' })

    expect(mission).toHaveLength(3)
    expect(mission[2].tag).toBe('[KADE]')
    expect(global).toHaveLength(0)
  })

  test('RETURN has no recruit line and no global log when not failed', () => {
    const { mission, global } = buildPhaseLogs({ ...base, phase: 'RETURN' })

    expect(mission).toHaveLength(2)
    expect(global).toHaveLength(0)
  })

  test('RETURN when failed uses the failure phrase pool', () => {
    const { mission } = buildPhaseLogs({ ...base, phase: 'RETURN', failed: true })

    expect(mission).toHaveLength(2)
    expect(mission[0].tag).toBe('[SYS]')
    expect(mission[0].message).toContain('[Corridor Patrol · ROUTINE]')
  })

  test('RETURN when failed uses the failure phrase pool even when the planet has matching tags (regression: planet flavor used to mask the failure headline)', () => {
    const failedReturnSys = [
      'Emergency extraction. Mission aborted.',
      'Hasty retreat. Objective not achieved.',
      'Mission scrubbed. Falling back to base.',
      'Withdrawal underway, objective unmet.',
    ]
    const failedReturnIa = [
      'Extraction protocol activated.',
      'Operational failure. Root cause analysis in progress.',
      'Casualty and damage report compiling.',
      'Command notified of the setback.',
    ]

    for (let i = 0; i < 20; i++) {
      const { mission } = buildPhaseLogs({
        ...base,
        phase: 'RETURN',
        failed: true,
        context: { ...base.context, planet: { id: 'p1', name: 'Kessarine', tags: ['isolated'] } },
      })

      const sysText = mission[0].message.replace('[Corridor Patrol · ROUTINE] ', '')
      expect(failedReturnSys).toContain(sysText)
      expect(failedReturnIa).toContain(mission[1].message)
    }
  })

  test('COMPLETED when failed uses the failure phrase pool even when the planet has matching tags', () => {
    const failedCompletedSys = [
      'Mission failed. Unit returned to base.',
      'Operation aborted.',
      'Contract unfulfilled. Standing down.',
      'Objective lost. Unit recalled.',
    ]
    const failedCompletedIa = [
      'Negative outcome. No objective achieved.',
      'Failure debrief scheduled.',
      'Post-mortem scheduled for this operation.',
      'Lessons logged for the next attempt.',
    ]

    const { mission } = buildPhaseLogs({
      ...base,
      phase: 'COMPLETED',
      failed: true,
      context: { ...base.context, planet: { id: 'p1', name: 'Kessarine', tags: ['isolated'] } },
    })

    const sysText = mission[0].message.replace('[Corridor Patrol · ROUTINE] ', '')
    expect(failedCompletedSys).toContain(sysText)
    expect(failedCompletedIa).toContain(mission[1].message)
  })

  test('COMPLETED mentions hospitalized crew when injuredCount is positive', () => {
    const { global } = buildPhaseLogs({ ...base, phase: 'COMPLETED', injuredCount: 2 })

    expect(global[0].message).toContain('2 crew hospitalized')
  })

  test('COMPLETED omits the hospitalized-crew suffix when injuredCount is zero', () => {
    const { global } = buildPhaseLogs({ ...base, phase: 'COMPLETED' })

    expect(global[0].message).not.toContain('hospitalized')
  })

  test('avoids repeating a recently used ambient/recruit line via the avoid list', () => {
    for (let i = 0; i < 20; i++) {
      const { mission } = buildPhaseLogs({
        ...base,
        phase: 'EN_ROUTE',
        avoid: [
          'Unit moving toward the operation zone.',
          'No anomalies detected.',
          '"We went the wrong way."',
        ],
      })

      expect(mission[0].message).not.toContain('Unit moving toward the operation zone.')
      expect(mission[1].message).not.toBe('No anomalies detected.')
      expect(mission[2].message).not.toBe('"We went the wrong way."')
    }
  })

  test('COMPLETED reports SUCCESS in the global log when not failed and reward kept', () => {
    const { global } = buildPhaseLogs({ ...base, phase: 'COMPLETED' })

    expect(global).toHaveLength(1)
    expect(global[0].message).toContain('[SUCCESS]')
    expect(global[0].message).toContain('Corridor Patrol')
    expect(global[0].message).toContain('Kade')
  })

  test('COMPLETED reports NO REWARD when reward was forfeited without failure', () => {
    const { global } = buildPhaseLogs({ ...base, phase: 'COMPLETED', rewardForfeited: true })

    expect(global[0].message).toContain('[NO REWARD]')
  })

  test('COMPLETED reports FAILURE when the mission failed', () => {
    const { global } = buildPhaseLogs({ ...base, phase: 'COMPLETED', failed: true })

    expect(global[0].message).toContain('[FAILURE]')
  })

  test('omits the difficulty segment when missionDifficulty is absent', () => {
    const { mission } = buildPhaseLogs({
      ...base,
      phase: 'EN_ROUTE',
      context: { ...base.context, missionDifficulty: undefined },
    })

    expect(mission[0].message).toContain('[Corridor Patrol] ')
    expect(mission[0].message).not.toContain('·')
  })

  test('a populated planet/crew on the context does not change current message text', () => {
    const { mission, global } = buildPhaseLogs({
      ...base,
      phase: 'EN_ROUTE',
      context: {
        ...base.context,
        planet: { id: 'p1', name: 'Kessarine', tags: ['arid', 'frontier'] },
        crew: [
          { id: 1, name: 'Kade', perks: [], flaws: [], personality: 'Explorer' },
          { id: 2, name: 'Rosa', perks: [], flaws: [], personality: 'Stoic' },
        ],
      },
    })

    expect(mission[0].message).toContain('[Corridor Patrol · ROUTINE]')
    expect(mission[2].tag).toBe('[KADE]')
    expect(global[0].message).toContain('Kade')
  })

  test('prefers a planet-tag-matched SYS/IA line over the generic pool when the planet has matching tags', () => {
    const { mission } = buildPhaseLogs({
      ...base,
      phase: 'EN_ROUTE',
      context: { ...base.context, planet: { id: 'p1', name: 'Kessarine', tags: ['isolated'] } },
    })

    const sysText = mission[0].message.replace('[Corridor Patrol · ROUTINE] ', '')
    expect(planetTags.isolated.sys).toContain(sysText)
    expect(planetTags.isolated.ia).toContain(mission[1].message)
  })

  test("falls back to the generic pool when none of the planet's tags have flavor content", () => {
    const { mission } = buildPhaseLogs({
      ...base,
      phase: 'EN_ROUTE',
      context: { ...base.context, planet: { id: 'p2', name: 'Nowhere', tags: ['not-a-real-tag'] } },
    })

    const sysText = mission[0].message.replace('[Corridor Patrol · ROUTINE] ', '')
    expect([
      'Unit moving toward the operation zone.',
      'Departure confirmed. No incidents on launch.',
      'All systems nominal for departure.',
      'Course locked in.',
    ]).toContain(sysText)
  })
})

describe('buildEventResultLogs', () => {
  const baseArgs = {
    context: {
      missionId: 1,
      missionName: 'Corridor Patrol',
      missionDifficulty: 'ROUTINE',
      planet: null,
      actingRecruit: {
        id: 1,
        name: 'Kade',
        perks: [],
        flaws: [],
        personality: 'Explorer',
      },
      crew: [],
    },
  }

  function eventResult(overrides) {
    return {
      eventIndex: 0,
      type: 'RECON',
      attribute: 'perception',
      recruitId: 1,
      recruitName: 'Kade',
      d20: 15,
      bonus: 3,
      diceNotation: '1d4',
      total: 18,
      dc: 10,
      success: true,
      ...overrides,
    }
  }

  test('death: three mission entries and a global casualty log, no matter the event type', () => {
    const eventResultDied = eventResult({ success: false, recruitDied: true })
    const { mission, global } = buildEventResultLogs({ ...baseArgs, eventResult: eventResultDied })

    expect(mission).toHaveLength(3)
    expect(mission[0].message).toContain('KILLED IN ACTION')
    expect(mission[0].message).toContain('RECON [perception]')
    expect(mission[1].tag).toBe('[IA]')
    expect(mission[2].tag).toBe('[KADE]')
    expect(global).toEqual([
      { tag: '[SYS]', message: 'Kade died during mission "Corridor Patrol".' },
    ])
  })

  test('FORCED_DEPARTURE failure reports an emergency extraction', () => {
    const result = eventResult({ success: false, consequence: 'FORCED_DEPARTURE' })
    const { mission, global } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission).toHaveLength(3)
    expect(mission[0].message).toContain('FAILURE — Forced extraction')
    expect(global).toEqual([])
  })

  test('NO_REWARD failure mentions the absence of reward', () => {
    const result = eventResult({ success: false, consequence: 'NO_REWARD' })
    const { mission } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission[0].message).toContain('FAILURE — no reward')
  })

  test('HP_LOSS failure reports the amount of HP lost', () => {
    const result = eventResult({ success: false, consequence: 'HP_LOSS', hpLost: 4 })
    const { mission } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission[0].message).toContain('FAILURE — -4 HP')
  })

  test('success without a reward reports SUCCESS with no reward suffix', () => {
    const result = eventResult({ success: true })
    const { mission } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission[0].message).toContain('SUCCESS')
    expect(mission[0].message).not.toContain('[+')
  })

  test('success with a reward includes the reward amount and type', () => {
    const result = eventResult({ success: true, rewardEarned: { type: 'CREDITS', amount: 300 } })
    const { mission } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission[0].message).toContain('SUCCESS [+300 CREDITS]')
  })

  test('formats the roll as 1d20(d20) + notation(bonus) = total vs DC dc', () => {
    const result = eventResult({
      d20: 12,
      bonus: 5,
      diceNotation: '2d6',
      total: 17,
      dc: 15,
      success: true,
    })
    const { mission } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission[0].message).toContain('1d20(12) + 2d6(5) = 17 vs DC 15')
  })

  test('omits the bonus segment when bonus is 0', () => {
    const result = eventResult({
      d20: 12,
      bonus: 0,
      diceNotation: '—',
      total: 12,
      dc: 10,
      success: true,
    })
    const { mission } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission[0].message).toContain('1d20(12) = 12 vs DC 10')
    expect(mission[0].message).not.toContain('+')
  })

  test('a populated crew on the context does not change the acting recruit tag/quote', () => {
    const result = eventResult({ success: true })
    const { mission } = buildEventResultLogs({
      ...baseArgs,
      eventResult: result,
      context: {
        ...baseArgs.context,
        crew: [
          baseArgs.context.actingRecruit,
          { id: 2, name: 'Rosa', perks: [], flaws: [], personality: 'Stoic' },
        ],
      },
    })

    expect(mission[2].tag).toBe('[KADE]')
  })

  test('prefers a planet-tag-matched [IA] line but leaves the mechanical [SYS] line untouched', () => {
    const result = eventResult({ success: true })
    const { mission } = buildEventResultLogs({
      ...baseArgs,
      eventResult: result,
      context: { ...baseArgs.context, planet: { id: 'p1', name: 'Kessarine', tags: ['isolated'] } },
    })

    expect(planetTags.isolated.ia).toContain(mission[1].message)
    expect(mission[0].message).toContain('1d20(15) + 1d4(3) = 18 vs DC 10')
    expect(mission[0].message).toContain('SUCCESS')
  })

  test('falls back to the generic [IA] pool when the planet has no matching tag content', () => {
    const result = eventResult({ success: true })
    const { mission } = buildEventResultLogs({
      ...baseArgs,
      eventResult: result,
      context: {
        ...baseArgs.context,
        planet: { id: 'p2', name: 'Nowhere', tags: ['not-a-real-tag'] },
      },
    })

    expect([
      'Intermediate objective validated.',
      'Result matches projections.',
      'Nominal execution.',
    ]).toContain(mission[1].message)
  })
})

describe('buildCombatRoundLog', () => {
  test('produces a single [SYS] line summarizing every attack in the round', () => {
    const round = {
      round: 2,
      entries: [
        {
          actor: 'crew',
          actorId: 1,
          actorName: 'Vex',
          attribute: 'agility',
          hit: true,
          damage: 7,
          enemyHpAfter: 33,
        },
        {
          actor: 'enemy',
          targetId: 2,
          targetName: 'Sable',
          hit: true,
          damage: 4,
          targetHpAfter: 12,
        },
      ],
    }

    const log = buildCombatRoundLog({ round, missionId: 5 })

    expect(log.tag).toBe('[SYS]')
    expect(log.missionId).toBe(5)
    expect(log.message).toContain('Round 2')
    expect(log.message).toContain('Vex')
    expect(log.message).toContain('7')
    expect(log.message).toContain('Sable')
  })

  test('reports misses distinctly from hits, for both sides', () => {
    const round = {
      round: 1,
      entries: [
        { actor: 'crew', actorId: 1, actorName: 'Vex', attribute: 'might', hit: false },
        { actor: 'enemy', targetId: 2, targetName: 'Sable', hit: false },
      ],
    }

    const log = buildCombatRoundLog({ round, missionId: 5 })

    expect(log.message).toContain('misses')
    expect(log.message).toContain('miss')
  })

  test('flags a downed or killed target distinctly from a normal hit', () => {
    const downedRound = {
      round: 3,
      entries: [
        { actor: 'enemy', targetId: 2, targetName: 'Sable', hit: true, damage: 5, downed: true },
      ],
    }
    const deadRound = {
      round: 4,
      entries: [
        { actor: 'enemy', targetId: 2, targetName: 'Sable', hit: true, damage: 5, died: true },
      ],
    }
    const revivedRound = {
      round: 5,
      entries: [
        { actor: 'enemy', targetId: 2, targetName: 'Sable', hit: true, damage: 5, revived: true },
      ],
    }

    expect(buildCombatRoundLog({ round: downedRound, missionId: 1 }).message).toContain('down')
    expect(buildCombatRoundLog({ round: deadRound, missionId: 1 }).message).toContain(
      'KILLED IN ACTION',
    )
    expect(buildCombatRoundLog({ round: revivedRound, missionId: 1 }).message).toContain('revived')
  })
})

describe('buildCombatEventLogs', () => {
  const context = {
    missionId: 1,
    missionName: 'Corridor Patrol',
    crew: [{ id: 1, name: 'Vex', perks: [], flaws: [], personality: 'Explorer' }],
  }

  test('victory: [SYS] + [IA] + a survivor line, reward mentioned, no global casualty log', () => {
    const combatResult = {
      enemyDefeated: true,
      rounds: [{ round: 1, entries: [] }],
      crewResults: [{ id: 1, status: 'active' }],
    }
    const event = { type: 'AMBUSH', reward: { type: 'CREDITS', amount: 250 } }

    const { mission, global } = buildCombatEventLogs({ context, event, combatResult })

    expect(mission[0].tag).toBe('[SYS]')
    expect(mission[0].message).toContain('VICTORY')
    expect(mission[0].message).toContain('250')
    expect(mission[1].tag).toBe('[IA]')
    expect(mission[2].tag).toBe('[VEX]')
    expect(global).toEqual([])
  })

  test('defeat with a casualty: adds a last-words line and a global death log', () => {
    const combatResult = {
      enemyDefeated: false,
      rounds: [
        { round: 1, entries: [] },
        { round: 2, entries: [] },
      ],
      crewResults: [{ id: 1, status: 'dead' }],
    }
    const event = { type: 'AMBUSH' }

    const { mission, global } = buildCombatEventLogs({ context, event, combatResult })

    expect(mission[0].message).toContain('DEFEAT')
    expect(mission.some((m) => m.tag === '[VEX]')).toBe(true)
    expect(global).toEqual([
      { tag: '[SYS]', message: 'Vex died during mission "Corridor Patrol".' },
    ])
  })
})

describe('perk/flaw-specific event quote files', () => {
  const fs = require('fs')
  const path = require('path')

  const DATA_DIR = path.join(__dirname, '../data')
  const PERSONALITIES = ['Analyst', 'Diplomat', 'Sentinel', 'Explorer']

  // Mirrors log.service.js's internal slugify() exactly — kept in sync manually
  // since that function isn't exported (it's an implementation detail).
  function slugify(name) {
    return name.toLowerCase().replace(/\s+/g, '-')
  }

  const { perks, flaws } = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'perks-flaws.json'), 'utf8'),
  )
  const bySlug = new Map()
  perks.forEach((p) => bySlug.set(slugify(p.name), { name: p.name, kind: 'perk' }))
  flaws.forEach((f) => bySlug.set(slugify(f.name), { name: f.name, kind: 'flaw' }))

  const eventTypeDirs = fs
    .readdirSync(DATA_DIR)
    .filter((f) => fs.statSync(path.join(DATA_DIR, f)).isDirectory())
    // banter/ holds relationship-dialogue files (pairs.json, personality-pairs.json) keyed by
    // trait *pairs* or personality combos, not a single perk/flaw name — out of scope here.
    // opera-graphs/ holds Opera Generating Logic templates (tutorial.json, ...) keyed by
    // template id, not a perk/flaw name either — also out of scope here.
    .filter((f) => f !== 'banter' && f !== 'opera-graphs')

  // Discover every perk/flaw-specific file across every event-type folder, and pair each
  // with the perk/flaw it's supposed to represent (via the reverse of the slug lookup above).
  const cases = []
  for (const dir of eventTypeDirs) {
    const files = fs
      .readdirSync(path.join(DATA_DIR, dir))
      .filter((f) => f.endsWith('.json') && f !== 'perk-and-flawless.json')
      .map((f) => f.replace('.json', ''))

    for (const slug of files) {
      cases.push({ dir, slug, entry: bySlug.get(slug) })
    }
  }

  test('at least one perk/flaw-specific file exists to exercise this suite', () => {
    // Guards against this whole describe block silently testing nothing if data/ moves.
    expect(cases.length).toBeGreaterThan(0)
  })

  test.each(cases.map((c) => [`${c.dir}/${c.slug}.json`, c]))(
    '%s filename matches a real perk/flaw name (no silent typo)',
    (_label, { entry, dir, slug }) => {
      expect(entry).toBeDefined()
      if (entry) expect(slugify(entry.name)).toBe(slug)
    },
  )

  describe.each(cases.map((c) => [`${c.dir}/${c.slug}.json`, c]))(
    '%s',
    (_label, { dir, slug, entry }) => {
      if (!entry) return // already reported as a failure above; avoid a second confusing failure here

      const eventType = dir.toUpperCase()

      for (const outcome of ['success', 'failure']) {
        for (const personality of PERSONALITIES) {
          test(`resolves a ${outcome} quote for ${personality}`, () => {
            const fileContents = JSON.parse(
              fs.readFileSync(path.join(DATA_DIR, dir, `${slug}.json`), 'utf8'),
            )
            const expectedPool = fileContents[eventType]?.[outcome]?.[slug]?.[personality]

            expect(Array.isArray(expectedPool)).toBe(true)
            expect(expectedPool.length).toBeGreaterThan(0)

            const actingRecruit = {
              id: 1,
              name: 'Kade',
              personality,
              perks: entry.kind === 'perk' ? [{ name: entry.name }] : [],
              flaws: entry.kind === 'flaw' ? [{ name: entry.name }] : [],
            }
            const result =
              outcome === 'success'
                ? {
                    eventIndex: 0,
                    type: eventType,
                    d20: 15,
                    bonus: 3,
                    diceNotation: '1d4',
                    total: 18,
                    dc: 10,
                    success: true,
                  }
                : {
                    eventIndex: 0,
                    type: eventType,
                    d20: 5,
                    bonus: 0,
                    diceNotation: '—',
                    total: 5,
                    dc: 10,
                    success: false,
                    consequence: 'HP_LOSS',
                    hpLost: 1,
                  }

            const { mission } = buildEventResultLogs({
              context: {
                missionId: 1,
                missionName: 'Test',
                missionDifficulty: 'ROUTINE',
                planet: null,
                actingRecruit,
                crew: [],
              },
              eventResult: result,
            })

            const quote = mission[2].message.replace(/^"|"$/g, '')
            expect(expectedPool).toContain(quote)
          })
        }
      }
    },
  )
})

describe('buildBanterLog', () => {
  function fakeClient(priorTag) {
    return {
      query: async (sql) =>
        sql.includes('log_entries') ? { rows: priorTag ? [{ tag: priorTag }] : [] } : { rows: [] },
    }
  }

  function recruit(id, name, personality, { perks = [], flaws = [] } = {}) {
    return { id, name, personality, perks, flaws }
  }

  test('does not fire when crew has fewer than 2 members', async () => {
    const crew = [recruit(1, 'Kade', 'Explorer')]
    expect(await buildBanterLog(fakeClient(null), 1, { missionId: 1, crew })).toBeNull()
  })

  test('does not fire when crew is missing or empty', async () => {
    expect(await buildBanterLog(fakeClient(null), 1, { missionId: 1 })).toBeNull()
    expect(await buildBanterLog(fakeClient(null), 1, { missionId: 1, crew: [] })).toBeNull()
  })

  test('selects a matching trait-pair template over the personality fallback', async () => {
    const crew = [
      recruit(1, 'Kade', 'Explorer', { flaws: [{ name: 'Bloodlust' }] }),
      recruit(2, 'Vex', 'Sentinel', { flaws: [{ name: 'Pacifist' }] }),
    ]
    const result = await buildBanterLog(fakeClient(null), 1, { missionId: 1, crew })

    expect(result).not.toBeNull()
    // The Bloodlust holder is speaker A per pairs.json's "speaker": "A" for this trigger.
    expect(result.mission[0].tag).toBe('[KADE→VEX]')
    expect(result.mission[1].tag).toBe('[VEX→KADE]')
    const entry = banterPairs.find((p) => p.trigger === 'flaw:bloodlust+flaw:pacifist')
    expect(entry.lines.map((l) => l.replace(/\{A\}/g, 'Kade').replace(/\{B\}/g, 'Vex'))).toContain(
      result.mission[0].message,
    )
    expect(entry.reply.map((l) => l.replace(/\{A\}/g, 'Kade').replace(/\{B\}/g, 'Vex'))).toContain(
      result.mission[1].message,
    )
  })

  test('falls back to a personality-pair template when no trait pair matches', async () => {
    const crew = [recruit(1, 'Kade', 'Explorer'), recruit(2, 'Vex', 'Sentinel')]
    const result = await buildBanterLog(fakeClient(null), 1, { missionId: 1, crew })

    expect(result).not.toBeNull()
    const entry = personalityPairs['Explorer+Sentinel']
    expect(entry.lines.map((l) => l.replace(/\{A\}/g, 'Kade').replace(/\{B\}/g, 'Vex'))).toContain(
      result.mission[0].message,
    )
  })

  test('does not fire when neither a trait pair nor a personality pair matches', async () => {
    const crew = [recruit(1, 'Kade', 'NotARealPersonality'), recruit(2, 'Vex', 'AlsoNotReal')]
    expect(await buildBanterLog(fakeClient(null), 1, { missionId: 1, crew })).toBeNull()
  })

  test('cooldown: skips banter entirely when the only crew pair repeats the last banter', async () => {
    const crew = [
      recruit(1, 'Kade', 'Explorer', { flaws: [{ name: 'Bloodlust' }] }),
      recruit(2, 'Vex', 'Sentinel', { flaws: [{ name: 'Pacifist' }] }),
    ]
    const result = await buildBanterLog(fakeClient('[KADE→VEX]'), 1, { missionId: 1, crew })
    expect(result).toBeNull()
  })

  test('cooldown: picks a different pair when a third crew member is available', async () => {
    const crew = [
      recruit(1, 'Kade', 'Explorer', { flaws: [{ name: 'Bloodlust' }] }),
      recruit(2, 'Vex', 'Sentinel', { flaws: [{ name: 'Pacifist' }] }),
      recruit(3, 'Rosa', 'Diplomat'),
    ]
    for (let i = 0; i < 10; i++) {
      const result = await buildBanterLog(fakeClient('[KADE→VEX]'), 1, { missionId: 1, crew })
      expect(result).not.toBeNull()
      const names = [result.mission[0].tag, result.mission[1].tag].join('')
      expect(names).not.toBe('[KADE→VEX][VEX→KADE]')
    }
  })

  test('cooldown check is case-insensitive between the stored uppercase tag and actual-case crew names', async () => {
    // Regression test: tags store NAME.toUpperCase(), but crew.name is stored in its original case.
    const crew = [
      recruit(1, 'Kade', 'Explorer', { flaws: [{ name: 'Bloodlust' }] }),
      recruit(2, 'Vex', 'Sentinel', { flaws: [{ name: 'Pacifist' }] }),
    ]
    const result = await buildBanterLog(fakeClient('[VEX→KADE]'), 1, { missionId: 1, crew })
    expect(result).toBeNull()
  })

  test('prefers a planet-tag-flavored line/reply when the chosen entry defines one', async () => {
    const crew = [
      recruit(1, 'Kade', 'Explorer', { flaws: [{ name: 'Bloodlust' }] }),
      recruit(2, 'Vex', 'Sentinel', { flaws: [{ name: 'Pacifist' }] }),
    ]
    const entry = banterPairs.find((p) => p.trigger === 'flaw:bloodlust+flaw:pacifist')
    const originalTagLines = entry.tagLines
    entry.tagLines = {
      'hostile-fauna': {
        lines: ['{A} keeps swinging at the wildlife. {B} is done asking nicely.'],
        reply: ['Not everything out here is a threat, {A}.'],
      },
    }
    try {
      const result = await buildBanterLog(fakeClient(null), 1, {
        missionId: 1,
        crew,
        planet: { tags: ['hostile-fauna'] },
      })
      expect(result).not.toBeNull()
      expect(result.mission[0].message).toBe(
        'Kade keeps swinging at the wildlife. Vex is done asking nicely.',
      )
      expect(result.mission[1].message).toBe('Not everything out here is a threat, Kade.')
    } finally {
      if (originalTagLines === undefined) delete entry.tagLines
      else entry.tagLines = originalTagLines
    }
  })

  test('falls back to generic lines when planet tags do not match any tagLines entry', async () => {
    const crew = [
      recruit(1, 'Kade', 'Explorer', { flaws: [{ name: 'Bloodlust' }] }),
      recruit(2, 'Vex', 'Sentinel', { flaws: [{ name: 'Pacifist' }] }),
    ]
    const entry = banterPairs.find((p) => p.trigger === 'flaw:bloodlust+flaw:pacifist')
    const result = await buildBanterLog(fakeClient(null), 1, {
      missionId: 1,
      crew,
      planet: { tags: ['some-unrelated-tag'] },
    })
    expect(result).not.toBeNull()
    expect(entry.lines.map((l) => l.replace(/\{A\}/g, 'Kade').replace(/\{B\}/g, 'Vex'))).toContain(
      result.mission[0].message,
    )
  })

  test('does not crash when planet or planet.tags is missing', async () => {
    const crew = [
      recruit(1, 'Kade', 'Explorer', { flaws: [{ name: 'Bloodlust' }] }),
      recruit(2, 'Vex', 'Sentinel', { flaws: [{ name: 'Pacifist' }] }),
    ]
    await expect(
      buildBanterLog(fakeClient(null), 1, { missionId: 1, crew }),
    ).resolves.not.toBeNull()
    await expect(
      buildBanterLog(fakeClient(null), 1, { missionId: 1, crew, planet: {} }),
    ).resolves.not.toBeNull()
    await expect(
      buildBanterLog(fakeClient(null), 1, { missionId: 1, crew, planet: { tags: [] } }),
    ).resolves.not.toBeNull()
  })

  test('duplicate crew names do not crash and still resolve via distinct ids', async () => {
    // CANDIDATE_NAMES has no uniqueness guarantee (server/src/domain/recruit.js), so two crew
    // members can share a display name. The tag can render ambiguously ([KADE→KADE]) but the
    // underlying match must still be driven by id/traits, not by name, and must not crash.
    const crew = [
      recruit(1, 'Kade', 'Explorer', { flaws: [{ name: 'Bloodlust' }] }),
      recruit(2, 'Kade', 'Sentinel', { flaws: [{ name: 'Pacifist' }] }),
    ]
    const result = await buildBanterLog(fakeClient(null), 1, { missionId: 1, crew })

    expect(result).not.toBeNull()
    expect(result.mission[0].tag).toBe('[KADE→KADE]')
    expect(result.mission[1].tag).toBe('[KADE→KADE]')
    expect(typeof result.mission[0].message).toBe('string')
    expect(result.mission[0].message.length).toBeGreaterThan(0)
  })
})

describe('banter content coverage', () => {
  const fs = require('fs')
  const path = require('path')

  function slugify(name) {
    return name.toLowerCase().replace(/\s+/g, '-')
  }

  const { perks, flaws } = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/perks-flaws.json'), 'utf8'),
  )
  const validSlugs = new Set([
    ...perks.map((p) => slugify(p.name)),
    ...flaws.map((f) => slugify(f.name)),
  ])

  test.each(banterPairs.map((entry) => [entry.trigger, entry]))(
    'trigger "%s" resolves to two real perk/flaw slugs',
    (_label, entry) => {
      const parts = entry.trigger.split('+')
      expect(parts).toHaveLength(2)
      for (const part of parts) {
        const [kind, slug] = part.split(':')
        expect(['perk', 'flaw']).toContain(kind)
        expect(validSlugs.has(slug)).toBe(true)
      }
    },
  )

  test('every personality-pairs.json key uses two real personalities', () => {
    const REAL_PERSONALITIES = ['Analyst', 'Diplomat', 'Sentinel', 'Explorer']
    for (const key of Object.keys(personalityPairs)) {
      const [p1, p2] = key.split('+')
      expect(REAL_PERSONALITIES).toContain(p1)
      expect(REAL_PERSONALITIES).toContain(p2)
    }
  })
})
