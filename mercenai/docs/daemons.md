# Daemon Automation System

## Overview
Daemons automate gameplay tasks. Each daemon has a set of rights defining what it can do. Daemons specialize based on the rights assigned to them.

## Daemon Entity
- `name`
- `assigned_ship_id`
- `rights`: list of capabilities
- `directives`: optional rules guiding decisions

## Rights Catalogue

### Crew Management Rights
- Auto‑recruit to fill ship.
- Recruit with directives:
  - Stat priorities
  - Personality preferences
  - Perk/flaw preferences

### Item Management Rights
- Auto‑buy items.
- Buy items with directives:
  - Mission type synergy
  - Risk mitigation
  - Equipment combos

### Ship Management Rights
- Buy ships.
- Prefer ships with specific stat profiles:
  - Speed
  - Inventory space
  - Durability
  - Crew capacity

### Mission Automation Rights
- Auto‑send ship on missions.
- Choose missions using directives:
  - Highest reward
  - Lowest risk
  - Shortest travel time
  - Specific event types

## Daemon Specialization Examples
- **Crewmaster Daemon**: crew management only.
- **Quartermaster Daemon**: item management only.
- **Fleet Architect Daemon**: ship purchasing and stat optimization.
- **Strategist Daemon**: mission selection and dispatch.
- **Full‑Stack Daemon**: all rights enabled.

## Execution Rules
- A daemon acts only when its assigned ship is docked.
- Daemon actions may be limited by AI upgrades.
- Daemon decisions follow directives when present; otherwise default heuristics.

