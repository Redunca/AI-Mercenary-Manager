-- Lets the hospital also heal a recruit's permanent injury (the gap between
-- max_hp and original_max_hp left by a combat downing -- see combat.js),
-- on its own slower clock, independent of temp-HP healing. Rate is grown by
-- the new "Long-Term Ward Care" self-upgrade (see upgrades.json).
ALTER TABLE players ADD COLUMN IF NOT EXISTS permanent_heal_interval_ms INT NOT NULL DEFAULT 300000;
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS last_permanent_heal_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
