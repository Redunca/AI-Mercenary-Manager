-- Auto-battle combat can permanently reduce a recruit's max_hp (falling to 0
-- HP with no HEAL consumable on hand). To know when that cumulative injury
-- becomes fatal (max_hp dropping to half or below), we need to remember the
-- recruit's max_hp as it was when they were hired, independent of max_hp
-- itself which now mutates over time.
ALTER TABLE recruits ADD COLUMN IF NOT EXISTS original_max_hp INT;
UPDATE recruits SET original_max_hp = max_hp WHERE original_max_hp IS NULL;
ALTER TABLE recruits ALTER COLUMN original_max_hp SET NOT NULL;
