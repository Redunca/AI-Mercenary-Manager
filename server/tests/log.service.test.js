const { insertLogEntries, buildPhaseLogs, buildEventResultLogs } = require('../src/services/log.service')

describe('insertLogEntries', () => {
  test('inserts one row per entry, defaulting missionId to null', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) }
    const entries = [
      { tag: '[SYS]', message: 'Un message', missionId: 5 },
      { tag: '[IA]', message: 'Un autre message' },
    ]

    await insertLogEntries(client, 1, entries)

    expect(client.query).toHaveBeenCalledTimes(2)
    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO log_entries'),
      [1, '[SYS]', 'Un message', 5],
    )
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO log_entries'),
      [1, '[IA]', 'Un autre message', null],
    )
  })
})

describe('buildPhaseLogs', () => {
  const base = {
    failed: false,
    rewardForfeited: false,
    missionId: 1,
    missionName: 'Patrouille de couloir',
    missionDifficulty: 'ROUTINE',
    recruitName: 'Kade',
  }

  test('EN_ROUTE includes a SYS/IA/recruit mission log and a global departure log', () => {
    const { mission, global } = buildPhaseLogs({ ...base, phase: 'EN_ROUTE' })

    expect(mission).toHaveLength(3)
    expect(mission[0].tag).toBe('[SYS]')
    expect(mission[0].message).toContain('[Patrouille de couloir · ROUTINE]')
    expect(mission[1].tag).toBe('[IA]')
    expect(mission[2].tag).toBe('[KADE]')
    expect(mission[2].message).toMatch(/^".*"$/)
    expect(mission.every(e => e.missionId === 1)).toBe(true)

    expect(global).toHaveLength(1)
    expect(global[0].message).toContain('Mission "Patrouille de couloir" lancée')
    expect(global[0].message).toContain('Kade')
  })

  test('EVENEMENT includes a recruit line but no global log', () => {
    const { mission, global } = buildPhaseLogs({ ...base, phase: 'EVENEMENT' })

    expect(mission).toHaveLength(3)
    expect(mission[2].tag).toBe('[KADE]')
    expect(global).toHaveLength(0)
  })

  test('RETOUR has no recruit line and no global log when not failed', () => {
    const { mission, global } = buildPhaseLogs({ ...base, phase: 'RETOUR' })

    expect(mission).toHaveLength(2)
    expect(global).toHaveLength(0)
  })

  test('RETOUR when failed uses the failure phrase pool', () => {
    const { mission } = buildPhaseLogs({ ...base, phase: 'RETOUR', failed: true })

    expect(mission).toHaveLength(2)
    expect(mission[0].tag).toBe('[SYS]')
    expect(mission[0].message).toContain('[Patrouille de couloir · ROUTINE]')
  })

  test('TERMINEE reports SUCCÈS in the global log when not failed and reward kept', () => {
    const { global } = buildPhaseLogs({ ...base, phase: 'TERMINEE' })

    expect(global).toHaveLength(1)
    expect(global[0].message).toContain('[SUCCÈS]')
    expect(global[0].message).toContain('Patrouille de couloir')
    expect(global[0].message).toContain('Kade')
  })

  test('TERMINEE reports SANS RÉCOMPENSE when reward was forfeited without failure', () => {
    const { global } = buildPhaseLogs({ ...base, phase: 'TERMINEE', rewardForfeited: true })

    expect(global[0].message).toContain('[SANS RÉCOMPENSE]')
  })

  test('TERMINEE reports ÉCHEC when the mission failed', () => {
    const { global } = buildPhaseLogs({ ...base, phase: 'TERMINEE', failed: true })

    expect(global[0].message).toContain('[ÉCHEC]')
  })

  test('omits the difficulty segment when missionDifficulty is absent', () => {
    const { mission } = buildPhaseLogs({ ...base, phase: 'EN_ROUTE', missionDifficulty: undefined })

    expect(mission[0].message).toContain('[Patrouille de couloir] ')
    expect(mission[0].message).not.toContain('·')
  })
})

describe('buildEventResultLogs', () => {
  const baseArgs = {
    missionId: 1,
    missionName: 'Patrouille de couloir',
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
    expect(mission[0].message).toContain('MORT AU COMBAT')
    expect(mission[0].message).toContain('RECON [perception]')
    expect(mission[1].tag).toBe('[IA]')
    expect(mission[2].tag).toBe('[KADE]')
    expect(global).toEqual([
      { tag: '[SYS]', message: 'Kade est mort(e) au cours de la mission "Patrouille de couloir".' },
    ])
  })

  test('FORCED_DEPARTURE failure reports an emergency extraction', () => {
    const result = eventResult({ success: false, consequence: 'FORCED_DEPARTURE' })
    const { mission, global } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission).toHaveLength(3)
    expect(mission[0].message).toContain('ÉCHEC — Extraction forcée')
    expect(global).toEqual([])
  })

  test('NO_REWARD failure mentions the absence of reward', () => {
    const result = eventResult({ success: false, consequence: 'NO_REWARD' })
    const { mission } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission[0].message).toContain('ÉCHEC — aucune récompense')
  })

  test('HP_LOSS failure reports the amount of HP lost', () => {
    const result = eventResult({ success: false, consequence: 'HP_LOSS', hpLost: 4 })
    const { mission } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission[0].message).toContain('ÉCHEC — -4 PV')
  })

  test('success without a reward reports SUCCÈS with no reward suffix', () => {
    const result = eventResult({ success: true })
    const { mission } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission[0].message).toContain('SUCCÈS')
    expect(mission[0].message).not.toContain('[+')
  })

  test('success with a reward includes the reward amount and type', () => {
    const result = eventResult({ success: true, rewardEarned: { type: 'CREDITS', amount: 300 } })
    const { mission } = buildEventResultLogs({ ...baseArgs, eventResult: result })

    expect(mission[0].message).toContain('SUCCÈS [+300 CREDITS]')
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
