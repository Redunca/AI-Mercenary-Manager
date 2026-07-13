const { insertLogEntries, buildPhaseLogs, buildEventResultLogs } = require('../src/services/log.service')

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
      [1, '[SYS]', 'A message', 5],
    )
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO log_entries'),
      [1, '[IA]', 'Another message', null],
    )
  })
})

describe('buildPhaseLogs', () => {
  const base = {
    failed: false,
    rewardForfeited: false,
    missionId: 1,
    missionName: 'Corridor Patrol',
    missionDifficulty: 'ROUTINE',
    recruitName: 'Kade',
  }

  test('EN_ROUTE includes a SYS/IA/recruit mission log and a global departure log', () => {
    const { mission, global } = buildPhaseLogs({ ...base, phase: 'EN_ROUTE' })

    expect(mission).toHaveLength(3)
    expect(mission[0].tag).toBe('[SYS]')
    expect(mission[0].message).toContain('[Corridor Patrol · ROUTINE]')
    expect(mission[1].tag).toBe('[IA]')
    expect(mission[2].tag).toBe('[KADE]')
    expect(mission[2].message).toMatch(/^".*"$/)
    expect(mission.every(e => e.missionId === 1)).toBe(true)

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
    const { mission } = buildPhaseLogs({ ...base, phase: 'EN_ROUTE', missionDifficulty: undefined })

    expect(mission[0].message).toContain('[Corridor Patrol] ')
    expect(mission[0].message).not.toContain('·')
  })
})

describe('buildEventResultLogs', () => {
  const baseArgs = {
    missionId: 1,
    missionName: 'Corridor Patrol',
    recruitName: 'Kade',
    recruitPerks: [],
    recruitFlaws: [],
    recruitPersonality: 'Explorer',
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
    const result = eventResult({ d20: 12, bonus: 5, diceNotation: '2d6', total: 17, dc: 15, success: true })
    const { mission } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission[0].message).toContain('1d20(12) + 2d6(5) = 17 vs DC 15')
  })

  test('omits the bonus segment when bonus is 0', () => {
    const result = eventResult({ d20: 12, bonus: 0, diceNotation: '—', total: 12, dc: 10, success: true })
    const { mission } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission[0].message).toContain('1d20(12) = 12 vs DC 10')
    expect(mission[0].message).not.toContain('+')
  })
})
