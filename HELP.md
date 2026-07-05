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

## Recrutement

| Commande                    | Description                                                    |
|-----------------------------|----------------------------------------------------------------|
| `candidate list`            | Liste des candidats disponibles au recrutement                 |
| `candidate detail <id>`     | Détail d'un candidat : stats, personnalité, perks/flaws        |
| `recruit hire <id>`         | Recrute un candidat par son ID                                 |
| `refresh`                   | *(panel candidate-list)* Génère de nouveaux candidats          |
| `hire`                      | *(panel candidate-detail)* Recrute ce candidat                 |
| `detail <id>`               | *(panel candidate-list)* Raccourci vers le détail              |

## Recrues

| Commande                  | Description                                             |
|---------------------------|---------------------------------------------------------|
| `recruit list`            | Liste des recrues avec statut                           |
| `recruit detail <id>`     | Détail d'une recrue : stats PHY / MEN / SOC             |
| `rename <nom>`            | *(panel recruit-detail)* Renomme la recrue              |
| `detail <id>`             | *(panel recruit-list)* Raccourci vers le détail         |

## Navires

| Commande                      | Description                                              |
|-------------------------------|----------------------------------------------------------|
| `ship list`                   | Liste des navires avec statut (amarré/en mission)       |
| `ship detail <id>`            | Détail d'un navire : stats, équipage, équipement        |
| `ship assign <shipId> <recruitId>` | *(panel ship-detail)* Assigne une recrue à l'équipage   |
| `ship unassign <shipId> <recruitId>` | *(panel ship-detail)* Retire une recrue de l'équipage   |
| `ship rename <shipId> <nom>`  | *(panel ship-detail)* Renomme le navire                 |
| `detail <id>`                 | *(panel ship-list)* Raccourci vers le détail            |

## Équipement

| Commande                           | Description                                               |
|------------------------------------|-----------------------------------------------------------|
| `equipment list`                   | Liste de l'équipement en inventaire                       |
| `equipment detail <id>`            | Détail d'un équipement : effet, rareté, prix             |
| `equipment assign <equipmentId> <shipId>` | *(panel equipment-detail)* Assigne à un navire           |
| `equipment unassign <equipmentId>`  | *(panel equipment-detail)* Retire du navire assigné       |
| `detail <id>`                      | *(panel equipment-list)* Raccourci vers le détail        |

## Boutique

| Commande                    | Description                                          |
|-----------------------------|------------------------------------------------------|
| `shop list`                 | Liste des navires et équipements disponibles à l'achat |
| `shop detail <id>`          | Détail d'un article : prix, stats, description       |
| `shop buy <id>`             | *(panel shop-detail)* Achète un navire ou équipement |
| `wallet`                    | Affiche le solde crédit courant                       |
| `detail <id>`               | *(panel shop-list)* Raccourci vers le détail         |

## Missions

| Commande                            | Description                                          |
|-------------------------------------|------------------------------------------------------|
| `mission list`                      | Liste des missions avec statut et progression        |
| `mission detail <id>`               | Détail d'une mission : phase et barre de progression |
| `mission start <missionId> <shipId>` | Lance une mission avec un navire                    |
| `mission stop <missionId>`          | Annule une mission et remet l'équipage disponible    |
| `mission logs <id>`                 | Logs détaillés d'une mission                         |
| `stop`                              | *(panel mission-detail)* Déclenche un retour forcé   |
| `detail <id>`                       | *(panel mission-list)* Raccourci vers le détail      |

## Logs

| Commande        | Description                                                   |
|-----------------|---------------------------------------------------------------|
| `logs`          | Log global : lancements et fins de mission                    |
| `mission logs <id>` | Logs détaillés d'une mission ([SYS] / [IA] / [RECRUE])   |
