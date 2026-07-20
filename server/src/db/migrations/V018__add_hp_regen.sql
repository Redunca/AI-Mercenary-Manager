-- Passive HP regeneration for recruits not currently on a mission (or
-- dead): +1 HP per players.hp_regen_interval_ms tick, computed lazily at
-- sync time (see game.service.js's regenerateRecruits()), mirroring how
-- mission/shop refreshes are computed lazily rather than via a background
-- scheduler. Base rate is 1/minute; the "Medbay Regeneration" self-upgrade
-- (see V015 for the same baseValueMs/decrementMs/floorMs pattern used by
-- the refresh-speed upgrades) speeds it up toward a floor of 1/10s in -5s
-- steps.
ALTER TABLE players ADD COLUMN IF NOT EXISTS hp_regen_interval_ms INT NOT NULL DEFAULT 60000;

-- Per-recruit clock for the above. Reset to NOW() on every status change
-- (see setRecruitStatus in game.service.js), so a mission's elapsed
-- wall-clock time is never retroactively credited as regen the instant a
-- recruit returns.
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS last_hp_regen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
