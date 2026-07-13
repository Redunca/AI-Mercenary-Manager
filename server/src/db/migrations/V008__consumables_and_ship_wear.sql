-- Equipment was never wired to any gameplay effect and had no UI; replace it
-- with consumables, which live in a specific ship's inventory and are spent
-- during missions (attribute boosts, heals, repairs, speed boosts).
DELETE FROM shop_items WHERE type = 'equipment';
DROP TABLE IF EXISTS equipment;

CREATE TABLE IF NOT EXISTS consumables (
  id                SERIAL PRIMARY KEY,
  player_id         INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  rarity            TEXT NOT NULL,
  price             INT NOT NULL,
  effect            TEXT NOT NULL,
  effect_data       JSONB NOT NULL DEFAULT '{}',
  quantity          INT NOT NULL DEFAULT 1,
  assigned_to_ship  INT REFERENCES ships(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumables_player ON consumables(player_id);
CREATE INDEX IF NOT EXISTS idx_consumables_ship ON consumables(assigned_to_ship);

ALTER TABLE shop_items DROP CONSTRAINT IF EXISTS shop_items_type_check;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_type_check CHECK (type IN ('ship', 'consumable'));
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS effect_data JSONB NOT NULL DEFAULT '{}';

-- Ships need a fixed ceiling to repair back up to; the value at purchase/creation
-- time becomes that ceiling for existing ships and shop ship listings that
-- predate this column.
UPDATE ships SET stats = jsonb_set(stats, '{max_durability}', stats->'durability')
WHERE stats ? 'durability' AND NOT (stats ? 'max_durability');
UPDATE shop_items SET stats = jsonb_set(stats, '{max_durability}', stats->'durability')
WHERE type = 'ship' AND stats ? 'durability' AND NOT (stats ? 'max_durability');

INSERT INTO shop_items (name, description, type, rarity, price, stats, available) VALUES
  ('Cruiser', 'A heavy, powerful ship', 'ship', 'epic', 25000,
   '{"speed":80,"capacity":6,"inventory_space":30,"durability":25,"max_durability":25,"price":25000}', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO shop_items (name, description, type, rarity, price, effect, effect_data, available) VALUES
  ('Agility Stimpack',    'Grants Advantage 1 on the next event using agility. Must be in the ship''s inventory; consumed once used.',      'consumable', 'uncommon', 400,  'ATTRIBUTE_BOOST', '{"attribute":"agility","advantage":1}',    TRUE),
  ('Fortitude Draught',   'Grants Advantage 1 on the next event using fortitude. Must be in the ship''s inventory; consumed once used.',     'consumable', 'uncommon', 400,  'ATTRIBUTE_BOOST', '{"attribute":"fortitude","advantage":1}',   TRUE),
  ('Might Injector',      'Grants Advantage 1 on the next event using might. Must be in the ship''s inventory; consumed once used.',         'consumable', 'uncommon', 400,  'ATTRIBUTE_BOOST', '{"attribute":"might","advantage":1}',       TRUE),
  ('Learning Codex',      'Grants Advantage 1 on the next event using learning. Must be in the ship''s inventory; consumed once used.',      'consumable', 'uncommon', 400,  'ATTRIBUTE_BOOST', '{"attribute":"learning","advantage":1}',    TRUE),
  ('Logic Processor',     'Grants Advantage 1 on the next event using logic. Must be in the ship''s inventory; consumed once used.',         'consumable', 'uncommon', 400,  'ATTRIBUTE_BOOST', '{"attribute":"logic","advantage":1}',       TRUE),
  ('Perception Lens',     'Grants Advantage 1 on the next event using perception. Must be in the ship''s inventory; consumed once used.',    'consumable', 'uncommon', 400,  'ATTRIBUTE_BOOST', '{"attribute":"perception","advantage":1}',  TRUE),
  ('Will Anchor',         'Grants Advantage 1 on the next event using will. Must be in the ship''s inventory; consumed once used.',           'consumable', 'uncommon', 400,  'ATTRIBUTE_BOOST', '{"attribute":"will","advantage":1}',        TRUE),
  ('Deception Mask',      'Grants Advantage 1 on the next event using deception. Must be in the ship''s inventory; consumed once used.',     'consumable', 'uncommon', 400,  'ATTRIBUTE_BOOST', '{"attribute":"deception","advantage":1}',   TRUE),
  ('Persuasion Chip',     'Grants Advantage 1 on the next event using persuasion. Must be in the ship''s inventory; consumed once used.',     'consumable', 'uncommon', 400,  'ATTRIBUTE_BOOST', '{"attribute":"persuasion","advantage":1}',  TRUE),
  ('Presence Aura',       'Grants Advantage 1 on the next event using presence. Must be in the ship''s inventory; consumed once used.',       'consumable', 'uncommon', 400,  'ATTRIBUTE_BOOST', '{"attribute":"presence","advantage":1}',    TRUE),
  ('Trauma Nanites',      'The instant a crew member would die, revives them to full health. Must be in the ship''s inventory; consumed automatically.', 'consumable', 'rare', 2500, 'HEAL',   '{}', TRUE),
  ('Hull Auto-Patch',     'The instant the ship would break down, repairs it back to full durability. Must be in the ship''s inventory; consumed automatically.', 'consumable', 'rare', 2000, 'REPAIR', '{}', TRUE),
  ('Overdrive Injector',  'Used when launching a mission: temporarily boosts the ship''s speed, shortening travel to and from the mission.', 'consumable', 'uncommon', 1200, 'SPEED_BOOST', '{"multiplier":1.5}', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Mission timing used to be a fixed E*15s split into three equal bands with no
-- link to ship speed. These two columns were added for that purpose long ago
-- but never populated; repurpose them to hold the per-leg travel duration and
-- the (speed-independent) event-phase duration computed once at mission start.
ALTER TABLE mission_instances RENAME COLUMN base_travel_time TO travel_segment_ms;
ALTER TABLE mission_instances RENAME COLUMN effective_travel_time TO events_segment_ms;
ALTER TABLE mission_instances ALTER COLUMN travel_segment_ms DROP DEFAULT;
