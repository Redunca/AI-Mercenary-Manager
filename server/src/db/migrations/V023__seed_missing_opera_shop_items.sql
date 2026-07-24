-- Fills in the shop_items catalog rows for every non-tutorial Opera's
-- target: "shop" seed node. fireSeeds() (opera.service.js) deliberately
-- never creates a shop item -- the OGL seed schema carries no
-- price/stats/type, so it can only guarantee an existing catalog row's
-- rotation presence and console.warns if the name doesn't exist yet. Only
-- the tutorial's two items were ever actually inserted (V017); every other
-- Opera graph under server/data/opera-graphs/*.json referenced a name with
-- no matching row at all, so those seed steps were permanent dead ends
-- ("New item available in the shop" logged, but nothing ever appeared).
--
-- All 9 are flavor/quest items with no mechanical effect, same as the
-- tutorial's "Encrypted Data Chip": effect = 'NONE' / effect_data = '{}'
-- is a deliberate no-op (consumables.effect is NOT NULL but no code path
-- matches 'NONE', so it just sits inertly in inventory). max_stock = 5
-- (not the 1-2 default) for the same reason V017 used it: guaranteed-
-- rotation items shouldn't be exhaustible by a curious player before the
-- Opera step that needs them unlocks. Prices/rarities are flavor-judgment
-- calls (these items are quest-flavored, not combat-relevant) kept
-- roughly in the existing consumable bands from shop.service.js's
-- seedShopItems() (common ~50-200, uncommon ~700-1200, rare ~2000-2600,
-- epic ~5000+).
INSERT INTO shop_items (name, description, type, rarity, price, effect, effect_data, available, max_stock, is_quest_item) VALUES
  ('Tribute Cache', 'A one-off tribute gift for a faction contact, meant to prove good faith and nothing more.', 'consumable', 'common', 200, 'NONE', '{}', TRUE, 5, TRUE),
  ('Old Debt Note', 'A debt owed to a third party, bought up quietly so it can be called in later.', 'consumable', 'uncommon', 900, 'NONE', '{}', TRUE, 5, TRUE),
  ('Coded Data Chip', 'A rival gang''s calling card, deliberately left where it would be found.', 'consumable', 'common', 150, 'NONE', '{}', TRUE, 5, TRUE),
  ('Coded Debt Ledger', 'A ledger detailing exactly what a rival group believes it is owed.', 'consumable', 'uncommon', 750, 'NONE', '{}', TRUE, 5, TRUE),
  ('Forged Identity Papers', 'Papers built by a forger with a favor to spend, good enough to bury an old name.', 'consumable', 'uncommon', 1000, 'NONE', '{}', TRUE, 5, TRUE),
  ('Cult Origin Data-Shard', 'A data-shard said to trace a cult back to its very first believer.', 'consumable', 'rare', 2200, 'NONE', '{}', TRUE, 5, TRUE),
  ('Cult-Grade Decryption Rig', 'Salvaged encryption hardware built to a cult''s own spec.', 'consumable', 'rare', 2600, 'NONE', '{}', TRUE, 5, TRUE),
  ('Cognition Killswitch', 'A one-shot cognitive killswitch. Expensive, illegal, and exactly as dangerous as it sounds.', 'consumable', 'epic', 5500, 'NONE', '{}', TRUE, 5, TRUE),
  ('Faded Bounty Flyer', 'A bounty flyer bearing an old alias, sold openly in port.', 'consumable', 'common', 100, 'NONE', '{}', TRUE, 5, TRUE)
ON CONFLICT (name) DO NOTHING;
