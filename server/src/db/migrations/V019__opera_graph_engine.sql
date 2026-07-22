-- Replaces the old linear/checklist Opera engine's storage with an
-- instance-per-playthrough model driven by Opera Forge's OGL graph format
-- (see server/src/domain/operaGraph.js). The same template can now be
-- instantiated repeatedly across many concurrent "slots" instead of one
-- singleton row per definition id, so (player_id, opera_id) is no longer a
-- meaningful key -- state.currentNodeId/log/etc. replace the old step-
-- completion ledger entirely (a walk position, not a checklist).
DROP TABLE IF EXISTS opera_step_progress;
DROP TABLE IF EXISTS opera_instances;

CREATE TABLE opera_instances (
  id           SERIAL PRIMARY KEY,
  player_id    INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  template_id  TEXT NOT NULL,
  slot_index   INT,
  status       TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  state        JSONB NOT NULL DEFAULT '{}',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_opera_instances_player ON opera_instances(player_id);

-- At most one in-progress instance per pooled slot...
CREATE UNIQUE INDEX idx_opera_instances_slot ON opera_instances(player_id, slot_index)
  WHERE status = 'in_progress' AND slot_index IS NOT NULL;
-- ...and at most one in-progress instance of a singleton (slot_index IS NULL)
-- template, e.g. the tutorial -- see operaGraph.js's "special-cased by id"
-- comment for why this stays id-based rather than a schema flag.
CREATE UNIQUE INDEX idx_opera_instances_singleton ON opera_instances(player_id, template_id)
  WHERE status = 'in_progress' AND slot_index IS NULL;

-- players.opera_id column on log_entries already exists (V017) and keeps
-- its TEXT type -- it now holds the stringified opera_instances.id instead
-- of a literal definition id like "tutorial".

-- Concurrent-opera slot cap, grown by the "Concurrent Operas" self-upgrade
-- (server/data/upgrades.json, appliesTo players.opera_slot_capacity).
-- Defaults to 3 like every other upgrade's baseValue/column-default pair
-- (e.g. max_recruits DEFAULT 5 next to Recruit Bay Expansion's baseValue 5)
-- -- what actually gates slots from filling before the tutorial is done is
-- OperaService.maintainOperaSlots checking the tutorial instance's status,
-- not this value.
ALTER TABLE players ADD COLUMN IF NOT EXISTS opera_slot_capacity INT NOT NULL DEFAULT 3;

-- Tags an opera-injected mission (from a 'mission' node or a 'seed' node's
-- mission target) so generateMissionBatch()'s unstarted-template sweep in
-- game.service.js never discards it out from under a paused opera walk.
ALTER TABLE mission_templates ADD COLUMN IF NOT EXISTS opera_instance_id INT
  REFERENCES opera_instances(id) ON DELETE SET NULL;
