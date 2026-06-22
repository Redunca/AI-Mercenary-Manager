import { inject, Injectable } from '@angular/core';
import { MissionPhase } from '../models/mission';
import { LogEntry } from '../models/log';
import { MissionService } from './mission.service';
import { GameService } from './game.service';

const POOL: Record<MissionPhase, { sys: string[], ia: string[], recruit: string[] }> = {
  EN_ROUTE: {
    sys: ["Unité en déplacement vers la zone d'opération.", "Départ confirmé. Aucun incident au départ."],
    ia: ["Aucune anomalie détectée.", "Trajectoire nominale. Surveillance active."],
    recruit: ["On est partis dans la mauvaise direction.", "J'ai oublié mes affaires.", "C'est loin ?"]
  },
  EVENEMENT: {
    sys: ["Événement en cours. Issue indéterminée.", "Contact établi avec la zone cible."],
    ia: ["Issue indéterminée. En attente de résolution.", "Probabilité d'échec : non nulle."],
    recruit: ["C'est quoi ce truc ?!", "Personne m'a dit que ça serait comme ça.", "J'ai survécu. Je pense."]
  },
  RETOUR: {
    sys: ["Phase de retour initiée.", "Mission accomplie. Retour en cours."],
    ia: ["Unité en chemin de retour. Résultat nominal.", "Efficacité : acceptable."],
    recruit: ["On rentre enfin.", "J'ai failli mourir mais bon.", "Je veux une prime."]
  },
  TERMINEE: {
    sys: ["Mission terminée. Unité rentrée à la base.", "Objectif atteint."],
    ia: ["Opération conclue. Pertes : nulles.", "Performance dans les paramètres acceptables."],
    recruit: ["On recommence quand ?", "Je vais dormir.", "Quelqu'un a de la nourriture ?"]
  }
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

@Injectable({ providedIn: 'root' })
export class LogService {
  missionService = inject(MissionService);
  game = inject(GameService);

  globalLogs: LogEntry[] = [];
  missionLogs: Record<number, LogEntry[]> = {};

  constructor() {
    this.missionService.logEvents$.subscribe(event => {
      const recruitName = this.game.getRecruit(String(event.recruitId))?.name ?? String(event.recruitId);
      const pool = POOL[event.phase];

      const entries: LogEntry[] = [
        { tag: '[SYS]', message: pick(pool.sys), missionId: event.missionId },
        { tag: '[IA]',  message: pick(pool.ia),  missionId: event.missionId },
        { tag: `[${recruitName.toUpperCase()}]`, message: `"${pick(pool.recruit)}"`, missionId: event.missionId }
      ];

      if (!this.missionLogs[event.missionId]) this.missionLogs[event.missionId] = [];
      this.missionLogs[event.missionId].push(...entries);

      // Log global : uniquement au lancement et à la fin
      if (event.phase === 'EN_ROUTE') {
        this.globalLogs.push({ tag: '[SYS]', message: `Mission "${event.missionName}" lancée — Recrue : ${recruitName}` });
      }
      if (event.phase === 'TERMINEE') {
        this.globalLogs.push({ tag: '[SYS]', message: `Mission "${event.missionName}" terminée — Recrue : ${recruitName}` });
      }
    });
  }
}
