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
  specialized:        ['Assassin', 'Elite Soldier', 'Hacker', 'Sharpshooter', 'Berserker', 'Saboteur', 'Infiltrator'],
  'well-rounded':     ['Operative', 'Scout', 'Tactician', 'Field Agent', 'Commando', 'Ranger'],
  'jack-of-all-trades': ['Freelancer', 'Mercenary', 'Contractor', 'Survivor', 'Drifter', 'Generalist'],
}

const CANDIDATE_NAMES = [
  'Kade', 'Riven', 'Sable', 'Torque', 'Vex', 'Zara', 'Dusk', 'Mira',
  'Rook', 'Shade', 'Lark', 'Finn', 'Nash', 'Cole', 'Jade', 'Rex',
  'Nova', 'Gray', 'Wren', 'Cruz', 'Vale', 'Blaze', 'Hex', 'Sorn',
  'Lyra', 'Dane', 'Pax', 'Fen', 'Voss', 'Kyra',
  'Ash', 'Talon', 'Kess', 'Orin', 'Juno', 'Raze', 'Sten', 'Ivy',
  'Corvin', 'Mace', 'Piper', 'Thorne', 'Zane', 'Skye', 'Bram', 'Nyx',
  'Quill', 'Halden', 'Ren', 'Storm',
]

// Surnames, drawn for every recruit regardless of archetype -- see
// buildFullName(). Kept alongside CANDIDATE_NAMES (first names) rather than
// in a separate data file since both are small, hand-authored pools in the
// same "recruit identity" category as CODENAMES.
const FAMILY_NAMES = [
  'Sorenson', 'Vance', 'Kestrel', 'Draven', 'Marsh', 'Halloway', 'Vantis', 'Corbin',
  'Renner', 'Ashworth', 'Blackwood', 'Thorne', 'Kaine', 'Ostrander', 'Marrow', 'Steele',
  'Crane', 'Halvorsen', 'Draper', 'Wexler', 'Ironside', 'Calloway', 'Brennan', 'Fairweather',
  'Duskwalker', 'Hollis', 'Sabbat', 'Kestlin', 'Varrow', 'Ashgrove', 'Colton', 'Vantage',
  'Rourke', 'Fenwick', 'Delacroix', 'Grimshaw', 'Harlan', 'Kessler', 'Ostrow', 'Pryce',
  'Ravensworth', 'Talbot', 'Underhill', 'Vasquez', 'Winters', 'Yorick', 'Zephyr', 'Ambrose',
  'Barrow', 'Corwin',
]

// Only ever used for the 'specialized' archetype -- see buildFullName().
const CODENAMES = [
  'Reaper', 'Ghost', 'Widow', 'Viper', 'Havoc', 'Wraith', 'Specter', 'Jackal',
  'Cipher', 'Nomad', 'Rattler', 'Reckoning', 'Warden', 'Scorch', 'Glitch', 'Hollow',
  'Mirage', 'Vendetta', 'Static', 'Fracture', 'Ashen', 'Bastion', 'Crossfire', 'Doombringer',
  'Ember', 'Fallout', 'Grim', 'Longshot', 'Ironclad', 'Jinx', 'Lockdown', 'Maverick',
  'Nightshade', 'Outlaw', 'Phantom', 'Quicksilver', 'Ronin', 'Talisman', 'Undertow', 'Vulture',
  'Warhead', 'Xenon', 'Yeti', 'Zero', 'Blackout', 'Chimera', 'Deadbolt', 'Echo',
  'Nightfall', 'Draconis',
]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const ARCHETYPES = ['specialized', 'well-rounded', 'jack-of-all-trades']
const PERSONALITIES = ['Analyst', 'Diplomat', 'Sentinel', 'Explorer']

function computeMaxHp(attributes) {
  return 2 * (attributes.fortitude + attributes.presence + attributes.will) + 10
}

// Guard = 10 + Might + Agility + equipped armor's Guard bonus (see
// domain/equipment.js's computeArmorGuardBonus for how that bonus is
// gated behind the armor's Required Fortitude).
function computeGuard(attributes, armorBonus = 0) {
  return 10 + (attributes.might || 0) + (attributes.agility || 0) + armorBonus
}

// Physical combat always uses whichever of Might/Agility is higher. Ties go
// to Might so results are deterministic.
function bestCombatStat(attributes) {
  const might = attributes.might || 0
  const agility = attributes.agility || 0
  return might >= agility
    ? { attribute: 'might', score: might }
    : { attribute: 'agility', score: agility }
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

// Full name format depends on archetype:
//   jack-of-all-trades -> "{first} {last}"                 (e.g. "Kade Sorenson")
//   well-rounded        -> "{first} {letter}. {last}"       (e.g. "Kade V. Sorenson")
//   specialized          -> "{first} \"{codename}\" {last}" (e.g. "Kade \"Reaper\" Sorenson")
// The middle letter is a plain random A-Z initial with no meaning behind it
// -- it's flavor, not derived from the recruit's other generated fields.
function buildFullName(archetype, rollInRange) {
  const first = pickRandom(CANDIDATE_NAMES, rollInRange)
  const last = pickRandom(FAMILY_NAMES, rollInRange)

  if (archetype === 'well-rounded') {
    const letter = LETTERS[rollInRange(0, LETTERS.length - 1)]
    return `${first} ${letter}. ${last}`
  }
  if (archetype === 'specialized') {
    const codename = pickRandom(CODENAMES, rollInRange)
    return `${first} "${codename}" ${last}`
  }
  return `${first} ${last}`
}

function generateCandidate(id, perksFlaws, rollInRange) {
  const archetype = pickRandom(ARCHETYPES, rollInRange)
  const personality = pickRandom(PERSONALITIES, rollInRange)
  const name = buildFullName(archetype, rollInRange)
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
    originalMaxHp: row.original_max_hp ?? row.max_hp,
    status: row.status,
    perks: row.perks,
    flaws: row.flaws,
  }
}

module.exports = {
  ATTRIBUTE_KEYS,
  computeMaxHp,
  computeGuard,
  bestCombatStat,
  buildFullName,
  generateCandidate,
  rowToCandidate,
  rowToRecruit,
}
