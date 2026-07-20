-- Opera: hand-authored quest-line/achievement-chain definitions live as JSON
-- files under server/data/operas/, loaded into an in-memory registry at
-- startup by server/src/operaLoader.js -- NOT DB rows (mirrors how
-- server/data/upgrades.json backs player_upgrades in V015). These two
-- tables track only per-player *progress* against those static
-- definitions, keyed by the definition's string `id` (e.g. "tutorial")
-- rather than a DB-generated content row.
--
-- Multiple operas can be in_progress at once for the same player (no
-- mutex), so (player_id, opera_id) is the natural composite key rather
-- than a single-active-opera-per-player model.
CREATE TABLE IF NOT EXISTS opera_instances (
  player_id    INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  opera_id     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed', 'failed')),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (player_id, opera_id)
);

-- One row per completed step -- a completion ledger, not a state machine.
-- Whether the opera is "sequential" or "checklist" is read from the JSON
-- definition at match time (see server/src/domain/opera.js), not stored
-- here, so this table's shape doesn't need to change if that flag's
-- semantics ever grow.
CREATE TABLE IF NOT EXISTS opera_step_progress (
  player_id    INT NOT NULL,
  opera_id     TEXT NOT NULL,
  step_id      TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, opera_id, step_id),
  FOREIGN KEY (player_id, opera_id) REFERENCES opera_instances(player_id, opera_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_opera_instances_player ON opera_instances(player_id);
CREATE INDEX IF NOT EXISTS idx_opera_step_progress_instance ON opera_step_progress(player_id, opera_id);

-- Opera's own timestamped [SYS] lines reuse log_entries (the same table
-- mission phase/event/banter lines already use) instead of a parallel
-- opera_log_entries table -- following mission_id's existing precedent as
-- a nullable "owner" column that buildGameState() partitions on. A row
-- should only ever have mission_id XOR opera_id set; not DB-enforced,
-- matching how mission_id/global-only rows already coexist unconstrained.
ALTER TABLE log_entries ADD COLUMN IF NOT EXISTS opera_id TEXT;
CREATE INDEX IF NOT EXISTS idx_log_entries_opera ON log_entries(player_id, opera_id) WHERE opera_id IS NOT NULL;

-- Marks a shop catalog item as quest-related: guaranteed a rotation slot
-- (see drawShopRotation's guaranteed-quest-item generalization in
-- shop.service.js) and targetable by name from opera JSON `match` blocks.
-- shop_items.name is already UNIQUE (V005), so Opera JSON references items
-- by name, not by this SERIAL id, which isn't stable across environments.
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS is_quest_item BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed items for the tutorial opera's "buy seeded equipment" and "buy
-- seeded item" steps (server/data/operas/tutorial.json). Column lists
-- match this table's two existing seeding conventions exactly (V016 for
-- armor/stats, V008/V009 for consumable/effect). No reward/gameplay
-- effect on either -- purchasable + flagged only.
INSERT INTO shop_items (name, description, type, rarity, price, stats, available, max_stock, is_quest_item) VALUES
  ('Recruit Training Vest', 'Basic issue light armor for new hires.', 'armor', 'common', 150,
   '{"armorType":"light","guardBonus":1,"requiredFortitude":0,"speedPenalty":0}', TRUE, 5, TRUE)
ON CONFLICT (name) DO NOTHING;

-- effect = 'NONE' is a deliberate no-op: consumables.effect is NOT NULL, and
-- every other effect ('HEAL', 'ATTRIBUTE_BOOST', 'REPAIR', 'SPEED_BOOST') is
-- matched by exact string equality in game.service.js/consumable.service.js,
-- so an unrecognized value here just sits inertly in a ship's inventory
-- rather than doing anything -- this item's only job is to be purchasable.
-- max_stock 5 (not the 1-per-cycle default): this item is guaranteed to be
-- in every rotation, so a curious player buying it before the opera step
-- that asks for it is unlocked shouldn't be able to exhaust it and then
-- have to wait out a full refresh interval to try again.
INSERT INTO shop_items (name, description, type, rarity, price, effect, effect_data, available, max_stock, is_quest_item) VALUES
  ('Encrypted Data Chip', 'Recovered intel of unknown origin.', 'consumable', 'common', 50, 'NONE', '{}', TRUE, 5, TRUE)
ON CONFLICT (name) DO NOTHING;
