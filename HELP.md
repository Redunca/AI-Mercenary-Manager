# Commandes disponibles

## Navigation

| Commande              | Description                                      |
|-----------------------|--------------------------------------------------|
| `home`                | Ouvre le dashboard (vue globale)                 |
| `split-h`             | Divise le panel courant horizontalement          |
| `split-v`             | Divise le panel courant verticalement            |
| `close`               | Ferme le panel courant                           |
| `focus <id>`          | Donne le focus au panel numéro `<id>`            |
| `focus left/right/up/down` | Navigation directionnelle entre panels      |
| `help`                | Affiche cette aide                               |

## Recrues

| Commande                  | Description                                             |
|---------------------------|---------------------------------------------------------|
| `recruit list`            | Liste des recrues avec statut                           |
| `recruit detail <id>`     | Détail d'une recrue : stats PHY / MEN / SOC             |
| `rename <nom>`            | *(panel recruit-detail)* Renomme la recrue              |
| `detail <id>`             | *(panel recruit-list)* Raccourci vers le détail         |

## Missions

| Commande                          | Description                                          |
|-----------------------------------|------------------------------------------------------|
| `mission list`                    | Liste des missions avec statut et progression        |
| `mission detail <id>`             | Détail d'une mission : phase et barre de progression |
| `mission start <missionId> <recruitId>` | Lance une mission avec une recrue              |
| `mission stop <missionId>`        | Annule une mission et remet la recrue disponible     |
| `mission logs <id>`               | Logs détaillés d'une mission                         |
| `stop`                            | *(panel mission-detail)* Déclenche un retour forcé   |
| `detail <id>`                     | *(panel mission-list)* Raccourci vers le détail      |

## Logs

| Commande        | Description                                                   |
|-----------------|---------------------------------------------------------------|
| `logs`          | Log global : lancements et fins de mission                    |
| `mission logs <id>` | Logs détaillés d'une mission ([SYS] / [IA] / [RECRUE])   |
