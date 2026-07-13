DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shop_items_name_unique'
  ) THEN
    ALTER TABLE shop_items ADD CONSTRAINT shop_items_name_unique UNIQUE (name);
  END IF;
END $$;

INSERT INTO shop_items (name, description, type, rarity, price, stats, available) VALUES
  ('Corsair',  'A light, fast ship, ideal for short missions', 'ship', 'common', 5000,
   '{"speed":120,"capacity":2,"inventory_space":10,"durability":8,"price":5000}', TRUE),
  ('Frigate',   'A balanced ship with good crew capacity',     'ship', 'rare',   12000,
   '{"speed":100,"capacity":4,"inventory_space":20,"durability":15,"price":12000}', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO shop_items (name, description, type, rarity, price, effect, available) VALUES
  ('Reinforced Armor',   'Increases the ship''s durability',              'equipment', 'common',   1000, 'DURABILITY_BOOST',  TRUE),
  ('Turbo Engine',       'Increases movement speed',                      'equipment', 'rare',     3000, 'SPEED_BOOST',       TRUE),
  ('Storage Expansion',  'Increases the ship''s inventory space',         'equipment', 'common',    500, 'INVENTORY_BOOST',   TRUE),
  ('Long-Range Scanner', 'Improves detection of available missions',      'equipment', 'uncommon', 2000, 'SCAN_BOOST',        TRUE),
  ('Advanced Medical Kit','Reduces HP loss during missions',              'equipment', 'rare',     4000, 'HP_REGEN',          TRUE)
ON CONFLICT (name) DO NOTHING;
