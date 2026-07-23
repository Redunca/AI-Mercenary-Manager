-- Candidate list refresh moves from a manual "refresh" command to the same
-- lazy, wall-clock-aligned batch refresh missions (V012) and the shop (V013)
-- already use, plus a self-upgrade to shorten the interval (see V015,
-- self.service.js). Base interval is 5 minutes, shortenable in 30-second
-- steps down to a 1-minute floor by the "Candidate Refresh Accelerator"
-- upgrade.
ALTER TABLE players ADD COLUMN IF NOT EXISTS candidate_refresh_at TIMESTAMPTZ;
ALTER TABLE players ADD COLUMN IF NOT EXISTS candidate_refresh_interval_ms INT NOT NULL DEFAULT 300000;
