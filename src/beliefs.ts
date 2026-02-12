import {
  Agent as DeliverooAgentType,
  Parcel as DeliverooParcelType,
  Tile,
} from "@unitn-asa/deliveroo-js-client";
import crypto from "crypto";
import { OperationMode } from "./intents";
import { debug, error } from "src/utils/log";

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
  checkedCount: number;
};

export class BeliefSet {
  private id: string;
  private pos: Position;
  private map: TileType[][];
  private mapVersion: number = 0;
  private deliveryTiles: Position[] = [];
  private parcels: DeliverooParcelType[] = [];
  private agents: DeliverooAgentType[] = [];
  private carryingParcels: Set<string> = new Set<string>();
  private spawnableTiles: SpawnableTiles[];
  private knownGroupAgents: Set<string> = new Set<string>();

  private normalizePos(pos: Position): Position {
    return { x: Math.floor(pos.x), y: Math.floor(pos.y) };
  }

  constructor(
    id: string,
    map: { width: number; height: number; tiles: Tile[] },
    pos: Position,
  ) {
    this.id = id;
    this.map = BeliefSet.convertMap(map);

    // precalculate deplivery tiles
    this.deliveryTiles = this.map
      .map((row, y) =>
        row
          .map((tile, x) => (tile === TileType.DELIVERY ? { x, y } : null))
          .filter((pos) => pos !== null)
          .map((pos) => pos as Position),
      )
      .flat();
    this.pos = this.normalizePos(pos);
    this.spawnableTiles = this.map
      .map((row, y) =>
        row
          .map((tile, x) => (tile === TileType.SPAWNABLE ? { x, y } : null))
          .filter((pos) => pos !== null)
          .map((pos) => ({ pos: pos as Position, checkedCount: 0 })),
      )
      .flat() as SpawnableTiles[];
  }

  updatePos(pos: Position): void {
    this.pos = this.normalizePos(pos);
  }

  getPos(): Position {
    return this.pos;
  }

  updateMap(width: number, height: number, tiles: Tile[]): void {
    this.map = BeliefSet.convertMap({ width, height, tiles });
    this.mapVersion += 1;
    this.agents = [];
    this.parcels = [];
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

  getMap(): TileType[][] {
    return this.map;
  }

  private hasValidMap(): boolean {
    return this.map.length > 0 && this.map[0].length > 0;
  }

  private isInsideMap(pos: Position): boolean {
    if (!this.hasValidMap()) return false;
    const norm = this.normalizePos(pos);
    return (
      norm.x >= 0 &&
      norm.x < this.map[0].length &&
      norm.y >= 0 &&
      norm.y < this.map.length
    );
  }

  getChecksumOfBeliefs(operationMode: OperationMode): string {
    const parcelsStr = this.parcels
      .map((p) => {
        let carriedBy = p.carriedBy ?? "null";
        if (p.carriedBy == this.id) {
          carriedBy = "null";
        }
        return `${p.id}-${carriedBy}`;
      })
      .sort()
      .join("|");
    const agentsStr = this.agents
      .map((a) => `${a.id}-${Math.floor(a.x)}-${Math.floor(a.y)}`)
      .sort()
      .join("|");

    return crypto
      .createHash("md5")
      .update(`${parcelsStr}|${agentsStr}|${operationMode}`)
      .digest("hex");
  }

  getKnwonAgentsIds(): Set<string> {
    return this.knownGroupAgents;
  }

  addKnownGroupAgent(agentId: string): void {
    this.knownGroupAgents.add(agentId);
  }

  updateParcels(parcels: DeliverooParcelType[]): boolean {
    let somethingChanged = false;
    for (const parcel of parcels) {
      const index = this.parcels.findIndex((p) => p.id === parcel.id);
      if (index !== -1) {
        this.parcels[index] = parcel;
        if (parcel.carriedBy && !this.carryingParcels.has(parcel.id)) {
          this.carryingParcels.add(parcel.id);
          debug(
            `Parcel ${parcel.id} is now carried by ${parcel.carriedBy}`,
            this.id,
          );
          somethingChanged = true;
        }
      } else {
        this.parcels.push(parcel);
        debug(`Discovered new parcel ${parcel.id}`, this.id);
        somethingChanged = true;
      }
    }

    const parcelIds = parcels.map((p) => p.id);
    for (const parcelId of this.carryingParcels) {
      if (!parcelIds.includes(parcelId)) {
        this.carryingParcels.delete(parcelId);
        debug(`Parcel ${parcelId} dropped`, this.id);
        somethingChanged = true;
      }
    }

    debug(`Updated parcels: ${this.parcels.length}`, this.id);
    return somethingChanged;
  }

  getParcels(): DeliverooParcelType[] {
    return this.parcels;
  }

  pickupParcel(parcelId: string): void {
    this.carryingParcels.add(parcelId);
    debug(`Picked parcel ${parcelId}`, this.id);
  }

  pickupParcelFailedFromAction(): void {
    for (const parcel of this.parcels) {
      if (this.pos.x === parcel.x && this.pos.y === parcel.y) {
        const pPos = this.parcels.find((p) => p.id === parcel.id);
        if (pPos === undefined) {
          error(
            `Pickup failed for parcel ${parcel.id}, but was not in parcels discovered list`,
            this.id,
          );
          return;
        }
        this.parcels = this.parcels.filter((p) => p.id !== parcel.id);
        debug(
          `Pickup failed for parcel ${parcel.id}, removing from discovered`,
          this.id,
        );
      }
    }
  }

  deliverParcel(parcelId: string): void {
    if (this.carryingParcels.has(parcelId)) {
      this.carryingParcels.delete(parcelId);
      debug(`Delivered parcel ${parcelId}`, this.id);
    } else {
      debug(`Cannot deliver parcel ${parcelId} - not carrying it`, this.id);
    }

    if (this.isOnDeliveryTile()) {
      this.parcels = this.parcels.filter((p) => p.id !== parcelId);
      debug(`Removed parcel ${parcelId} from parcels list`, this.id);
    }
  }

  clearParcels(): void {
    this.carryingParcels.clear();
    debug(`Cleared carrying parcels`, this.id);
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

  isPickupAvailable(): boolean {
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

  isDeliveryAvailable(): boolean {
    if (this.carryingParcels.size !== 0 && this.isOnDeliveryTile()) {
      return true;
    }
    return false;
  }

  isOnDeliveryTile(): boolean {
    if (!this.isInsideMap(this.pos)) {
      return false;
    }
    if (this.map[this.pos.y][this.pos.x] === TileType.DELIVERY) {
      return true;
    }
    return false;
  }

  getId(): string {
    return this.id;
  }

  getCarryingParcels(): Set<string> {
    return this.carryingParcels;
  }

  getDeliveryTiles(): Position[] {
    return this.deliveryTiles;
  }

  getSpawnableTiles(): SpawnableTiles[] {
    return this.spawnableTiles;
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
