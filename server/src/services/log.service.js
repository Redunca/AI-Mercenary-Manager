const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '../../data')

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-')
}

function pickEventRecruitQuote({ eventType, success, perks, flaws, personality }) {
  const dir = path.join(DATA_DIR, eventType.toLowerCase())
  if (!fs.existsSync(dir)) return null

  const availableFiles = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))

  const perkFlawSlugs = [
    ...(Array.isArray(perks) ? perks : []).map(p => slugify(p.name)),
    ...(Array.isArray(flaws) ? flaws : []).map(f => slugify(f.name)),
  ]
  const matches = perkFlawSlugs.filter(slug => availableFiles.includes(slug))
  const fileKey = matches.length > 0
    ? matches[Math.floor(Math.random() * matches.length)]
    : 'perk-and-flawless'

  if (!availableFiles.includes(fileKey)) return null

  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, `${fileKey}.json`), 'utf8'))
    const outcomeKey = success ? 'success' : 'failure'
    const phrases = data[eventType.toUpperCase()]?.[outcomeKey]?.[fileKey]?.[personality ?? 'Explorer']
    if (!Array.isArray(phrases) || phrases.length === 0) return null
    return phrases[Math.floor(Math.random() * phrases.length)]
  } catch { return null }
}

/**
 * Picks a planet-tag-flavored [SYS]/[IA] line, mirroring pickEventRecruitQuote's
 * "collect matches, then pick one at random" pattern. Returns null (meaning: fall
 * back to the generic pool) when the planet is missing, has no tags, none of its
 * tags have flavor content, or planet-tags.json itself can't be read/parsed.
 */
function pickPlanetTagQuote({ tags, channel }) {
  if (!Array.isArray(tags) || tags.length === 0) return null

  let data
  try {
    data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'planet-tags.json'), 'utf8'))
  } catch {
    return null
  }

  const matches = tags.filter(tag => Array.isArray(data[tag]?.[channel]) && data[tag][channel].length > 0)
  if (matches.length === 0) return null

  const tag = matches[Math.floor(Math.random() * matches.length)]
  const phrases = data[tag][channel]
  return phrases[Math.floor(Math.random() * phrases.length)]
}

const POOL = {
  EN_ROUTE: {
    sys: ["Unité en déplacement vers la zone d'opération.", "Départ confirmé. Aucun incident au départ."],
    ia: ["Aucune anomalie détectée.", "Trajectoire nominale. Surveillance active."],
    recruit: ["On est partis dans la mauvaise direction.", "J'ai oublié mes affaires.", "C'est loin ?"],
  },
  EVENEMENT: {
    sys: ["Contact établi avec la zone cible.", "Événement en cours. Issue indéterminée."],
    ia: ["Analyse de situation en cours.", "Variables environnementales instables."],
    recruit: ["C'est quoi ce truc ?!", "Personne m'a dit que ça serait comme ça."],
  },
  RETOUR: {
    sys: ["Phase de retour initiée.", "Mission accomplie. Retour en cours."],
    ia: ["Unité en chemin de retour. Résultat nominal.", "Efficacité : acceptable."],
    recruit: ["On rentre enfin.", "J'ai failli mourir mais bon.", "Je veux une prime."],
  },
  TERMINEE: {
    sys: ["Mission terminée. Unité rentrée à la base.", "Objectif atteint."],
    ia: ["Opération conclue.", "Performance dans les paramètres acceptables."],
    recruit: ["On recommence quand ?", "Je vais dormir.", "Quelqu'un a de la nourriture ?"],
  },
}

const POOL_FAILED = {
  RETOUR: {
    sys: ["Extraction d'urgence. Mission avortée.", "Retour précipité. Objectif non atteint."],
    ia: ["Protocole d'extraction activé.", "Échec opérationnel. Analyse des causes en cours."],
  },
  TERMINEE: {
    sys: ["Mission échouée. Unité rentrée à la base.", "Opération avortée."],
    ia: ["Bilan négatif. Aucun objectif atteint.", "Debriefing d'échec programmé."],
  },
}

const EVENT_PHRASES = {
  success_ia: ["Objectif intermédiaire validé.", "Résultat conforme aux projections.", "Exécution nominale."],
  success_recruit: ["Trop facile.", "Je savais que j'allais y arriver.", "On continue ?"],
  hp_loss_ia: ["Dommages enregistrés. Recrue toujours opérationnelle.", "Blessure non critique. Mission maintenue."],
  hp_loss_recruit: ["Ça fait mal mais je tiens.", "J'ai pris cher.", "Ce n'est qu'une égratignure."],
  abort_ia: ["Protocole d'extraction activé. Mission avortée.", "Situation incontrôlable. Retrait immédiat."],
  abort_recruit: ["On fout le camp !", "C'est trop chaud, on se barre.", "J'ai pas signé pour ça."],
  no_reward_ia: ["Objectif non atteint. Aucune rémunération versée.", "Contrat non honoré. Mission close sans paiement."],
  no_reward_recruit: ["On rentre les mains vides.", "J'ai fait de mon mieux.", "Pas de crédit, mais on est entiers."],
  death_ia: ["Signal vital perdu. Recrue neutralisée.", "Perte confirmée. Enregistrement du dossier."],
  last_words: [
    "Transmettez mes salutations à personne.", "J'aurais dû demander une prime plus élevée.",
    "...", "Je savais que ça finirait comme ça.", "Prenez soin du reste de l'équipe.",
  ],
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function formatRoll(r) {
  const bonus = r.bonus > 0 ? ` + ${r.diceNotation}(${r.bonus})` : ''
  return `1d20(${r.d20})${bonus} = ${r.total} vs DC ${r.dc}`
}

async function insertLogEntries(client, playerId, entries) {
  for (const entry of entries) {
    await client.query(
      `INSERT INTO log_entries (player_id, tag, message, mission_id) VALUES ($1, $2, $3, $4)`,
      [playerId, entry.tag, entry.message, entry.missionId ?? null],
    )
  }
}

/**
 * @typedef {object} LogContext
 * @property {number} missionId
 * @property {string} missionName
 * @property {string|undefined} missionDifficulty
 * @property {{id: string|number, name: string, tags: string[]}|null} planet
 *   Used by pickPlanetTagQuote() to prefer environment-flavored [SYS]/[IA] lines over the generic pool.
 * @property {{id: string|number, name: string, perks: any[], flaws: any[], personality: string}|null} actingRecruit
 *   The single recruit driving this log entry, if any (e.g. the recruit who rolled for an event). Null for
 *   phase logs, which speak for the whole crew rather than one actor.
 * @property {Array<{id: string|number, name: string, perks: any[], flaws: any[], personality: string}>} crew
 *   The full crew assigned to the mission instance, regardless of who is "acting". Not used by the log text
 *   built in this file yet — it's threaded through so later log-building logic (banter, etc.) has it without
 *   further plumbing changes.
 */

function buildPhaseLogs({ context, phase, failed, rewardForfeited, recruitName }) {
  const { missionId, missionName, missionDifficulty, planet } = context
  const failedPool = failed ? POOL_FAILED[phase] : null
  const pool = POOL[phase]
  const prefix = missionDifficulty ? `[${missionName} · ${missionDifficulty}] ` : `[${missionName}] `
  const sysLine = pickPlanetTagQuote({ tags: planet?.tags, channel: 'sys' }) ?? pick(failedPool?.sys ?? pool.sys)
  const iaLine = pickPlanetTagQuote({ tags: planet?.tags, channel: 'ia' }) ?? pick(failedPool?.ia ?? pool.ia)
  const entries = [
    { tag: '[SYS]', message: `${prefix}${sysLine}`, missionId },
    { tag: '[IA]', message: iaLine, missionId },
  ]

  if (phase === 'EN_ROUTE' || phase === 'EVENEMENT') {
    entries.push({
      tag: `[${recruitName.toUpperCase()}]`,
      message: `"${pick(pool.recruit)}"`,
      missionId,
    })
  }

  const global = []
  if (phase === 'EN_ROUTE') {
    global.push({
      tag: '[SYS]',
      message: `Mission "${missionName}" lancée — Recrue : ${recruitName}`,
    })
  }
  if (phase === 'TERMINEE') {
    const outcome = failed ? 'ÉCHEC' : rewardForfeited ? 'SANS RÉCOMPENSE' : 'SUCCÈS'
    global.push({
      tag: '[SYS]',
      message: `Mission "${missionName}" terminée [${outcome}] — Recrue : ${recruitName}`,
    })
  }

  return { mission: entries, global }
}

function buildEventResultLogs({ context, eventResult }) {
  const { missionId, missionName, actingRecruit, planet } = context
  const recruitName = actingRecruit?.name
  const recruitPerks = actingRecruit?.perks
  const recruitFlaws = actingRecruit?.flaws
  const recruitPersonality = actingRecruit?.personality

  const r = eventResult
  const rollStr = formatRoll(r)
  const entries = []
  const tag = `[${recruitName.toUpperCase()}]`

  function recruitQuote(defaultPool) {
    const fromFile = pickEventRecruitQuote({
      eventType: r.type,
      success: r.success,
      perks: recruitPerks,
      flaws: recruitFlaws,
      personality: recruitPersonality,
    })
    return `"${fromFile ?? pick(defaultPool)}"`
  }

  // The [SYS] line here carries the dice roll and outcome — mechanical information, not flavor —
  // so unlike buildPhaseLogs, planet-tag content only ever replaces the [IA] line, never [SYS].
  function iaLine(defaultPool) {
    return pickPlanetTagQuote({ tags: planet?.tags, channel: 'ia' }) ?? pick(defaultPool)
  }

  if (r.recruitDied) {
    entries.push({ tag: '[SYS]', message: `${r.type}${r.attribute ? ` [${r.attribute}]` : ''} — ${rollStr} → MORT AU COMBAT`, missionId })
    entries.push({ tag: '[IA]', message: iaLine(EVENT_PHRASES.death_ia), missionId })
    entries.push({ tag, message: `"${pick(EVENT_PHRASES.last_words)}"`, missionId })
    return {
      mission: entries,
      global: [{ tag: '[SYS]', message: `${recruitName} est mort(e) au cours de la mission "${missionName}".` }],
    }
  }

  const typeLabel = `${r.type}${r.attribute ? ` [${r.attribute}]` : ''}`
  if (!r.success && r.consequence === 'FORCED_DEPARTURE') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → ÉCHEC — Extraction forcée`, missionId })
    entries.push({ tag: '[IA]', message: iaLine(EVENT_PHRASES.abort_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.abort_recruit), missionId })
  } else if (!r.success && r.consequence === 'NO_REWARD') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → ÉCHEC — aucune récompense`, missionId })
    entries.push({ tag: '[IA]', message: iaLine(EVENT_PHRASES.no_reward_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.no_reward_recruit), missionId })
  } else if (!r.success && r.consequence === 'HP_LOSS') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → ÉCHEC — -${r.hpLost} PV`, missionId })
    entries.push({ tag: '[IA]', message: iaLine(EVENT_PHRASES.hp_loss_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.hp_loss_recruit), missionId })
  } else {
    const rewardStr = r.rewardEarned ? ` [+${r.rewardEarned.amount} ${r.rewardEarned.type}]` : ''
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → SUCCÈS${rewardStr}`, missionId })
    entries.push({ tag: '[IA]', message: iaLine(EVENT_PHRASES.success_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.success_recruit), missionId })
  }

  return { mission: entries, global: [] }
}

// --- Recruit-to-recruit banter (task 5) ---

function hasTrait(recruit, kind, slug) {
  const list = kind === 'perk' ? recruit?.perks : recruit?.flaws
  return Array.isArray(list) && list.some(t => slugify(t.name) === slug)
}

function parseTrigger(trigger) {
  // "flaw:bloodlust+flaw:pacifist" -> [{kind:'flaw',slug:'bloodlust'}, {kind:'flaw',slug:'pacifist'}]
  return trigger.split('+').map(part => {
    const [kind, slug] = part.split(':')
    return { kind, slug }
  })
}

function loadBanterPairs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'banter', 'pairs.json'), 'utf8'))
  } catch {
    return []
  }
}

function loadPersonalityPairs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'banter', 'personality-pairs.json'), 'utf8'))
  } catch {
    return {}
  }
}

// For each crew pair and each trait-pair template, check both name/order assignments
// (m1 holds trait[0] & m2 holds trait[1], or vice versa) since crew order carries no meaning.
function collectTraitMatches(crewPairs) {
  const traitPairs = loadBanterPairs()
  const matches = []
  for (const [m1, m2] of crewPairs) {
    for (const entry of traitPairs) {
      const [t1, t2] = parseTrigger(entry.trigger)
      if (hasTrait(m1, t1.kind, t1.slug) && hasTrait(m2, t2.kind, t2.slug)) {
        matches.push({ A: m1, B: m2, entry })
      } else if (hasTrait(m2, t1.kind, t1.slug) && hasTrait(m1, t2.kind, t2.slug)) {
        matches.push({ A: m2, B: m1, entry })
      }
    }
  }
  return matches
}

function collectPersonalityMatches(crewPairs) {
  const personalityPairs = loadPersonalityPairs()
  const matches = []
  for (const [m1, m2] of crewPairs) {
    const keyDirect = `${m1.personality}+${m2.personality}`
    const keyReversed = `${m2.personality}+${m1.personality}`
    if (personalityPairs[keyDirect]) {
      matches.push({ A: m1, B: m2, entry: personalityPairs[keyDirect] })
    } else if (m1.personality !== m2.personality && personalityPairs[keyReversed]) {
      matches.push({ A: m2, B: m1, entry: personalityPairs[keyReversed] })
    }
  }
  return matches
}

function allCrewPairs(crew) {
  const pairs = []
  for (let i = 0; i < crew.length; i++) {
    for (let j = i + 1; j < crew.length; j++) {
      pairs.push([crew[i], crew[j]])
    }
  }
  return pairs
}

/**
 * Reads the most recent banter log entry for this mission (identified by its tag containing
 * the banter arrow '→', which never appears in [SYS]/[IA]/[NAME] tags) and returns the unordered
 * pair of names involved, or null if there's no prior banter for this mission. Cooldown mechanism:
 * no schema change — derived entirely from what's already persisted in log_entries.
 */
async function getLastBanterPairNames(client, playerId, missionId) {
  const result = await client.query(
    `SELECT tag FROM log_entries
     WHERE player_id = $1 AND mission_id = $2 AND tag LIKE '%→%'
     ORDER BY id DESC LIMIT 1`,
    [playerId, missionId],
  )
  const tag = result.rows[0]?.tag
  if (!tag) return null
  const match = tag.match(/^\[(.+)→(.+)\]$/)
  if (!match) return null
  return [match[1], match[2]].sort()
}

/**
 * Builds a recruit-to-recruit banter log, or returns null when banter shouldn't fire this trigger
 * (fewer than 2 crew members, the only eligible pair(s) all repeat the immediately preceding banter
 * pair, or no trait-pair/personality-pair template matches any eligible crew pair).
 */
async function buildBanterLog(client, playerId, context) {
  const { missionId, crew } = context
  if (!Array.isArray(crew) || crew.length < 2) return null

  const lastPair = await getLastBanterPairNames(client, playerId, missionId)
  const crewPairs = allCrewPairs(crew)
  const eligiblePairs = lastPair
    ? crewPairs.filter(([m1, m2]) => {
        const names = [m1.name.toUpperCase(), m2.name.toUpperCase()].sort()
        return !(names[0] === lastPair[0] && names[1] === lastPair[1])
      })
    : crewPairs

  if (eligiblePairs.length === 0) return null

  const traitMatches = collectTraitMatches(eligiblePairs)
  const chosen = traitMatches.length > 0
    ? traitMatches[Math.floor(Math.random() * traitMatches.length)]
    : (() => {
        const personalityMatches = collectPersonalityMatches(eligiblePairs)
        return personalityMatches.length > 0
          ? personalityMatches[Math.floor(Math.random() * personalityMatches.length)]
          : null
      })()

  if (!chosen) return null

  const { A, B, entry } = chosen
  const line = pick(entry.lines).replace(/\{A\}/g, A.name).replace(/\{B\}/g, B.name)
  const reply = pick(entry.reply).replace(/\{A\}/g, A.name).replace(/\{B\}/g, B.name)

  return {
    mission: [
      { tag: `[${A.name.toUpperCase()}→${B.name.toUpperCase()}]`, message: line, missionId },
      { tag: `[${B.name.toUpperCase()}→${A.name.toUpperCase()}]`, message: reply, missionId },
    ],
  }
}

module.exports = {
  insertLogEntries,
  buildPhaseLogs,
  buildEventResultLogs,
  pickPlanetTagQuote,
  buildBanterLog,
}
