-- Mission templates used to be seeded once as a fixed pool of 25 (see
-- seedMissionTemplates / SEED_DIFFICULTIES), truncated down to 5 "visible"
-- ones. They're now generated in batches of 5 on a wall-clock-aligned
-- 15-minute cycle, and any never-started template from the previous batch
-- is discarded when a new one is generated. Templates that were started (in
-- progress, succeeded, or failed) persist forever regardless of batching.
--
-- Because templates now persist forever, ids can no longer be reset/reused
-- the way refreshCandidates resets next_candidate_id back to 1 — we need a
-- monotonically increasing counter, mirroring next_recruit_id /
-- next_candidate_id / next_ship_id.
--
-- Note: mission_templates has no player_id column (it's a single global
-- pool — the game currently only ever has one player). This counter and
-- the refresh timestamps below live on players purely for consistency with
-- the other next_*_id counters; they aren't meant to imply per-player
-- mission pools.
ALTER TABLE players ADD COLUMN IF NOT EXISTS next_template_id INT NOT NULL DEFAULT 1;

-- Existing environments may already have templates seeded 1..N; make sure
-- the counter starts after whatever is already there instead of colliding
-- with existing ids.
UPDATE players SET next_template_id = COALESCE((SELECT MAX(id) FROM mission_templates), 0) + 1;

-- Mission and shop refresh clocks are tracked independently, even though
-- they currently share the same 15-minute interval, because they'll be
-- tunable independently later. shop_refresh_at is added here for schema
-- parity but is not read or written anywhere yet — shop refresh logic is
-- out of scope for this change and will be wired up separately.
ALTER TABLE players ADD COLUMN IF NOT EXISTS mission_refresh_at TIMESTAMPTZ;
ALTER TABLE players ADD COLUMN IF NOT EXISTS shop_refresh_at TIMESTAMPTZ;
