# Ship System Specification

## Overview
Ships replace the old “send recruit to mission” flow. Missions are now executed by ships with assigned crews. Ships have stats, rarity, inventory, and durability. The hangar limits how many ships the AI can own.

## Ship Entity
- `name`: pseudo‑generated
- `galactic_id`: unique identifier
- `rarity`: hidden, influences stat ranges
- `stats`:
  - `speed`
  - `capacity` (max recruits)
  - `inventory_space`
  - `durability`
  - `price`
- `crew`: list of recruit IDs
- `equipment`: list of item IDs
- `status`: docked / in_mission / destroyed

## Hangar System
- `hangar_size`: max number of ships
- `docking_stations`: each station has a `capacity` (max crew per ship)

## Mission Dispatch
1. Select ship
2. Validate crew count ≤ docking station capacity
3. Validate ship status = docked
4. Send ship to mission

## Mission Travel Time
`effective_travel_time = base_time / ship.speed`

## Mission Event Resolution
- For each event, the recruit with the highest relevant stat rolls.
- If recommended equipment is present:
  - Equipment is consumed
  - Crew gains Advantage 1

## Mission Outcomes
### Crew Death
- If all crew die:
  - Ship autopilots home
  - Mission ends
  - No loot
  - Ship survives

### Ship Destruction
- If durability reaches 0:
  - Ship is destroyed
  - Mission fails
  - Remaining crew survive
  - Crew returns home via taxi shuttle
  - All ship equipment is lost

## Free Starter Ship
If no ship exists, a basic free ship is granted automatically.

