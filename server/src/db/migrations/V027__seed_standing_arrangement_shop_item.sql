-- Fills in the shop_items catalog row for the "standing-arrangement" Opera's
-- target: "shop" seed node, the same gap V023 backfilled for every earlier
-- Opera -- fireSeeds() (opera.service.js) never creates a shop item itself,
-- only guarantees an existing catalog row's rotation presence, and silently
-- console.warns if the name doesn't exist yet. Without this row, that seed
-- step would be a permanent dead end.
--
-- Flavor/quest item with no mechanical effect, same convention as V023's
-- batch: effect = 'NONE' / effect_data = '{}' is a deliberate no-op.
-- max_stock = 5 and is_quest_item = TRUE so it can't be exhausted by a
-- curious player before the Opera step that needs it unlocks.
INSERT INTO shop_items (name, description, type, rarity, price, effect, effect_data, available, max_stock, is_quest_item) VALUES
  ('Matched Training Gear', 'A matched set of sparring gear, sized for two -- no mechanical edge, just fewer excuses to skip a session.', 'consumable', 'common', 350, 'NONE', '{}', TRUE, 5, TRUE)
ON CONFLICT (name) DO NOTHING;
