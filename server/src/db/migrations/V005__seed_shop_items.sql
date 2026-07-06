DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shop_items_name_unique'
  ) THEN
    ALTER TABLE shop_items ADD CONSTRAINT shop_items_name_unique UNIQUE (name);
  END IF;
END $$;

INSERT INTO shop_items (name, description, type, rarity, price, stats, available) VALUES
  ('Corsaire',  'Un navire léger et rapide, idéal pour les missions courtes', 'ship', 'common', 5000,
   '{"speed":120,"capacity":2,"inventory_space":10,"durability":8,"price":5000}', TRUE),
  ('Frégate',   'Un navire équilibré avec une bonne capacité d''équipage',     'ship', 'rare',   12000,
   '{"speed":100,"capacity":4,"inventory_space":20,"durability":15,"price":12000}', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO shop_items (name, description, type, rarity, price, effect, available) VALUES
  ('Blindage Renforcé',       'Augmente la durabilité du navire',              'equipment', 'common',   1000, 'DURABILITY_BOOST',  TRUE),
  ('Moteur Turbo',            'Augmente la vitesse de déplacement',            'equipment', 'rare',     3000, 'SPEED_BOOST',       TRUE),
  ('Augmentation de Stockage','Augmente l''espace d''inventaire du navire',    'equipment', 'common',    500, 'INVENTORY_BOOST',   TRUE),
  ('Scanner Longue Portée',   'Améliore la détection des missions disponibles','equipment', 'uncommon', 2000, 'SCAN_BOOST',        TRUE),
  ('Kit Médical Avancé',      'Réduit les pertes de PV lors des missions',     'equipment', 'rare',     4000, 'HP_REGEN',          TRUE)
ON CONFLICT (name) DO NOTHING;
