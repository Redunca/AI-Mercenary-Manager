-- Pairwise recruit relationship score. A flat running counter, like
-- players.tokens (see V014's own comment): there's no need to reconstruct a
-- history of individual relationship swings, only the current standing
-- between two recruits. Rows are created lazily on first adjustment, not
-- pre-seeded for every possible pair.
--
-- recruits' primary key is the composite (player_id, id) -- not id alone --
-- so both sides need a composite FK, same as equipment's
-- assigned_to_recruit_id (V016). recruit_a_id is always the smaller id
-- (enforced by the CHECK); relationship.service.js normalizes pair order on
-- every read and write via domain/relationship.js's orderPair, so no caller
-- has to track which side is which. recruits are only ever soft-deleted
-- (deleted_at, see recruit.service.js's fireRecruit) and never hard-deleted,
-- so the default RESTRICT on the composite FKs is fine -- no ON DELETE
-- CASCADE needed there.
CREATE TABLE IF NOT EXISTS recruit_relationships (
  player_id     INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recruit_a_id  INT NOT NULL,
  recruit_b_id  INT NOT NULL,
  score         INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, recruit_a_id, recruit_b_id),
  FOREIGN KEY (player_id, recruit_a_id) REFERENCES recruits(player_id, id),
  FOREIGN KEY (player_id, recruit_b_id) REFERENCES recruits(player_id, id),
  CHECK (recruit_a_id < recruit_b_id)
);

CREATE INDEX IF NOT EXISTS idx_recruit_relationships_player ON recruit_relationships(player_id);
