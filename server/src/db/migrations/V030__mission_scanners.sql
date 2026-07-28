-- Self-upgrades that unlock pre-commitment mission intel (see
-- server/data/upgrades.json ids 12-15). Modeled as the existing generic
-- counter-upgrade shape (baseValue 0, increment 1, maxValue 1) rather than a
-- new upgrade type -- a single purchase just moves tier/currentValue from 0
-- to 1, which self.service.js's existing tier math already handles.
ALTER TABLE players ADD COLUMN IF NOT EXISTS has_difficulty_scanner INT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS has_duration_scanner INT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS has_combat_scanner INT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS has_skill_check_scanner INT NOT NULL DEFAULT 0;
