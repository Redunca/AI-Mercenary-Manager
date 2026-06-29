CREATE TABLE IF NOT EXISTS players (
  id              SERIAL PRIMARY KEY,
  display_name    TEXT NOT NULL DEFAULT 'Commander',
  max_recruits    INT NOT NULL DEFAULT 5,
  next_recruit_id INT NOT NULL DEFAULT 1,
  next_candidate_id INT NOT NULL DEFAULT 1,
  last_tick_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mission_templates (
  id          INT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty  TEXT NOT NULL,
  events      JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS recruits (
  id         INT NOT NULL,
  player_id  INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  job_title  TEXT,
  status     TEXT NOT NULL DEFAULT 'available',
  hp         INT NOT NULL,
  max_hp     INT NOT NULL,
  attributes JSONB NOT NULL,
  perks      JSONB NOT NULL DEFAULT '[]',
  flaws      JSONB NOT NULL DEFAULT '[]',
  PRIMARY KEY (player_id, id)
);

CREATE TABLE IF NOT EXISTS candidates (
  id         INT NOT NULL,
  player_id  INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  job_title  TEXT NOT NULL,
  archetype  TEXT NOT NULL,
  hp         INT NOT NULL,
  max_hp     INT NOT NULL,
  attributes JSONB NOT NULL,
  perks      JSONB NOT NULL DEFAULT '[]',
  flaws      JSONB NOT NULL DEFAULT '[]',
  PRIMARY KEY (player_id, id)
);

CREATE TABLE IF NOT EXISTS mission_instances (
  id                  SERIAL PRIMARY KEY,
  player_id           INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  template_id         INT NOT NULL REFERENCES mission_templates(id),
  recruit_id          INT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'in_progress',
  phase               TEXT NOT NULL DEFAULT 'EN_ROUTE',
  progress            INT NOT NULL DEFAULT 0,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_event_index INT NOT NULL DEFAULT 0,
  event_results       JSONB NOT NULL DEFAULT '[]',
  failed              BOOLEAN NOT NULL DEFAULT FALSE,
  reward_forfeited    BOOLEAN NOT NULL DEFAULT FALSE,
  forced_return       BOOLEAN NOT NULL DEFAULT FALSE,
  return_started_at   TIMESTAMPTZ,
  progress_at_return  INT,
  UNIQUE (player_id, template_id)
);

CREATE TABLE IF NOT EXISTS log_entries (
  id          SERIAL PRIMARY KEY,
  player_id   INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  message     TEXT NOT NULL,
  mission_id  INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recruits_player ON recruits(player_id);
CREATE INDEX IF NOT EXISTS idx_candidates_player ON candidates(player_id);
CREATE INDEX IF NOT EXISTS idx_mission_instances_player ON mission_instances(player_id);
CREATE INDEX IF NOT EXISTS idx_log_entries_player ON log_entries(player_id, created_at);
