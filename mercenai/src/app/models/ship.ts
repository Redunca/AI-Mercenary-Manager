export interface Ship {
  id: number;
  name: string;
  galactic_id: string;
  rarity: string;
  stats: {
    speed: number;
    capacity: number;
    inventory_space: number;
    durability: number;
    max_durability: number;
    price: number;
  };
  crew: number[];
  status: 'docked' | 'in_mission' | 'broken' | 'destroyed';
  created_at: string;
  deleted_at?: string;
}

export interface Consumable {
  id: number;
  name: string;
  description: string;
  rarity: string;
  price: number;
  effect: 'ATTRIBUTE_BOOST' | 'HEAL' | 'REPAIR' | 'SPEED_BOOST';
  effect_data: Record<string, unknown>;
  quantity: number;
  assigned_to_ship?: number | null;
  created_at: string;
}
