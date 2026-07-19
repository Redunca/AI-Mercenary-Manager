-- Armor equipment: purchasable gear that occupies a recruit's 'armor' slot
-- and boosts their Guard during combat (see domain/equipment.js). Unlike
-- consumables, equipment is never spent by use -- it persists across
-- missions and is only destroyed if its wearer dies (see
-- EquipmentService.destroyEquipmentForRecruit, hooked into damageRecruit /
-- applyCombatResult in game.service.js).
--
-- `slot` is deliberately a column (not implied by table name) so a future
-- slot (e.g. 'weapon') is a CHECK-widening migration, not a schema rework.
--
-- recruits' primary key is the composite (player_id, id) -- not id alone --
-- so assigned_to_recruit_id needs a composite FK rather than a plain one.
CREATE TABLE IF NOT EXISTS equipment (
  id                      SERIAL PRIMARY KEY,
  player_id               INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  slot                    TEXT NOT NULL CHECK (slot IN ('armor')),
  name                    TEXT NOT NULL,
  description             TEXT,
  rarity                  TEXT NOT NULL,
  armor_type              TEXT CHECK (armor_type IN ('light', 'medium', 'heavy')),
  guard_bonus             INT NOT NULL DEFAULT 0,
  required_fortitude      INT NOT NULL DEFAULT 0,
  speed_penalty           INT NOT NULL DEFAULT 0,
  price                   INT NOT NULL,
  assigned_to_recruit_id  INT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (player_id, assigned_to_recruit_id) REFERENCES recruits(player_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_player ON equipment(player_id);
CREATE INDEX IF NOT EXISTS idx_equipment_assigned_recruit ON equipment(assigned_to_recruit_id);

-- At most one item per slot per recruit (forward-compatible with future
-- slots beyond 'armor').
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_one_per_slot
  ON equipment(assigned_to_recruit_id, slot)
  WHERE assigned_to_recruit_id IS NOT NULL;

ALTER TABLE shop_items DROP CONSTRAINT IF EXISTS shop_items_type_check;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_type_check CHECK (type IN ('ship', 'consumable', 'armor'));

-- Open Legend core rules, armor table (06-wealth-equipment): 5 base
-- archetypes seeded as a static catalog (not procedurally generated).
INSERT INTO shop_items (name, description, type, rarity, price, stats, available, max_stock) VALUES
  ('Leather Armor', 'Light armor. Requires Fortitude 0 to benefit from its protection.',
   'armor', 'common', 600,
   '{"armorType":"light","guardBonus":1,"requiredFortitude":0,"speedPenalty":0}', TRUE, 3),
  ('Armored Trench Coat', 'Medium armor. Requires Fortitude 2 to benefit from its protection.',
   'armor', 'rare', 3000,
   '{"armorType":"medium","guardBonus":2,"requiredFortitude":2,"speedPenalty":0}', TRUE, 2),
  ('Chainmail', 'Medium armor. Requires Fortitude 3 to benefit from its protection.',
   'armor', 'uncommon', 1800,
   '{"armorType":"medium","guardBonus":2,"requiredFortitude":3,"speedPenalty":0}', TRUE, 2),
  ('Plate Mail', 'Heavy armor. Requires Fortitude 3 to benefit from its protection.',
   'armor', 'uncommon', 2200,
   '{"armorType":"heavy","guardBonus":3,"requiredFortitude":3,"speedPenalty":5}', TRUE, 1),
  ('Power Armor', 'Heavy armor. Requires Fortitude 1 to benefit from its protection.',
   'armor', 'epic', 6000,
   '{"armorType":"heavy","guardBonus":3,"requiredFortitude":1,"speedPenalty":0}', TRUE, 1)
ON CONFLICT DO NOTHING;
