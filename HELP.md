# Available commands

> The `list` and `detail` sub-commands (recruit, candidate, ship, equipment, shop, mission) also accept the shortcuts `-l` / `--list` and `-d` / `--detail`, e.g. `recruit list` ≡ `recruit -l`.

## Navigation

| Command               | Description                                      |
|-----------------------|--------------------------------------------------|
| `home`                | Opens the dashboard (overview)                   |
| `split-h`             | Splits the current panel horizontally            |
| `split-v`             | Splits the current panel vertically              |
| `close`               | Closes the current panel                         |
| `focus <id>`          | Gives focus to panel number `<id>`               |
| `focus left/right/up/down` | Directional navigation between panels       |
| `help`                | Shows this help                                  |

## Recruitment

| Command                     | Description                                                    |
|------------------------------|----------------------------------------------------------------|
| `candidate list`            | List of candidates available for recruitment                   |
| `candidate detail <id>`     | Detail of a candidate: stats, personality, perks/flaws          |
| `recruit hire <id>`         | Recruits a candidate by their ID                                |
| `refresh`                   | *(candidate-list panel)* Generates new candidates               |
| `hire`                      | *(candidate-detail panel)* Recruits this candidate              |
| `detail <id>`               | *(candidate-list panel)* Shortcut to detail                     |

## Recruits

| Command                   | Description                                              |
|----------------------------|-----------------------------------------------------------|
| `recruit list`            | List of recruits with status                             |
| `recruit detail <id>`     | Detail of a recruit: PHY / MEN / SOC stats                |
| `rename <name>`           | *(recruit-detail panel)* Renames the recruit              |
| `detail <id>`             | *(recruit-list panel)* Shortcut to detail                 |

## Ships

| Command                               | Description                                              |
|-----------------------------------------|------------------------------------------------------------|
| `ship list`                           | List of ships with status (docked/on mission)             |
| `ship detail <id>`                    | Detail of a ship: stats, crew, equipment                  |
| `ship assign <shipId> <recruitId>`    | Assigns a recruit to a ship's crew                         |
| `ship unassign <shipId> <recruitId>`  | Removes a recruit from a ship's crew                       |
| `ship rename <shipId> <name>`         | Renames a ship                                             |
| `detail <id>`                         | *(ship-list panel)* Shortcut to detail                     |
| `assign <recruitId>`                  | *(ship-detail panel)* Assigns a recruit to this ship       |
| `unassign <recruitId>`                | *(ship-detail panel)* Removes a recruit from this ship     |
| `rename <name>`                       | *(ship-detail panel)* Renames this ship                    |

## Equipment

| Command                             | Description                                                |
|---------------------------------------|--------------------------------------------------------------|
| `equipment list`                    | List of equipment in inventory                              |
| `equipment detail <id>`             | Detail of an equipment item: effect, rarity, price           |
| `equipment assign <equipmentId> <shipId>` | Assigns an equipment item to a ship                    |
| `equipment unassign <equipmentId>`  | Removes an equipment item from its ship                      |
| `detail <id>`                       | *(equipment-list panel)* Shortcut to detail                  |
| `assign <shipId>`                   | *(equipment-detail panel)* Assigns this equipment to a ship  |
| `unassign`                          | *(equipment-detail panel)* Removes this equipment from its ship |

## Shop

| Command                     | Description                                            |
|-------------------------------|----------------------------------------------------------|
| `shop list`                 | List of ships and equipment available for purchase       |
| `shop detail <id>`          | Detail of an item: price, stats, description             |
| `shop buy <id>`             | Buys a ship or equipment item (1 unit); fails on sold-out items |
| `wallet`                    | Shows the current credit balance                          |
| `detail <id>`               | *(shop-list panel)* Shortcut to detail                    |
| `buy <id> [quantity]`       | *(shop-list panel)* Buys an item by its ID; blocked if sold out |
| `buy [quantity]`            | *(shop-detail panel)* Buys this item; blocked if sold out  |

## Self

| Command              | Description                                                          |
|------------------------|-----------------------------------------------------------------------|
| `self`               | Opens the self-upgrade panel: capacity/speed upgrades bought with tokens |
| `self buy <id>`      | Buys the next tier of an upgrade by its ID; fails if maxed or tokens are insufficient |
| `buy <id>`           | *(self panel)* Shortcut for `self buy <id>`                          |

## Missions

| Command                              | Description                                          |
|----------------------------------------|----------------------------------------------------------|
| `mission list`                       | List of missions with status and progress             |
| `mission list --completed`           | Full mission history (success/failed); also `mission -c` |
| `mission detail <id>`                | Detail of a mission: phase and progress bar            |
| `mission start <missionId> <shipId>` | Launches a mission with a ship                         |
| `mission stop <missionId>`           | Cancels a mission and frees up the crew                |
| `mission logs <id>`                  | Detailed logs of a mission                             |
| `stop`                               | *(mission-detail panel)* Triggers a forced return      |
| `detail <id>`                        | *(mission-list panel)* Shortcut to detail              |
| `completed`                          | *(mission-list panel)* Shortcut to mission history     |

## Logs

| Command         | Description                                                   |
|-------------------|-----------------------------------------------------------------|
| `logs`          | Global log: mission launches and endings                       |
| `mission logs <id>` | Detailed logs of a mission ([SYS] / [AI] / [RECRUIT])       |
