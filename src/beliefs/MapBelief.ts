import { Tile } from "@unitn-asa/deliveroo-js-client";
import { Position, SpawnableTiles, TileType } from "src/beliefs/types";
import { normalizePos } from "src/utils/math";

export default class MapBelief {
  private map: TileType[][] = [];
  private mapVersion: number = 0;
  private deliveryTiles: Position[] = [];
  private spawnableTiles: SpawnableTiles[] = [];
  private spawnableObservationTimestamp: number = 0;

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
    const norm = normalizePos(pos);
    return this.map[norm.y][norm.x];
  }

  markSpawnableTileChecked(pos: Position): void {
    const currentTimestamp = this.nextSpawnableObservationTimestamp();
    this.markSpawnableTileSeen(pos, currentTimestamp);
  }

  getSpawnableTilesLastSeen(): Record<string, number> {
    return Object.fromEntries(
      this.spawnableTiles.map((tile) => [
        `${tile.pos.x},${tile.pos.y}`,
        tile.lastSeenTimestamp,
      ]),
    );
  }

  mergeSpawnableTilesLastSeen(externalLastSeen: Record<string, number>): void {
    for (const tile of this.spawnableTiles) {
      const key = `${tile.pos.x},${tile.pos.y}`;
      const externalTimestamp = externalLastSeen[key];
      if (
        externalTimestamp !== undefined &&
        externalTimestamp > tile.lastSeenTimestamp
      ) {
        tile.lastSeenTimestamp = externalTimestamp;
      }
      this.spawnableObservationTimestamp = Math.max(
        this.spawnableObservationTimestamp,
        tile.lastSeenTimestamp,
      );
    }
  }

  markSpawnableTilesSeenInRadius(center: Position, radius: number): void {
    const normalizedCenter = normalizePos(center);
    const clampedRadius = Math.max(0, radius);
    const radiusSquared = clampedRadius * clampedRadius;
    const currentTimestamp = this.nextSpawnableObservationTimestamp();

    for (const tile of this.spawnableTiles) {
      const dx = tile.pos.x - normalizedCenter.x;
      const dy = tile.pos.y - normalizedCenter.y;
      if (dx * dx + dy * dy <= radiusSquared) {
        tile.lastSeenTimestamp = currentTimestamp;
      }
    }
  }

  update(map: TileType[][]): void {
    const previousLastSeenByTile = new Map<string, number>(
      this.spawnableTiles.map((tile) => [
        `${tile.pos.x},${tile.pos.y}`,
        tile.lastSeenTimestamp,
      ]),
    );

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
          .map((pos) => {
            const tilePos = pos as Position;
            const key = `${tilePos.x},${tilePos.y}`;
            return {
              pos: tilePos,
              lastSeenTimestamp: previousLastSeenByTile.get(key) ?? 0,
            };
          }),
      )
      .flat() as SpawnableTiles[];

    this.spawnableObservationTimestamp = this.spawnableTiles.reduce(
      (latest, tile) => Math.max(latest, tile.lastSeenTimestamp),
      this.spawnableObservationTimestamp,
    );
  }

  private nextSpawnableObservationTimestamp(): number {
    const now = Date.now();
    this.spawnableObservationTimestamp = Math.max(
      this.spawnableObservationTimestamp + 1,
      now,
    );
    return this.spawnableObservationTimestamp;
  }

  private markSpawnableTileSeen(pos: Position, timestamp: number): void {
    const spawnableTile = this.spawnableTiles.find(
      (tile) => tile.pos.x === pos.x && tile.pos.y === pos.y,
    );
    if (spawnableTile) {
      spawnableTile.lastSeenTimestamp = timestamp;
    }
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
