const ATTRIBUTE_KEYS = [
  'agility', 'fortitude', 'might',
  'learning', 'logic', 'perception', 'will',
  'deception', 'persuasion', 'presence',
]

const ATTRIBUTE_TABLES = {
  specialized:        [5, 4, 3, 2, 2, 2, 0, 0, 0, 0],
  'well-rounded':     [4, 4, 3, 3, 3, 1, 1, 0, 0, 0],
  'jack-of-all-trades': [3, 3, 3, 3, 3, 2, 2, 2, 1, 0],
}

const JOB_TITLES = {
  specialized:        ['Assassin', 'Soldat d\'élite', 'Hacker', 'Franc-tireur', 'Berserk', 'Saboteur', 'Infiltrateur'],
  'well-rounded':     ['Opérateur', 'Éclaireur', 'Tacticien', 'Agent de terrain', 'Commando', 'Ranger'],
  'jack-of-all-trades': ['Freelance', 'Mercenaire', 'Contractuel', 'Survivant', 'Drifter', 'Généraliste'],
}

const CANDIDATE_NAMES = [
  'Kade', 'Riven', 'Sable', 'Torque', 'Vex', 'Zara', 'Dusk', 'Mira',
  'Rook', 'Shade', 'Lark', 'Finn', 'Nash', 'Cole', 'Jade', 'Rex',
  'Nova', 'Gray', 'Wren', 'Cruz', 'Vale', 'Blaze', 'Hex', 'Sorn',
  'Lyra', 'Dane', 'Pax', 'Fen', 'Voss', 'Kyra',
]

const ARCHETYPES = ['specialized', 'well-rounded', 'jack-of-all-trades']
const PERSONALITIES = ['Analyst', 'Diplomat', 'Sentinel', 'Explorer']

function computeMaxHp(attributes) {
  return 2 * (attributes.fortitude + attributes.presence + attributes.will) + 10
}

function shuffle(arr, rollInRange) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rollInRange(0, i)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function pickRandom(arr, rollInRange) {
  return arr[rollInRange(0, arr.length - 1)]
}

function pickUnique(arr, count, rollInRange) {
  return shuffle([...arr], rollInRange).slice(0, count)
}

function buildAttributes(values, rollInRange) {
  const shuffled = shuffle([...values], rollInRange)
  return ATTRIBUTE_KEYS.reduce((acc, key, i) => {
    acc[key] = shuffled[i]
    return acc
  }, {})
}

function generateCandidate(id, perksFlaws, rollInRange) {
  const archetype = pickRandom(ARCHETYPES, rollInRange)
  const personality = pickRandom(PERSONALITIES, rollInRange)
  const name = pickRandom(CANDIDATE_NAMES, rollInRange)
  const jobTitle = pickRandom(JOB_TITLES[archetype], rollInRange)
  const attributes = buildAttributes(ATTRIBUTE_TABLES[archetype], rollInRange)
  const maxHp = computeMaxHp(attributes)
  const perkCount = rollInRange(0, 2)
  const flawCount = rollInRange(0, 2)
  const perks = pickUnique(perksFlaws.perks, perkCount, rollInRange)
  const flaws = pickUnique(perksFlaws.flaws, flawCount, rollInRange)

  return {
    id,
    name,
    jobTitle,
    archetype,
    personality,
    attributes,
    hp: maxHp,
    maxHp,
    perks,
    flaws,
  }
}

function rowToCandidate(row) {
  return {
    id: String(row.id),
    name: row.name,
    jobTitle: row.job_title,
    archetype: row.archetype,
    personality: row.personality,
    attributes: row.attributes,
    hp: row.hp,
    maxHp: row.max_hp,
    perks: row.perks,
    flaws: row.flaws,
  }
}

function rowToRecruit(row) {
  return {
    id: String(row.id),
    name: row.name,
    jobTitle: row.job_title ?? undefined,
    personality: row.personality,
    attributes: row.attributes,
    hp: row.hp,
    maxHp: row.max_hp,
    status: row.status,
    perks: row.perks,
    flaws: row.flaws,
  }
}

module.exports = {
  ATTRIBUTE_KEYS,
  computeMaxHp,
  generateCandidate,
  rowToCandidate,
  rowToRecruit,
}
