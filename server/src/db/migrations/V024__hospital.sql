-- Replaces passive "heal everywhere" HP regen with a hospital recruits must
-- be manually assigned to (see hospital.service.js). Renaming rather than
-- adding fresh columns: the old regen mechanism's rate/clock become the
-- hospital's rate/clock (the "Medbay Regeneration" self-upgrade is
-- repurposed to target the renamed column too -- see upgrades.json).
ALTER TABLE players RENAME COLUMN hp_regen_interval_ms TO hospital_heal_interval_ms;
ALTER TABLE recruits RENAME COLUMN last_hp_regen_at TO last_hospital_heal_at;

-- Hospital slot capacity, grown by the new "Hospital Beds" self-upgrade.
-- Occupancy isn't a separate table -- a recruit occupies a slot exactly
-- when recruits.status = 'hospitalized' (a new status value alongside
-- available/in_mission/returning/dead), so capacity is enforced by counting
-- that status against this column (same pattern as docking_stations
-- capacity gating ship ownership).
ALTER TABLE players ADD COLUMN IF NOT EXISTS hospital_slots INT NOT NULL DEFAULT 1;
