-- Two batches, same convention as V023/V027:
--
-- 1. Catalog rows for the 5 new Opera templates added this session
--    (salvage-rights, the-bounty-circuit, distress-call, the-understudy,
--    long-way-home): 5 "seed":"shop" targets plus 3 "give_item"-only
--    evidence/proof tokens gating a has_item finale bonus. fireSeeds()
--    (opera.service.js) never creates a shop item itself, only guarantees an
--    existing row's rotation presence -- and giveItem() (recruit.service.js)
--    silently no-ops on a name with no matching row at all. Without these
--    rows, both the seed steps and the has_item-gated bonus endings would be
--    permanent dead ends.
--
-- 2. Backfill for 6 give_item effects already shipped in 4 *existing*
--    templates (bought-loyalty, cutting-the-leash, the-machine-messiah,
--    two-gangs-one-contract) that were never given a matching row -- the
--    same silent-no-op gap, just discovered on the existing content instead
--    of new content. Their has_item-gated bonus endings (e.g.
--    two-gangs-one-contract's evidence-gated blackmail ending) have been
--    unreachable in live play until now. Purely additive, ON CONFLICT DO
--    NOTHING, no template JSON changes needed.
--
-- All flavor/quest items with no mechanical effect, same as every prior
-- Opera-seeded row: effect = 'NONE' / effect_data = '{}' is a deliberate
-- no-op. max_stock = 5 and is_quest_item = TRUE so a give_item-only token
-- never enters the normal shop rotation (drawShopRotation excludes
-- is_quest_item rows outright) and a seed-target item can't be exhausted by
-- a curious player before the Opera step that needs it unlocks. Prices/
-- rarities kept in the existing bands from V023's comment (common ~50-200,
-- uncommon ~700-1200, rare ~2000-2600).
INSERT INTO shop_items (name, description, type, rarity, price, effect, effect_data, available, max_stock, is_quest_item) VALUES
  ('Salvage Priority Beacon', 'A black-market transponder that backdates a salvage claim filing by however long it takes someone to notice.', 'consumable', 'uncommon', 950, 'NONE', '{}', TRUE, 5, TRUE),
  ('Wreck''s Manifest', 'A cargo manifest pulled from a derelict''s dead systems, listing exactly what it was carrying and for whom.', 'consumable', 'common', 120, 'NONE', '{}', TRUE, 5, TRUE),
  ('Bounty Circuit Registration', 'Buy-in to the circuit''s official registry, guaranteeing a cut of whatever the crew brings in.', 'consumable', 'uncommon', 800, 'NONE', '{}', TRUE, 5, TRUE),
  ('Confirmed Bounty Claim', 'Paperwork proving first contact with the mark, filed before anyone else''s.', 'consumable', 'common', 150, 'NONE', '{}', TRUE, 5, TRUE),
  ('Distress Beacon Log', 'A salvaged log fragment from a distress beacon, sold by someone who got close enough to listen and turned back.', 'consumable', 'common', 180, 'NONE', '{}', TRUE, 5, TRUE),
  ('Contraband Manifest', 'Proof of exactly what was being moved under cover of a distress call.', 'consumable', 'uncommon', 900, 'NONE', '{}', TRUE, 5, TRUE),
  ('Dog-Eared Training Manual', 'Handed down from one mentor to the next so many times the cover barely holds together.', 'consumable', 'common', 90, 'NONE', '{}', TRUE, 5, TRUE),
  ('Undelivered Letter', 'Returned to sender, unopened, more than once.', 'consumable', 'common', 70, 'NONE', '{}', TRUE, 5, TRUE),
  ('A Conglomerate''s Enemies', 'A ledger of enemies made public, one page at a time -- proof plenty of people would rather see stay buried.', 'consumable', 'uncommon', 900, 'NONE', '{}', TRUE, 5, TRUE),
  ('A Loyal, Terrible Mind', 'A reprogrammed intelligence core, now answering to different names than the ones it was raised on.', 'consumable', 'rare', 2400, 'NONE', '{}', TRUE, 5, TRUE),
  ('Seized Assets Ledger', 'A ledger detailing the crew''s cut of whatever got seized -- signed, counted, and already spent twice over in someone''s head.', 'consumable', 'uncommon', 850, 'NONE', '{}', TRUE, 5, TRUE),
  ('Evidence of Betrayal', 'A trail of evidence pointing somewhere neither warring side wanted found.', 'consumable', 'uncommon', 900, 'NONE', '{}', TRUE, 5, TRUE),
  ('Salvaged Gang Assets', 'Whatever was left standing after the losing side''s operation came apart, picked over and claimed.', 'consumable', 'uncommon', 800, 'NONE', '{}', TRUE, 5, TRUE),
  ('Leverage Over Both Sides', 'Proof solid enough that both sides folded the moment it was mentioned.', 'consumable', 'rare', 2200, 'NONE', '{}', TRUE, 5, TRUE)
ON CONFLICT (name) DO NOTHING;
