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
    price: number;
  };
  crew: number[];
  status: 'docked' | 'in_mission' | 'destroyed';
  created_at: string;
  deleted_at?: string;
}

export interface Equipment {
  id: number;
  name: string;
  description: string;
  rarity: string;
  price: number;
  effect: string;
  quantity: number;
  assigned_to_ship?: number;
  created_at: string;
}
