export interface Equipment {
  id: number;
  player_id: number;
  slot: 'armor';
  name: string;
  description: string;
  rarity: string;
  armor_type: 'light' | 'medium' | 'heavy';
  guard_bonus: number;
  required_fortitude: number;
  speed_penalty: number;
  price: number;
  assigned_to_recruit_id: number | null;
  created_at: string;
}

export interface EquipmentState {
  stash: Equipment[];
  equipped: Equipment[];
}
