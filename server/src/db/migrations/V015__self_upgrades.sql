-- Self-upgrades: player-purchasable capacity/speed upgrades bought with
-- tokens (see V014). Each upgrade tracks an integer tier per player; the
-- catalog (name, description, base/increment/cap, per-tier costs) lives
-- entirely in server/data/upgrades.json, not in the database or in code --
-- effective value = baseValue + tier * increment (or baseValueMs -
-- tier * decrementMs, floored, for the two refresh-speed upgrades).
--
-- upgrade_id is INT, matching the explicit numeric "id" on each entry in
-- upgrades.json: every other list-style panel in the game (shop, recruit,
-- mission, ship...) references items by a small numeric id typed in the
-- terminal, so self buy <id> follows the same convention rather than a
-- string slug.
CREATE TABLE IF NOT EXISTS player_upgrades (
  player_id  INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  upgrade_id INT NOT NULL,
  tier       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, upgrade_id)
);

-- Per-player overrides of what used to be module-level constants in
-- shop.service.js / game.service.js. Defaults match those former constants
-- exactly, so existing players are unaffected until they actually buy the
-- corresponding upgrade.
ALTER TABLE players ADD COLUMN IF NOT EXISTS shop_rotation_size INT NOT NULL DEFAULT 5;
ALTER TABLE players ADD COLUMN IF NOT EXISTS shop_refresh_interval_ms INT NOT NULL DEFAULT 900000;
ALTER TABLE players ADD COLUMN IF NOT EXISTS mission_refresh_interval_ms INT NOT NULL DEFAULT 900000;
ALTER TABLE players ADD COLUMN IF NOT EXISTS inventory_capacity INT NOT NULL DEFAULT 5;
