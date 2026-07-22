-- Soft-delete for recruits, mirroring ships.deleted_at (see ship.service.js)
-- -- backs the new "fire_recruit" opera action (previously a documented gap,
-- see opera-forge/server/src/domain/graph.js's ACTION_TYPES comment). Every
-- recruit-read query that matters for gameplay eligibility filters this out
-- the same way ship queries already do.
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Set when a 'candidate' seed node injects a specific candidate into the
-- hire pool, carrying the opera author's own chosen seedId string so a
-- later hire_recruit action_performed condition matching {seedId} can be
-- resolved (see operaGraph.js's seed-key resolution).
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS seed_key TEXT;
