-- Fixes two shop_items rows left over from before this project's
-- English-only migration. seedShopItems() (shop.service.js) has always
-- used ON CONFLICT (name) DO NOTHING, so any DB seeded under the old
-- French text ("Corsaire" / "Frégate") never got overwritten by later
-- deploys, and dev reboot deliberately leaves shop_items untouched (it's
-- the master catalog, not per-player state). Matched by the old French
-- name so this is a no-op on any DB that never had them.
UPDATE shop_items SET name = 'Corsair', description = 'A light, fast ship'
  WHERE name = 'Corsaire';

UPDATE shop_items SET name = 'Frigate', description = 'A balanced ship with good capacity'
  WHERE name = 'Frégate';
