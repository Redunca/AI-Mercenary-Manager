const SHIP_NAMES = [
  'Vanguard', 'Phantom', 'Eclipse', 'Nexus', 'Sentinel', 'Specter', 'Apex', 'Cipher',
  'Nebula', 'Titan', 'Vector', 'Prism', 'Corvus', 'Atlas', 'Zenith', 'Obsidian',
  'Aurora', 'Valiant', 'Quantum', 'Meridian', 'Inferno', 'Horizon', 'Verdict', 'Rogue',
]

function generateShipName(rollInRange) {
  const index = rollInRange(0, SHIP_NAMES.length - 1)
  return SHIP_NAMES[index]
}

function generateGalacticId() {
  return `SHIP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
}

function createStarterShip(shipId, rollInRange) {
  return {
    id: shipId,
    name: generateShipName(rollInRange),
    galactic_id: generateGalacticId(),
    rarity: 'common',
    stats: {
      speed: 100,
      capacity: 1,
      inventory_space: 0,
      durability: 10,
      price: 0,
    },
    crew: [],
    status: 'docked',
  }
}

function validateCrewAssignment(ship, recruits, dockingStationCapacity) {
  const crewCount = ship.crew.length
  
  if (crewCount > dockingStationCapacity) {
    return {
      valid: false,
      error: `Crew size (${crewCount}) exceeds docking station capacity (${dockingStationCapacity})`,
    }
  }

  if (ship.status !== 'docked') {
    return {
      valid: false,
      error: `Ship is not docked (status: ${ship.status})`,
    }
  }

  const unavailableRecruits = recruits.filter(r => r.status !== 'available')
  if (unavailableRecruits.length > 0) {
    return {
      valid: false,
      error: `Cannot assign recruits with status: ${unavailableRecruits.map(r => r.status).join(', ')}`,
    }
  }

  return { valid: true }
}

function calculateEffectiveTravelTime(baseTime, shipSpeed) {
  return Math.floor(baseTime / (shipSpeed / 100))
}

module.exports = {
  SHIP_NAMES,
  generateShipName,
  generateGalacticId,
  createStarterShip,
  validateCrewAssignment,
  calculateEffectiveTravelTime,
}