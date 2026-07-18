-- The 16 seeded shop_items rows (3 ships + 13 consumables) become a
-- permanent master catalog instead of "the shop": the live shop now shows
-- only 5 of them at a time, drawn per-player and refreshed on a wall-clock
-- 15-minute cycle (mirroring mission_refresh_at / V012's mission batching).
--
-- shop_items.available used to mean "buyable" (in practice always TRUE,
-- since nothing ever set it FALSE). That single flag is being split into
-- two separate concerns:
--   1. "is this row currently one of the 5 live listings?" -> now tracked
--      by membership in the new shop_rotation table below, NOT by a column
--      on shop_items.
--   2. "has this listing been bought this cycle?" -> now tracked by
--      shop_rotation.remaining_stock (see below).
-- shop_items.available is therefore no longer read by shop.service.js as of
-- this migration. It is intentionally left in place rather than dropped —
-- it's unused, but dropping columns is a separate, riskier migration than
-- this feature needs, and there's no correctness reason to force it now.
--
-- shop_items rows are never deleted on refresh: purchase_history.item_id is
-- a hard FK to shop_items(id) with no ON DELETE behavior, so rotated-out
-- rows must keep existing permanently even once they're no longer live.

-- Per-catalog-item stock: how many units of a listing can be bought in a
-- single rotation cycle before it's sold out. Ships aren't stackable, so
-- they default to 1 (single buy, mirrors the old de-facto behavior once
-- purchase-blocking is added). Consumables get more, split by rarity:
-- uncommon items (the 10 attribute boosts + Overdrive Injector) get 3,
-- rare items (Trauma Nanites, Hull Auto-Patch) get 2.
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS max_stock INT NOT NULL DEFAULT 1;

UPDATE shop_items SET max_stock = 3 WHERE type = 'consumable' AND rarity = 'uncommon';
UPDATE shop_items SET max_stock = 2 WHERE type = 'consumable' AND rarity = 'rare';

-- Which shop_items rows are in a given player's live 5-item rotation right
-- now, and how many units of each are still purchasable this cycle.
-- Deliberately NOT a history table: refreshShopRotation() deletes and
-- reinserts this player's 5 rows on every refresh rather than accumulating
-- rows across cycles. Permanent purchase history lives in purchase_history,
-- which is unaffected by rotation churn.
CREATE TABLE IF NOT EXISTS shop_rotation (
  player_id        INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  shop_item_id     INT NOT NULL REFERENCES shop_items(id),
  remaining_stock  INT NOT NULL,
  PRIMARY KEY (player_id, shop_item_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_rotation_player ON shop_rotation(player_id);

-- shop_refresh_at already exists on players (added in V012, unused until
-- now) — this is where it starts being read/written.
