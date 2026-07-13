-- Re-applies V008's shop_items seed data. On at least one environment, V008
-- got recorded as applied without these INSERTs actually landing (a
-- multi-statement psql/simple-protocol batch rolled back as a whole after a
-- later statement in the same file failed on a second manual run). Shipping
-- this as its own migration, rather than editing V008, ensures the seed data
-- lands regardless of what happened to V008 in any given environment.
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
