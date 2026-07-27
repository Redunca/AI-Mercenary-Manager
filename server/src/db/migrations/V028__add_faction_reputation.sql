-- Which org (if any) a generated mission is done for/against, resolved once
-- at generation time by missionGenerator.js and persisted alongside the
-- other generated fields (name/description/planet) so completeMission can
-- look it up without re-deriving it. NULL for missions with no reputation
-- stake (e.g. an ESCORT on an independent planet whose antagonist is a gang).
ALTER TABLE mission_templates ADD COLUMN IF NOT EXISTS for_faction TEXT;
ALTER TABLE mission_templates ADD COLUMN IF NOT EXISTS against_faction TEXT;

-- Player standing with a faction/corporation. A flat running counter, same
-- convention as recruit_relationships (V026) -- no swing history, rows
-- created lazily on first adjustment. Orgs are identified by name, not a
-- synthetic id: they only ever exist as entity-names.json values, never as
-- rows of their own, so there's nothing else to key on.
CREATE TABLE IF NOT EXISTS faction_reputation (
  player_id     INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  faction_name  TEXT NOT NULL,
  score         INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, faction_name)
);

CREATE INDEX IF NOT EXISTS idx_faction_reputation_player ON faction_reputation(player_id);
