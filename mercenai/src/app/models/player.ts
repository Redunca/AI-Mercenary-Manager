
export interface DockingStation {
  id : string;
  size : number;
}

export interface Player {
  maxNumberOfRecruits : number;
  maxAvailableMissions : number;
  credits : number;
  tokens : number;
  dockingStations : DockingStation[]
}
