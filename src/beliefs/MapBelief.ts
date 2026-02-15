import { Tile } from "@unitn-asa/deliveroo-js-client";
import { Position, SpawnableTiles, TileType } from "src/beliefs/types";
import { normalizePos } from "src/utils/math";

export default class MapBelief {
  private map: TileType[][] = [];
  private mapVersion: number = 0;
  private deliveryTiles: Position[] = [];
  private spawnableTiles: SpawnableTiles[] = [];

  constructor(unserialized_map: {
    width: number;
    height: number;
    tiles: Tile[];
  }) {
    const map = MapBelief.fromRawMap(unserialized_map);
    this.update(map);
  }

  static fromRawMap(m: {
    width: number;
    height: number;
    tiles: Tile[];
  }): TileType[][] {
    const map = Array.from({ length: m.height }, () =>
      Array(m.width).fill(TileType.EMPTY),
    );

    for (const tile of m.tiles) {
      if (tile.type === 0) {
        map[tile.y][tile.x] = TileType.WALL;
      } else if (tile.type === 1) {
        map[tile.y][tile.x] = TileType.SPAWNABLE;
      } else if (tile.type === 2) {
        map[tile.y][tile.x] = TileType.DELIVERY;
      } else if (tile.type === 3) {
        map[tile.y][tile.x] = TileType.EMPTY;
      } else {
        throw new Error(`Unknown tile type: ${tile.type}`);
      }
    }

    return map;
  }

  getMap(): TileType[][] {
    return this.map;
  }

  getDeliveryTiles(): Position[] {
    return this.deliveryTiles;
  }

  getSpawnableTiles(): SpawnableTiles[] {
    return this.spawnableTiles;
  }

  getTile(pos: Position): TileType | null {
    if (!this.contains(pos)) {
      return null;
    }
    return this.map[pos.y][pos.x];
  }

  markSpawnableTileChecked(pos: Position): void {
    const spawnableTile = this.spawnableTiles.find(
      (tile) => tile.pos.x === pos.x && tile.pos.y === pos.y,
    );
    if (spawnableTile) {
      spawnableTile.checkedCount += 1;
    }
  }

  update(map: TileType[][]): void {
    this.map = map;
    this.mapVersion += 1;

    this.deliveryTiles = this.map
      .map((row, y) =>
        row
          .map((tile, x) => (tile === TileType.DELIVERY ? { x, y } : null))
          .filter((pos) => pos !== null)
          .map((pos) => pos as Position),
      )
      .flat();
    this.spawnableTiles = this.map
      .map((row, y) =>
        row
          .map((tile, x) => (tile === TileType.SPAWNABLE ? { x, y } : null))
          .filter((pos) => pos !== null)
          .map((pos) => ({ pos: pos as Position, checkedCount: 0 })),
      )
      .flat() as SpawnableTiles[];
  }

  contains(pos: Position): boolean {
    if (!this.isValid()) return false;
    const norm = normalizePos(pos);
    return (
      norm.x >= 0 &&
      norm.x < this.map[0].length &&
      norm.y >= 0 &&
      norm.y < this.map.length
    );
  }

  private isValid(): boolean {
    return this.map.length > 0 && this.map[0].length > 0;
  }
}
