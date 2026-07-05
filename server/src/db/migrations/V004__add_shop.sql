ALTER TABLE players ADD COLUMN IF NOT EXISTS wallet INT NOT NULL DEFAULT 10000;

CREATE TABLE IF NOT EXISTS shop_items (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL CHECK (type IN ('ship', 'equipment')),
  rarity          TEXT NOT NULL,
  price           INT NOT NULL,
  stats           JSONB,
  effect          TEXT,
  quantity        INT DEFAULT 1,
  available       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_history (
  id              SERIAL PRIMARY KEY,
  player_id       INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_id         INT NOT NULL REFERENCES shop_items(id),
  item_type       TEXT NOT NULL,
  price_paid      INT NOT NULL,
  purchased_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_items_type ON shop_items(type);
CREATE INDEX IF NOT EXISTS idx_purchase_history_player ON purchase_history(player_id);