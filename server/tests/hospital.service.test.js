const HospitalService = require('../src/services/hospital.service')
const OperaService = require('../src/services/opera.service')

jest.mock('../src/services/opera.service')

describe('Hospital Service', () => {
  let mockClient

  beforeEach(() => {
    mockClient = { query: jest.fn() }
    jest.clearAllMocks()
  })

  describe('admitRecruit', () => {
    test('admits an injured recruit, pulling them off their ship crew and recording the opera action', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'available', hp: 10, max_hp: 20, original_max_hp: 20 }] }) // recruit lookup
        .mockResolvedValueOnce({ rows: [{ hospital_slots: 2 }] }) // capacity
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // occupied count
        .mockResolvedValueOnce({ rows: [{ id: 5, crew: [] }] }) // ship crew removal
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'hospitalized', hp: 10, max_hp: 20 }],
        }) // status update

      const result = await HospitalService.admitRecruit(mockClient, 1, 1)

      expect(result).toEqual({
        success: true,
        recruit: { id: 1, status: 'hospitalized', hp: 10, max_hp: 20 },
      })
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('array_remove(crew, $2)'),
        [1, 1],
      )
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'hospitalized', last_hospital_heal_at = NOW(), last_permanent_heal_at = NOW()"),
        [1, 1],
      )
      expect(OperaService.recordOperaAction).toHaveBeenCalledWith(
        mockClient,
        1,
        'assign_recruit_to_hospital',
        { recruitId: 1 },
      )
    })

    test('admits a recruit at full current HP who still carries a permanent injury', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'available', hp: 20, max_hp: 20, original_max_hp: 22 }],
        })
        .mockResolvedValueOnce({ rows: [{ hospital_slots: 2 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: 5, crew: [] }] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'hospitalized', hp: 20, max_hp: 20 }],
        })

      const result = await HospitalService.admitRecruit(mockClient, 1, 1)

      expect(result).toEqual({
        success: true,
        recruit: { id: 1, status: 'hospitalized', hp: 20, max_hp: 20 },
      })
    })

    test('refuses a recruit that does not exist', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] })

      const result = await HospitalService.admitRecruit(mockClient, 1, 999)

      expect(result).toEqual({ error: 'Recruit not found' })
      expect(mockClient.query).toHaveBeenCalledTimes(1)
    })

    test('refuses a dead recruit', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'dead', hp: 0, max_hp: 20, original_max_hp: 20 }],
      })

      const result = await HospitalService.admitRecruit(mockClient, 1, 1)

      expect(result).toEqual({ error: 'Recruit is dead' })
    })

    test('refuses a recruit already hospitalized', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'hospitalized', hp: 10, max_hp: 20, original_max_hp: 20 }],
      })

      const result = await HospitalService.admitRecruit(mockClient, 1, 1)

      expect(result).toEqual({ error: 'Recruit is already hospitalized' })
    })

    test('refuses a recruit already at full HP with no permanent injury', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'available', hp: 20, max_hp: 20, original_max_hp: 20 }],
      })

      const result = await HospitalService.admitRecruit(mockClient, 1, 1)

      expect(result).toEqual({ error: 'Recruit is already at full HP' })
    })

    test('refuses admission once the hospital is at capacity', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'available', hp: 10, max_hp: 20, original_max_hp: 20 }],
        })
        .mockResolvedValueOnce({ rows: [{ hospital_slots: 1 }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })

      const result = await HospitalService.admitRecruit(mockClient, 1, 1)

      expect(result).toEqual({ error: 'Hospital is full' })
      expect(mockClient.query).toHaveBeenCalledTimes(3)
    })
  })

  describe('dischargeRecruit', () => {
    test('discharges a hospitalized recruit, leaving their current HP as-is', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 1, status: 'available', hp: 15, max_hp: 20 }],
      })

      const result = await HospitalService.dischargeRecruit(mockClient, 1, 1)

      expect(result).toEqual({
        success: true,
        recruit: { id: 1, status: 'available', hp: 15, max_hp: 20 },
      })
    })

    test('errors when the recruit is not hospitalized', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] })

      const result = await HospitalService.dischargeRecruit(mockClient, 1, 1)

      expect(result).toEqual({ error: 'Recruit is not hospitalized' })
    })
  })

  describe('regenerateHospitalizedRecruits', () => {
    test('heals 1 HP per elapsed interval and keeps the recruit hospitalized if not yet full', async () => {
      const lastHealAt = new Date(Date.now() - 3.5 * 60000) // 3.5 minutes ago
      const lastPermanentHealAt = new Date()
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ hospital_heal_interval_ms: 60000, permanent_heal_interval_ms: 300000 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              hp: 10,
              max_hp: 20,
              original_max_hp: 20,
              last_hospital_heal_at: lastHealAt,
              last_permanent_heal_at: lastPermanentHealAt,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // the UPDATE

      await HospitalService.regenerateHospitalizedRecruits(mockClient, 1)

      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining(
          'UPDATE recruits SET hp = $1, max_hp = $2, last_hospital_heal_at = $3, last_permanent_heal_at = $4, status = $5',
        ),
        [13, 20, expect.any(Date), lastPermanentHealAt, 'hospitalized', 1, 1], // floor(3.5) = 3 ticks: 10 + 3
      )
    })

    test('caps healing at max HP and auto-discharges the recruit once fully healed', async () => {
      const lastHealAt = new Date(Date.now() - 10 * 60000)
      const lastPermanentHealAt = new Date()
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ hospital_heal_interval_ms: 60000, permanent_heal_interval_ms: 300000 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              hp: 19,
              max_hp: 20,
              original_max_hp: 20,
              last_hospital_heal_at: lastHealAt,
              last_permanent_heal_at: lastPermanentHealAt,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })

      await HospitalService.regenerateHospitalizedRecruits(mockClient, 1)

      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining(
          'UPDATE recruits SET hp = $1, max_hp = $2, last_hospital_heal_at = $3, last_permanent_heal_at = $4, status = $5',
        ),
        [20, 20, expect.any(Date), lastPermanentHealAt, 'available', 1, 1],
      )
    })

    test('heals a permanent injury while the recruit is already at full current HP, staying hospitalized', async () => {
      const now = new Date()
      const lastHospitalHealAt = now // untouched, hp already full relative to current max_hp
      const lastPermanentHealAt = new Date(now.getTime() - 12 * 60000) // 12 minutes ago
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ hospital_heal_interval_ms: 60000, permanent_heal_interval_ms: 300000 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              hp: 20,
              max_hp: 20,
              original_max_hp: 22,
              last_hospital_heal_at: lastHospitalHealAt,
              last_permanent_heal_at: lastPermanentHealAt,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })

      await HospitalService.regenerateHospitalizedRecruits(mockClient, 1, now)

      // floor(12 / 5) = 2 permanent-heal ticks: max_hp 20 -> 22. HP stream
      // never runs (hp already equals the pre-tick max_hp), so it stays
      // 'hospitalized' even though the injury itself is now fully closed --
      // hp catches up to the new max_hp on the next sync.
      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining(
          'UPDATE recruits SET hp = $1, max_hp = $2, last_hospital_heal_at = $3, last_permanent_heal_at = $4, status = $5',
        ),
        [20, 22, lastHospitalHealAt, new Date(lastPermanentHealAt.getTime() + 2 * 300000), 'hospitalized', 1, 1],
      )
    })

    test('advances the HP and permanent-injury streams independently in the same call', async () => {
      const now = new Date()
      const lastHospitalHealAt = new Date(now.getTime() - 3.5 * 60000) // 3.5 minutes ago -> 3 ticks
      const lastPermanentHealAt = new Date(now.getTime() - 12 * 60000) // 12 minutes ago -> 2 ticks
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ hospital_heal_interval_ms: 60000, permanent_heal_interval_ms: 300000 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              hp: 10,
              max_hp: 18,
              original_max_hp: 20,
              last_hospital_heal_at: lastHospitalHealAt,
              last_permanent_heal_at: lastPermanentHealAt,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })

      await HospitalService.regenerateHospitalizedRecruits(mockClient, 1, now)

      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining(
          'UPDATE recruits SET hp = $1, max_hp = $2, last_hospital_heal_at = $3, last_permanent_heal_at = $4, status = $5',
        ),
        [
          13, // 10 + floor(3.5) HP ticks
          20, // 18 + floor(2) permanent ticks, capped at original_max_hp
          new Date(lastHospitalHealAt.getTime() + 3 * 60000),
          new Date(lastPermanentHealAt.getTime() + 2 * 300000),
          'hospitalized',
          1,
          1,
        ],
      )
    })

    test('leaves the permanent-heal clock untouched when its interval has not elapsed', async () => {
      const now = new Date()
      const lastHospitalHealAt = new Date(now.getTime() - 3.5 * 60000)
      const lastPermanentHealAt = new Date(now.getTime() - 60000) // only 1 minute, interval is 5
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ hospital_heal_interval_ms: 60000, permanent_heal_interval_ms: 300000 }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              hp: 10,
              max_hp: 18,
              original_max_hp: 20,
              last_hospital_heal_at: lastHospitalHealAt,
              last_permanent_heal_at: lastPermanentHealAt,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })

      await HospitalService.regenerateHospitalizedRecruits(mockClient, 1, now)

      expect(mockClient.query).toHaveBeenLastCalledWith(
        expect.stringContaining(
          'UPDATE recruits SET hp = $1, max_hp = $2, last_hospital_heal_at = $3, last_permanent_heal_at = $4, status = $5',
        ),
        [13, 18, new Date(lastHospitalHealAt.getTime() + 3 * 60000), lastPermanentHealAt, 'hospitalized', 1, 1],
      )
    })

    test('does nothing when no recruit is hospitalized', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ hospital_heal_interval_ms: 60000, permanent_heal_interval_ms: 300000 }],
        })
        .mockResolvedValueOnce({ rows: [] })

      await HospitalService.regenerateHospitalizedRecruits(mockClient, 1)

      expect(mockClient.query).toHaveBeenCalledTimes(2)
    })
  })
})
