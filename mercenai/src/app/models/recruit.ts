export interface RecruitStats {
  phy: number;
  men: number;
  soc: number;
}

export interface Recruit {
  id: string;
  name: string;
  stats: RecruitStats;
}
