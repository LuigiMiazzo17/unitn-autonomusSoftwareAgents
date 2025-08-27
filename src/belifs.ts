import {
  Agent as DeliverooAgentType,
  Parcel,
  Tile,
} from "@unitn-asa/deliveroo-js-client";
import crypto from "crypto";
import { Queue } from "queue-typed";
import { debug, error } from "src/utils/log";
import { Intent } from "./itents";

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
  private carryingParcels: Set<string> = new Set<string>();

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

    const parcelIds = parcels.map((p) => p.id);
    for (const parcelId of this.carryingParcels) {
      if (!parcelIds.includes(parcelId)) {
        this.carryingParcels.delete(parcelId);
        debug(`Parcel ${parcelId} dropped`, this.id);
      }
    }

    debug(`Updated parcels: ${this.parcels.length}`, this.id);
  }

  getParcels(): Parcel[] {
    return this.parcels;
  }

  pickupParcel(parcelId: string): void {
    this.carryingParcels.add(parcelId);
    debug(`Picked parcel ${parcelId}`, this.id);
  }

  deliverParcel(parcelId: string): void {
    if (this.carryingParcels.has(parcelId)) {
      this.carryingParcels.delete(parcelId);
      debug(`Delivered parcel ${parcelId}`, this.id);
    } else {
      debug(`Cannot deliver parcel ${parcelId} - not carrying it`, this.id);
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

    debug(`Updated agents: ${this.agents.length}`, this.id);
  }

  getAgents(): DeliverooAgentType[] {
    return this.agents;
  }

  isCurrentTylePickupable(): boolean {
    for (const parcel of this.parcels) {
      if (
        this.pos.x === parcel.x &&
        this.pos.y === parcel.y &&
        !parcel.carriedBy
      ) {
        return true;
      }
    }
    return false;
  }

  isCurrentTyleDeliverable(): boolean {
    if (
      this.carryingParcels.size !== 0 &&
      this.map[this.pos.y][this.pos.x] === TileType.DELIVERY
    ) {
      return true;
    }
    return false;
  }

  getRandomMovePlan(): Queue<Intent> {
    const queue = new Queue<Intent>();

    if (this.isCurrentTylePickupable()) {
      queue.push(Intent.PICKUP);
      return queue;
    }

    if (this.isCurrentTyleDeliverable()) {
      queue.push(Intent.DELIVER);
      return queue;
    }

    const legalMoves: Intent[] = [];
    const directions = {
      MOVE_UP: { x: 0, y: 1 },
      MOVE_DOWN: { x: 0, y: -1 },
      MOVE_LEFT: { x: -1, y: 0 },
      MOVE_RIGHT: { x: 1, y: 0 },
    };

    for (const [intentStr, dir] of Object.entries(directions)) {
      const newX = this.pos.x + dir.x;
      const newY = this.pos.y + dir.y;

      if (
        newX >= 0 &&
        newX < this.map[0].length &&
        newY >= 0 &&
        newY < this.map.length &&
        this.map[newY][newX] !== TileType.WALL
      ) {
        legalMoves.push(Intent[intentStr as keyof typeof Intent]);
      }
    }

    if (legalMoves.length === 0) {
      error("No legal moves available, this agent is stuck!", this.id);
      queue.push(Intent.NOOP);
      return queue;
    }

    const randomIndex = Math.floor(Math.random() * legalMoves.length);
    queue.push(legalMoves[randomIndex]);

    return queue;
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
}
