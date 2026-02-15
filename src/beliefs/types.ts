export enum TileType {
  WALL,
  SPAWNABLE,
  EMPTY,
  DELIVERY,
}

export type Position = {
  x: number;
  y: number;
};

export type SpawnableTiles = {
  pos: Position;
  lastSeenTimestamp: number;
};
