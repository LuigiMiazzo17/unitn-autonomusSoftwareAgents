import {
  Agent as DeliverooAgentType,
  Parcel,
  Tile,
} from "@unitn-asa/deliveroo-js-client";
import crypto from "crypto";
import { debug } from "src/utils/log";

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

export class BelifsSet {
  private id: string;
  private pos: Position;
  private map: TileType[][];
  private parcels: Parcel[] = [];
  private agents: DeliverooAgentType[] = [];

  constructor(
    id: string,
    map: { width: number; height: number; tiles: Tile[] },
    pos: Position,
  ) {
    this.id = id;
    this.map = BelifsSet.convertMap(map);
    this.pos = pos;
  }

  updatePos(pos: Position): void {
    this.pos = pos;
  }

  getPos(): Position {
    return this.pos;
  }

  updateMap(width: number, height: number, tiles: Tile[]): void {
    this.map = BelifsSet.convertMap({ width, height, tiles });
    this.agents = [];
    this.parcels = [];
  }

  getMap(): TileType[][] {
    return this.map;
  }

  getChecksumOfBelifs(): string {
    const parcelsStr = this.parcels
      .map((p) => `${p.id}-${p.x}-${p.y}-${p.carriedBy ?? "null"}`)
      .sort()
      .join("|");
    const agentsStr = this.agents
      .map((a) => `${a.id}-${a.x}-${a.y}`)
      .sort()
      .join("|");
    const checksum = crypto
      .createHash("md5")
      .update(`${this.pos.x}-${this.pos.y}|${parcelsStr}|${agentsStr}`)
      .digest("hex");

    debug(`Belifs checksum: ${checksum}`, this.id);

    return checksum;
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

    debug(`Updated parcels: ${this.parcels.length}`, this.id);
  }

  getParcels(): Parcel[] {
    return this.parcels;
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

    debug(`Updated agents: ${this.agents.length}`, this.id);
  }

  getAgents(): DeliverooAgentType[] {
    return this.agents;
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
