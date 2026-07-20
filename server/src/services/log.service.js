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
    sys: ["Unit moving toward the operation zone.", "Departure confirmed. No incidents on launch."],
    ia: ["No anomalies detected.", "Trajectory nominal. Monitoring active."],
    recruit: ["We went the wrong way.", "I forgot my stuff.", "Is it far?"],
  },
  EVENT: {
    sys: ["Contact established with target zone.", "Event in progress. Outcome undetermined."],
    ia: ["Situation analysis in progress.", "Environmental variables unstable."],
    recruit: ["What is that thing?!", "Nobody told me it would be like this."],
  },
  RETURN: {
    sys: ["Return phase initiated.", "Mission accomplished. Returning."],
    ia: ["Unit en route home. Nominal outcome.", "Efficiency: acceptable."],
    recruit: ["We're finally heading back.", "Almost died but whatever.", "I want a bonus."],
  },
  COMPLETED: {
    sys: ["Mission complete. Unit returned to base.", "Objective achieved."],
    ia: ["Operation concluded.", "Performance within acceptable parameters."],
    recruit: ["When do we go again?", "I'm going to sleep.", "Anyone got food?"],
  },
}

const POOL_FAILED = {
  RETURN: {
    sys: ["Emergency extraction. Mission aborted.", "Hasty retreat. Objective not achieved."],
    ia: ["Extraction protocol activated.", "Operational failure. Root cause analysis in progress."],
  },
  COMPLETED: {
    sys: ["Mission failed. Unit returned to base.", "Operation aborted."],
    ia: ["Negative outcome. No objective achieved.", "Failure debrief scheduled."],
  },
}

const EVENT_PHRASES = {
  success_ia: ["Intermediate objective validated.", "Result matches projections.", "Nominal execution."],
  success_recruit: ["Too easy.", "I knew I'd pull it off.", "Shall we continue?"],
  hp_loss_ia: ["Damage recorded. Recruit still operational.", "Non-critical injury. Mission continues."],
  hp_loss_recruit: ["That hurt but I'm holding up.", "That one stung.", "Just a scratch."],
  abort_ia: ["Extraction protocol activated. Mission aborted.", "Situation uncontrollable. Immediate withdrawal."],
  abort_recruit: ["We're getting out of here!", "Too hot, we're bailing.", "I didn't sign up for this."],
  no_reward_ia: ["Objective not achieved. No payment issued.", "Contract not honored. Mission closed without payment."],
  no_reward_recruit: ["We're coming back empty-handed.", "I did my best.", "No credits, but we're all in one piece."],
  death_ia: ["Vital signs lost. Recruit neutralized.", "Loss confirmed. Filing the record."],
  last_words: [
    "Give my regards to no one in particular.", "I should have asked for a bigger bonus.",
    "...", "I knew it would end like this.", "Take care of the rest of the team.",
  ],
  revived_ia: ["Flatline reversed. Nanite injection successful.", "Vital signs restored. Recruit stabilized."],
  revived_recruit: ["I was gone for a second there.", "Remind me to thank whoever packed the medkit."],
  ship_damage_ia: ["Hull integrity compromised.", "Structural damage sustained."],
  ship_damage_recruit: ["That's coming out of the bonus.", "We're not landing softly after that."],
  ship_broken_ia: ["Hull integrity critical. Vessel disabled.", "Ship inoperable. Grounding on return."],
  ship_broken_recruit: ["We're not flying this thing again anytime soon.", "That's it, she's done."],
  ship_repaired_ia: ["Auto-patch engaged. Hull integrity restored.", "Repair systems compensated for the damage."],
  ship_repaired_recruit: ["Patched up and still flying.", "Good thing we packed spares."],
  combat_won_ia: ["Hostile threat neutralized.", "Engagement resolved in our favor."],
  combat_won_recruit: ["Didn't even break a sweat.", "That's one less problem."],
  combat_lost_ia: ["Engagement untenable. Withdrawal required.", "Hostile force too strong. Pulling back."],
  combat_lost_recruit: ["We need to fall back, now!", "This fight's not winnable."],
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
      `INSERT INTO log_entries (player_id, tag, message, mission_id, opera_id) VALUES ($1, $2, $3, $4, $5)`,
      [playerId, entry.tag, entry.message, entry.missionId ?? null, entry.operaId ?? null],
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
 *   The full crew assigned to the mission instance, regardless of who is "acting". Used by buildBanterLog()
 *   to find eligible trait-pair/personality-pair matches; not used by buildPhaseLogs/buildEventResultLogs.
 *   `planet.tags` is also consumed by buildBanterLog() to prefer tag-flavored line variants when a chosen
 *   banter entry defines them (see pickTagFlavoredContent), falling back to its generic lines/reply otherwise.
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

  if (phase === 'EN_ROUTE' || phase === 'EVENT') {
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
      message: `Mission "${missionName}" launched — Recruit: ${recruitName}`,
    })
  }
  if (phase === 'COMPLETED') {
    const outcome = failed ? 'FAILURE' : rewardForfeited ? 'NO REWARD' : 'SUCCESS'
    global.push({
      tag: '[SYS]',
      message: `Mission "${missionName}" completed [${outcome}] — Recruit: ${recruitName}`,
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
    entries.push({ tag: '[SYS]', message: `${r.type}${r.attribute ? ` [${r.attribute}]` : ''} — ${rollStr} → KILLED IN ACTION`, missionId })
    entries.push({ tag: '[IA]', message: iaLine(EVENT_PHRASES.death_ia), missionId })
    entries.push({ tag, message: `"${pick(EVENT_PHRASES.last_words)}"`, missionId })
    return {
      mission: entries,
      global: [{ tag: '[SYS]', message: `${recruitName} died during mission "${missionName}".` }],
    }
  }

  const typeLabel = `${r.type}${r.attribute ? ` [${r.attribute}]` : ''}`
  if (r.recruitRevived) {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → FAILURE — -${r.hpLost} HP → REVIVED`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.revived_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.revived_recruit), missionId })
  } else if (!r.success && r.consequence === 'FORCED_DEPARTURE') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → FAILURE — Forced extraction`, missionId })
    entries.push({ tag: '[IA]', message: iaLine(EVENT_PHRASES.abort_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.abort_recruit), missionId })
  } else if (!r.success && r.consequence === 'NO_REWARD') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → FAILURE — no reward`, missionId })
    entries.push({ tag: '[IA]', message: iaLine(EVENT_PHRASES.no_reward_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.no_reward_recruit), missionId })
  } else if (!r.success && r.consequence === 'HP_LOSS') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → FAILURE — -${r.hpLost} HP`, missionId })
    entries.push({ tag: '[IA]', message: iaLine(EVENT_PHRASES.hp_loss_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.hp_loss_recruit), missionId })
  } else if (!r.success && r.consequence === 'SHIP_DAMAGE' && r.shipBroken) {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → FAILURE — ship disabled, forced extraction`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.ship_broken_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.ship_broken_recruit), missionId })
  } else if (!r.success && r.consequence === 'SHIP_DAMAGE' && r.shipAutoRepaired) {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → FAILURE — ship damaged, auto-repaired`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.ship_repaired_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.ship_repaired_recruit), missionId })
  } else if (!r.success && r.consequence === 'SHIP_DAMAGE') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → FAILURE — ship damaged, no reward`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.ship_damage_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.ship_damage_recruit), missionId })
  } else {
    const rewardStr = r.rewardEarned ? ` [+${r.rewardEarned.amount} ${r.rewardEarned.type}]` : ''
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → SUCCESS${rewardStr}`, missionId })
    entries.push({ tag: '[IA]', message: iaLine(EVENT_PHRASES.success_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.success_recruit), missionId })
  }

  return { mission: entries, global: [] }
}

// --- Auto-battle combat logs ---

// Summarizes one attack within a combat round into a short clause. Combat
// rounds only ever produce [SYS] log lines (see buildCombatRoundLog), so this
// intentionally carries no [IA]/recruit flavor of its own.
function summarizeCombatEntry(entry) {
  if (entry.actor === 'crew') {
    return entry.hit
      ? `${entry.actorName} (${entry.attribute}) hits Hostiles for ${entry.damage} (${entry.enemyHpAfter} HP left)`
      : `${entry.actorName} (${entry.attribute}) misses Hostiles`
  }

  if (!entry.hit) return `Hostiles miss ${entry.targetName}`
  if (entry.revived) return `Hostiles hit ${entry.targetName} for ${entry.damage} — revived by nanites`
  if (entry.died) return `Hostiles hit ${entry.targetName} for ${entry.damage} — KILLED IN ACTION`
  if (entry.downed) return `Hostiles hit ${entry.targetName} for ${entry.damage} — down, max HP -1`
  return `Hostiles hit ${entry.targetName} for ${entry.damage} (${entry.targetHpAfter} HP left)`
}

// One [SYS]-only log line per combat round (a round is ~6s of game time),
// deliberately throttled — no [IA]/recruit banter mid-fight.
function buildCombatRoundLog({ round, missionId }) {
  const summary = round.entries.map(summarizeCombatEntry).join(' · ')
  return { tag: '[SYS]', message: `Round ${round.round} — ${summary}`, missionId }
}

// The final [SYS]/[IA]/[RECRUIT] summary once a COMBAT event's auto-battle
// concludes, mirroring the shape of buildEventResultLogs for every other
// event type.
function buildCombatEventLogs({ context, event, combatResult }) {
  const { missionId, missionName, crew } = context
  const won = combatResult.enemyDefeated
  const deadThisFight = combatResult.crewResults.filter(r => r.status === 'dead')
  const survivors = crew.filter(c => !deadThisFight.some(d => String(d.id) === String(c.id)))

  const rewardStr = won && event.reward ? ` [+${event.reward.amount} ${event.reward.type}]` : ''
  const entries = [
    {
      tag: '[SYS]',
      message: `${event.type} — ${won ? 'VICTORY' : 'DEFEAT'} vs Hostiles (${combatResult.rounds.length} round${combatResult.rounds.length === 1 ? '' : 's'})${rewardStr}`,
      missionId,
    },
    { tag: '[IA]', message: pick(won ? EVENT_PHRASES.combat_won_ia : EVENT_PHRASES.combat_lost_ia), missionId },
  ]

  const spokesperson = survivors.length > 0 ? pick(survivors) : null
  if (spokesperson) {
    entries.push({
      tag: `[${spokesperson.name.toUpperCase()}]`,
      message: `"${pick(won ? EVENT_PHRASES.combat_won_recruit : EVENT_PHRASES.combat_lost_recruit)}"`,
      missionId,
    })
  }

  const global = []
  for (const dead of deadThisFight) {
    const recruit = crew.find(c => String(c.id) === String(dead.id))
    const name = recruit?.name ?? 'A recruit'
    entries.push({ tag: `[${name.toUpperCase()}]`, message: `"${pick(EVENT_PHRASES.last_words)}"`, missionId })
    global.push({ tag: '[SYS]', message: `${name} died during mission "${missionName}".` })
  }

  return { mission: entries, global }
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
    return require(path.join(DATA_DIR, 'banter', 'pairs.json'))
  } catch {
    return []
  }
}

function loadPersonalityPairs() {
  try {
    return require(path.join(DATA_DIR, 'banter', 'personality-pairs.json'))
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
/**
 * If the chosen entry defines tag-flavored variants (entry.tagLines: { [planetTag]: { lines, reply } })
 * and the planet has a matching tag, prefer those over the entry's generic lines/reply — mirroring
 * pickPlanetTagQuote's "collect matches, then pick one at random" pattern. Falls back to entry.lines/
 * entry.reply when there's no planet, no tags, or entry.tagLines has no matching (non-empty) tag.
 */
function pickTagFlavoredContent(entry, tags) {
  if (Array.isArray(tags) && tags.length > 0 && entry.tagLines) {
    const matches = tags.filter(tag => (
      Array.isArray(entry.tagLines[tag]?.lines) && entry.tagLines[tag].lines.length > 0 &&
      Array.isArray(entry.tagLines[tag]?.reply) && entry.tagLines[tag].reply.length > 0
    ))
    if (matches.length > 0) {
      const tag = matches[Math.floor(Math.random() * matches.length)]
      return entry.tagLines[tag]
    }
  }
  return { lines: entry.lines, reply: entry.reply }
}

async function buildBanterLog(client, playerId, context) {
  const { missionId, crew, planet } = context
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
  const { lines, reply: replyLines } = pickTagFlavoredContent(entry, planet?.tags)
  const line = pick(lines).replace(/\{A\}/g, A.name).replace(/\{B\}/g, B.name)
  const reply = pick(replyLines).replace(/\{A\}/g, A.name).replace(/\{B\}/g, B.name)

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
  buildCombatRoundLog,
  buildCombatEventLogs,
}
