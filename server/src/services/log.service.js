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

function buildPhaseLogs({ phase, failed, rewardForfeited, missionId, missionName, missionDifficulty, recruitName }) {
  const failedPool = failed ? POOL_FAILED[phase] : null
  const pool = POOL[phase]
  const prefix = missionDifficulty ? `[${missionName} · ${missionDifficulty}] ` : `[${missionName}] `
  const entries = [
    { tag: '[SYS]', message: `${prefix}${pick(failedPool?.sys ?? pool.sys)}`, missionId },
    { tag: '[IA]', message: pick(failedPool?.ia ?? pool.ia), missionId },
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

function buildEventResultLogs({ eventResult, missionId, missionName, recruitName, recruitPerks, recruitFlaws, recruitPersonality }) {
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

  if (r.recruitDied) {
    entries.push({ tag: '[SYS]', message: `${r.type}${r.attribute ? ` [${r.attribute}]` : ''} — ${rollStr} → KILLED IN ACTION`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.death_ia), missionId })
    entries.push({ tag, message: `"${pick(EVENT_PHRASES.last_words)}"`, missionId })
    return {
      mission: entries,
      global: [{ tag: '[SYS]', message: `${recruitName} died during mission "${missionName}".` }],
    }
  }

  const typeLabel = `${r.type}${r.attribute ? ` [${r.attribute}]` : ''}`
  if (!r.success && r.consequence === 'FORCED_DEPARTURE') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → FAILURE — Forced extraction`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.abort_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.abort_recruit), missionId })
  } else if (!r.success && r.consequence === 'NO_REWARD') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → FAILURE — no reward`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.no_reward_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.no_reward_recruit), missionId })
  } else if (!r.success && r.consequence === 'HP_LOSS') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → FAILURE — -${r.hpLost} HP`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.hp_loss_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.hp_loss_recruit), missionId })
  } else {
    const rewardStr = r.rewardEarned ? ` [+${r.rewardEarned.amount} ${r.rewardEarned.type}]` : ''
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → SUCCESS${rewardStr}`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.success_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.success_recruit), missionId })
  }

  return { mission: entries, global: [] }
}

module.exports = {
  insertLogEntries,
  buildPhaseLogs,
  buildEventResultLogs,
}
