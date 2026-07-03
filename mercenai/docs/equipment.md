# Equipment & Inventory System

## Overview
Ships can carry equipment. Equipment is consumed when used during mission events. Equipment cannot be shared between ships.

## Equipment Entity
- `name`
- `type`
- `price`
- `recommended_event_tags`: list of tags that match mission events

## Inventory Rules
- Equipment is assigned to a single ship.
- Equipment cannot be bound to multiple ships.
- All equipment is consumable.
- If a ship is destroyed, all equipment on board is lost.

## Shop System
- AI can purchase equipment using credits.
- Purchased equipment is added to the global inventory.
- Equipment must be manually assigned to a ship (unless automated by a daemon).

## Mission Integration
- Events have hidden recommended equipment.
- If the ship carries matching equipment:
  - Equipment is consumed
  - Crew gains Advantage 1 on the roll

## Credit Rewards
Mission rewards credit the AI account.

