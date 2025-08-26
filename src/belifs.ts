import {
  Agent as DeliverooAgentType,
  Parcel,
  Tile,
} from "@unitn-asa/deliveroo-js-client";

enum TileType {
  WALL,
  SPAWNABLE,
  EMPTY,
  DELIVERY,
}

export class BelifsSet {
  private map: TileType[][];
  private parcels: Parcel[] = [];
  private agents: DeliverooAgentType[] = [];

  constructor(map: { width: number; height: number; tiles: Tile[] }) {
    this.map = BelifsSet.convertMap(map);
  }

  updateMap(width: number, height: number, tiles: Tile[]): void {
    this.map = BelifsSet.convertMap({ width, height, tiles });
  }

  updateParcels(parcels: Parcel[]): void {
    for (const parcel of parcels) {
      const index = this.parcels.findIndex((p) => p.id === parcel.id);
      if (index !== -1) {
        this.parcels[index] = parcel;
      } else {
        this.parcels.push(parcel);
      }
    }
  }

  updateAgents(agents: DeliverooAgentType[]): void {
    for (const agent of agents) {
      const index = this.agents.findIndex((a) => a.id === agent.id);
      if (index !== -1) {
        this.agents[index] = agent;
      } else {
        this.agents.push(agent);
      }
    }
  }

  static convertMap(m: {
    width: number;
    height: number;
    tiles: Tile[];
  }): TileType[][] {
    const map = Array.from({ length: m.height }, () =>
      Array(m.width).fill(TileType.EMPTY),
    );

    for (const tile of m.tiles) {
      if (tile.type === 0) {
        map[tile.y][tile.x] = TileType.EMPTY;
      } else if (tile.type === 1) {
        map[tile.y][tile.x] = TileType.SPAWNABLE;
      } else if (tile.type === 2) {
        map[tile.y][tile.x] = TileType.DELIVERY;
      } else if (tile.type === 3) {
        map[tile.y][tile.x] = TileType.WALL;
      } else {
        throw new Error(`Unknown tile type: ${tile.type}`);
      }
    }

    return map;
  }
}
