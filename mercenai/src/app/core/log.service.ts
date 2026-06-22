import { inject, Injectable } from '@angular/core';
import { EventResult, MissionPhase } from '../models/mission';
import { LogEntry } from '../models/log';
import { MissionService } from './mission.service';
import { GameService } from './game.service';

const POOL: Record<MissionPhase, { sys: string[]; ia: string[]; recruit: string[] }> = {
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
};

const POOL_FAILED: Partial<Record<MissionPhase, { sys: string[]; ia: string[] }>> = {
  RETOUR: {
    sys: ["Extraction d'urgence. Mission avortée.", "Retour précipité. Objectif non atteint."],
    ia: ["Protocole d'extraction activé.", "Échec opérationnel. Analyse des causes en cours."],
  },
  TERMINEE: {
    sys: ["Mission échouée. Unité rentrée à la base.", "Opération avortée."],
    ia: ["Bilan négatif. Aucun objectif atteint.", "Debriefing d'échec programmé."],
  },
};

const EVENT_PHRASES = {
  success_ia: [
    "Objectif intermédiaire validé.", "Résultat conforme aux projections.", "Exécution nominale.",
  ],
  success_recruit: [
    "Trop facile.", "Je savais que j'allais y arriver.", "On continue ?",
  ],
  hp_loss_ia: [
    "Dommages enregistrés. Recrue toujours opérationnelle.",
    "Blessure non critique. Mission maintenue.",
  ],
  hp_loss_recruit: [
    "Ça fait mal mais je tiens.", "J'ai pris cher.", "Ce n'est qu'une égratignure.",
  ],
  abort_ia: [
    "Protocole d'extraction activé. Mission avortée.",
    "Situation incontrôlable. Retrait immédiat.",
  ],
  abort_recruit: [
    "On fout le camp !", "C'est trop chaud, on se barre.", "J'ai pas signé pour ça.",
  ],
  no_reward_ia: [
    "Objectif non atteint. Aucune rémunération versée.", "Contrat non honoré. Mission close sans paiement.",
  ],
  no_reward_recruit: [
    "On rentre les mains vides.", "J'ai fait de mon mieux.", "Pas de crédit, mais on est entiers.",
  ],
  death_ia: [
    "Signal vital perdu. Recrue neutralisée.", "Perte confirmée. Enregistrement du dossier.",
  ],
  last_words: [
    "Transmettez mes salutations à personne.", "J'aurais dû demander une prime plus élevée.",
    "...", "Je savais que ça finirait comme ça.", "Prenez soin du reste de l'équipe.",
  ],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatRoll(r: EventResult): string {
  const bonus = r.bonus > 0 ? ` + ${r.diceNotation ?? ''}(${r.bonus})` : '';
  return `1d20(${r.d20})${bonus} = ${r.total} vs DC ${r.dc}`;
}

@Injectable({ providedIn: 'root' })
export class LogService {
  missionService = inject(MissionService);
  game = inject(GameService);

  globalLogs: LogEntry[] = [];
  missionLogs: Record<number, LogEntry[]> = {};

  constructor() {
    // Logs narratifs de phase (EN_ROUTE, EVENEMENT annonce, RETOUR, TERMINEE)
    this.missionService.logEvents$.subscribe(event => {
      const recruitName = this.game.getRecruit(String(event.recruitId))?.name ?? String(event.recruitId);
      const failedPool = event.failed ? POOL_FAILED[event.phase] : null;
      const pool = POOL[event.phase];

      const sys = failedPool?.sys ? pick(failedPool.sys) : pick(pool.sys);
      const ia  = failedPool?.ia  ? pick(failedPool.ia)  : pick(pool.ia);

      const entries: LogEntry[] = [
        { tag: '[SYS]', message: sys, missionId: event.missionId },
        { tag: '[IA]',  message: ia,  missionId: event.missionId },
      ];

      // Message recrue uniquement sur EN_ROUTE et EVENEMENT
      if (event.phase === 'EN_ROUTE' || event.phase === 'EVENEMENT') {
        entries.push({
          tag: `[${recruitName.toUpperCase()}]`,
          message: `"${pick(pool.recruit)}"`,
          missionId: event.missionId,
        });
      }

      if (!this.missionLogs[event.missionId]) this.missionLogs[event.missionId] = [];
      this.missionLogs[event.missionId].push(...entries);

      if (event.phase === 'EN_ROUTE') {
        this.globalLogs.push({
          tag: '[SYS]',
          message: `Mission "${event.missionName}" lancée — Recrue : ${recruitName}`,
        });
      }
      if (event.phase === 'TERMINEE') {
        const outcome = event.failed ? 'ÉCHEC' : event.rewardForfeited ? 'SANS RÉCOMPENSE' : 'SUCCÈS';
        this.globalLogs.push({
          tag: '[SYS]',
          message: `Mission "${event.missionName}" terminée [${outcome}] — Recrue : ${recruitName}`,
        });
      }
    });

    // Logs détaillés des résultats de jets
    this.missionService.eventResults$.subscribe(event => {
      const recruitName = this.game.getRecruit(String(event.recruitId))?.name ?? String(event.recruitId);
      const r = event.eventResult;
      const rollStr = formatRoll(r);
      const entries: LogEntry[] = [];

      if (r.recruitDied) {
        entries.push({ tag: '[SYS]', message: `${r.type} — ${rollStr} → MORT AU COMBAT`, missionId: event.missionId });
        entries.push({ tag: '[IA]',  message: pick(EVENT_PHRASES.death_ia), missionId: event.missionId });
        entries.push({ tag: `[${recruitName.toUpperCase()}]`, message: `"${pick(EVENT_PHRASES.last_words)}"`, missionId: event.missionId });
        this.globalLogs.push({ tag: '[SYS]', message: `${recruitName} est mort(e) au cours de la mission "${event.missionName}".` });
      } else if (!r.success && r.consequence === 'FORCED_DEPARTURE') {
        entries.push({ tag: '[SYS]', message: `${r.type} — ${rollStr} → ÉCHEC — Extraction forcée`, missionId: event.missionId });
        entries.push({ tag: '[IA]',  message: pick(EVENT_PHRASES.abort_ia), missionId: event.missionId });
        entries.push({ tag: `[${recruitName.toUpperCase()}]`, message: `"${pick(EVENT_PHRASES.abort_recruit)}"`, missionId: event.missionId });
      } else if (!r.success && r.consequence === 'NO_REWARD') {
        entries.push({ tag: '[SYS]', message: `${r.type} — ${rollStr} → ÉCHEC — aucune récompense`, missionId: event.missionId });
        entries.push({ tag: '[IA]',  message: pick(EVENT_PHRASES.no_reward_ia), missionId: event.missionId });
        entries.push({ tag: `[${recruitName.toUpperCase()}]`, message: `"${pick(EVENT_PHRASES.no_reward_recruit)}"`, missionId: event.missionId });
      } else if (!r.success && r.consequence === 'HP_LOSS') {
        entries.push({ tag: '[SYS]', message: `${r.type} — ${rollStr} → ÉCHEC — -${r.hpLost} PV`, missionId: event.missionId });
        entries.push({ tag: '[IA]',  message: pick(EVENT_PHRASES.hp_loss_ia), missionId: event.missionId });
        entries.push({ tag: `[${recruitName.toUpperCase()}]`, message: `"${pick(EVENT_PHRASES.hp_loss_recruit)}"`, missionId: event.missionId });
      } else {
        const rewardStr = r.rewardEarned ? ` [+${r.rewardEarned.amount} ${r.rewardEarned.type}]` : '';
        entries.push({ tag: '[SYS]', message: `${r.type} — ${rollStr} → SUCCÈS${rewardStr}`, missionId: event.missionId });
        entries.push({ tag: '[IA]',  message: pick(EVENT_PHRASES.success_ia), missionId: event.missionId });
        entries.push({ tag: `[${recruitName.toUpperCase()}]`, message: `"${pick(EVENT_PHRASES.success_recruit)}"`, missionId: event.missionId });
      }

      if (!this.missionLogs[event.missionId]) this.missionLogs[event.missionId] = [];
      this.missionLogs[event.missionId].push(...entries);
    });
  }
}
