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
    ...(perks ?? []).map(p => slugify(p.name)),
    ...(flaws ?? []).map(f => slugify(f.name)),
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

function buildPhaseLogs({ phase, failed, rewardForfeited, missionId, missionName, missionDifficulty, recruitName }) {
  const failedPool = failed ? POOL_FAILED[phase] : null
  const pool = POOL[phase]
  const prefix = missionDifficulty ? `[${missionName} · ${missionDifficulty}] ` : `[${missionName}] `
  const entries = [
    { tag: '[SYS]', message: `${prefix}${pick(failedPool?.sys ?? pool.sys)}`, missionId },
    { tag: '[IA]', message: pick(failedPool?.ia ?? pool.ia), missionId },
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
    entries.push({ tag: '[SYS]', message: `${r.type}${r.attribute ? ` [${r.attribute}]` : ''} — ${rollStr} → MORT AU COMBAT`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.death_ia), missionId })
    entries.push({ tag, message: `"${pick(EVENT_PHRASES.last_words)}"`, missionId })
    return {
      mission: entries,
      global: [{ tag: '[SYS]', message: `${recruitName} est mort(e) au cours de la mission "${missionName}".` }],
    }
  }

  const typeLabel = `${r.type}${r.attribute ? ` [${r.attribute}]` : ''}`
  if (!r.success && r.consequence === 'FORCED_DEPARTURE') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → ÉCHEC — Extraction forcée`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.abort_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.abort_recruit), missionId })
  } else if (!r.success && r.consequence === 'NO_REWARD') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → ÉCHEC — aucune récompense`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.no_reward_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.no_reward_recruit), missionId })
  } else if (!r.success && r.consequence === 'HP_LOSS') {
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → ÉCHEC — -${r.hpLost} PV`, missionId })
    entries.push({ tag: '[IA]', message: pick(EVENT_PHRASES.hp_loss_ia), missionId })
    entries.push({ tag, message: recruitQuote(EVENT_PHRASES.hp_loss_recruit), missionId })
  } else {
    const rewardStr = r.rewardEarned ? ` [+${r.rewardEarned.amount} ${r.rewardEarned.type}]` : ''
    entries.push({ tag: '[SYS]', message: `${typeLabel} — ${rollStr} → SUCCÈS${rewardStr}`, missionId })
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
