const {
  SHIP_NAMES, generateShipName, generateGalacticId, createStarterShip,
  validateCrewAssignment, calculateEffectiveTravelTime,
} = require('../src/domain/ship')

describe('generateShipName', () => {
  test('picks a name from SHIP_NAMES using the provided rng', () => {
    const rollInRange = jest.fn().mockReturnValue(2)
    expect(generateShipName(rollInRange)).toBe(SHIP_NAMES[2])
    expect(rollInRange).toHaveBeenCalledWith(0, SHIP_NAMES.length - 1)
  })
})

describe('generateGalacticId', () => {
  test('produces a unique SHIP-prefixed id on each call', () => {
    const a = generateGalacticId()
    const b = generateGalacticId()
    expect(a).toMatch(/^SHIP-\d+-[A-Z0-9]+$/)
    expect(a).not.toBe(b)
  })
})

describe('createStarterShip', () => {
  test('builds a docked, crewless common ship with default stats', () => {
    const rollInRange = jest.fn().mockReturnValue(0)
    const ship = createStarterShip(1, rollInRange)

    expect(ship).toMatchObject({
      id: 1,
      name: SHIP_NAMES[0],
      rarity: 'common',
      crew: [],
      status: 'docked',
      stats: { speed: 100, capacity: 1, inventory_space: 0, durability: 10, max_durability: 10, price: 0 },
    })
    expect(ship.galactic_id).toMatch(/^SHIP-/)
  })
})

describe('validateCrewAssignment', () => {
  const dockedShip = { crew: [1, 2], status: 'docked' }

  test('rejects when crew exceeds docking station capacity', () => {
    const result = validateCrewAssignment(dockedShip, [], 1)
    expect(result).toEqual({
      valid: false,
      error: 'Crew size (2) exceeds docking station capacity (1)',
    })
  })

  test('rejects when the ship is not docked', () => {
    const result = validateCrewAssignment({ ...dockedShip, status: 'in_mission' }, [], 5)
    expect(result).toEqual({
      valid: false,
      error: 'Ship is not docked (status: in_mission)',
    })
  })

  test('rejects when a recruit is not available', () => {
    const recruits = [{ status: 'available' }, { status: 'in_mission' }]
    const result = validateCrewAssignment(dockedShip, recruits, 5)
    expect(result).toEqual({
      valid: false,
      error: 'Cannot assign recruits with status: in_mission',
    })
  })

  test('accepts a docked ship within capacity with available recruits', () => {
    const recruits = [{ status: 'available' }, { status: 'available' }]
    expect(validateCrewAssignment(dockedShip, recruits, 5)).toEqual({ valid: true })
  })
})

describe('calculateEffectiveTravelTime', () => {
  test('returns the base time unchanged at 100 speed', () => {
    expect(calculateEffectiveTravelTime(1000, 100)).toBe(1000)
  })

  test('halves the travel time at double speed', () => {
    expect(calculateEffectiveTravelTime(1000, 200)).toBe(500)
  })

  test('doubles the travel time at half speed', () => {
    expect(calculateEffectiveTravelTime(1000, 50)).toBe(2000)
  })

  test('floors the result', () => {
    expect(calculateEffectiveTravelTime(1000, 300)).toBe(333)
  })
})
