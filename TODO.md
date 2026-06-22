# TODO — MVP Base du jeu

## Issues terminées ✅

Ces issues peuvent être marquées comme fermées.

| Issue | Notes |
|---|---|
| Initialisation du frontend Angular (UI console-like) | Thème console, composants, layout tmux-like |
| Modèle de recrue | Interface `Recruit` avec `id`, `name`, `stats` (PHY/MEN/SOC à 0/3/5) |
| Structure de mission : avant → événement → retour | Phases EN_ROUTE → EVENEMENT → RETOUR → TERMINEE avec timer |
| Lancement d'une mission | Commande `mission start <id> <recruitId>`, garde contre recrue déjà en mission |
| Suivi des missions en cours | Barre ASCII + phase dans MissionDetail et Dashboard |
| Logs narratifs (IA + recrues) | Pool aléatoire par phase, voix [IA] et [RECRUE] |
| Interface console-like : dashboard | Vue globale avec compteurs, missions actives, recrues disponibles |
| Interface console-like : recrues | Liste (statut Available/In Mission) + détail avec barres de stats |
| Interface console-like : missions disponibles | Tableau avec statut, progression, recrue assignée |
| Interface console-like : missions en cours | Panel MissionDetail avec barre ASCII et phases |
| Interface console-like : logs | Log global (start/end) + logs détaillés par mission |

---

## Issues partiellement complètes ⚠️

Ces issues ont une base fonctionnelle en frontend mais nécessitent un vrai backend pour être considérées closes.

| Issue | Ce qui manque |
|---|---|
| Logs techniques | Les logs [SYS] existent mais ne détaillent pas les jets de dés (car les jets n'existent pas encore) |
| Initialisation du backend Node.js | Le projet Express existe (`server/index.js`) mais n'a aucune route — à connecter quand la DB est prête |

---

## Prochaines étapes par bloc

### Bloc 1 — Système de jeu (logique pure, frontend)
Ces trois issues forment un bloc indépendant qui peut être fait sans backend.

1. **Système de jets : table des dés**
   - Définir la correspondance stat → nombre de dés (ex. stat 0 = 0d6, stat 5 = 2d6, stat 10 = 3d6)
   - Implémenter `rollDice(stat: number): number` dans un service dédié

2. **Système de jets : résolution**
   - À la phase EVENEMENT : lancer `1d20 + rollDice(stat)` et comparer au DC de la mission
   - Stocker le résultat dans `MissionState`
   - Ajouter le DC et la stat utilisée au modèle Mission

3. **Mort / survie des recrues**
   - Si jet < DC : marquer la recrue comme morte dans `GameService`
   - Émettre un log [SYS] de mort et un log [RECRUE] de dernière parole
   - Empêcher une recrue morte d'être assignée à une nouvelle mission

### Bloc 2 — Recrues dynamiques (frontend)
Dépend du Bloc 1 pour l'état (mort/vivant).

4. **Génération de candidats**
   - Générer N candidats avec des noms aléatoires et stats (0, 3, 5 réparties aléatoirement)
   - Commande `candidate list` + panel CandidateList

5. **Interface console-like : candidats**
   - Panel d'affichage des candidats disponibles avec leurs stats

6. **Recrutement de recrues**
   - Commande `recruit hire <candidateId>` : transfère le candidat dans la liste des recrues

### Bloc 3 — Backend et persistance
Dépend des Blocs 1 et 2 pour connaître le schéma final.

7. **Schéma PostgreSQL minimal**
   - Tables : `recruits`, `missions_active`, `missions_logs`, `config`
   - Migrations versionnées

8. **Système de temps réel : stockage du timestamp**
   - Stocker `last_updated_at` par session/joueur en base

9. **Système de temps réel : calcul du delta**
   - Au chargement : calculer `Date.now() - last_updated_at`

10. **Système de temps réel : rattrapage du temps**
    - Rejouer les ticks manquants pour les missions en cours au retour du joueur

11. **Routes backend Node.js**
    - `GET /state` : état complet (recrues, missions, logs)
    - `POST /mission/start`, `POST /mission/stop`
    - `GET /missions/:id/logs`

### Bloc 4 — DevOps
À faire en dernier, quand le backend est fonctionnel.

12. **Lecture des missions depuis config.json**
    - Déplacer les missions hardcodées vers `server/config.json`
    - Route `GET /config/missions` consommée par le frontend

13. **Containerisation avec Podman**
    - Podmanfile multi-stage pour frontend et backend
    - Exposition des ports configurables via `.env`
