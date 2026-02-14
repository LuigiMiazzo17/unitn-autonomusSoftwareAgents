import {
  AgentFromUpdate as DeliverooAgentFromUpdate,
  Parcel as DeliverooParcelType,
  Tile,
} from "@unitn-asa/deliveroo-js-client";
import crypto from "crypto";
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

export type ExternalAgent = {
  id: string;
  x: number;
  y: number;
  carrying: string[];
};

export class BeliefSetWithoutMap {
  protected id: string;
  protected pos: Position;
  protected parcels: DeliverooParcelType[] = [];
  protected agents: ExternalAgent[] = [];
  protected carryingParcels: Set<string> = new Set<string>();

  protected normalizePos(pos: Position): Position {
    return { x: Math.floor(pos.x), y: Math.floor(pos.y) };
  }

  constructor(id: string, pos: Position) {
    this.id = id;
    this.pos = this.normalizePos(pos);
  }

  getId(): string {
    return this.id;
  }

  getPos(): Position {
    return this.pos;
  }

  updatePos(pos: Position): void {
    this.pos = this.normalizePos(pos);
  }

  getAgents(): ExternalAgent[] {
    return this.agents;
  }

  getCarryingParcels(): Set<string> {
    return this.carryingParcels;
  }

  getChecksumOfBeliefs(): string {
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
      .update(`${parcelsStr}|${agentsStr}`)
      .digest("hex");
  }

  getKnwonAgentsIds(): Set<string> {
    return this.agents.reduce(
      (set, agent) => set.add(agent.id),
      new Set<string>(),
    );
  }

  updateParcels(parcels: DeliverooParcelType[]): boolean {
    let somethingChanged = false;
    for (const parcel of parcels) {
      const index = this.parcels.findIndex((p) => p.id === parcel.id);
      if (index !== -1) {
        this.parcels[index] = parcel;

        // we discover that the parcel is now being carried by us
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

  clearParcels(): void {
    this.carryingParcels.clear();
    debug(`Cleared carrying parcels`, this.id);
  }

  updateAgents(agents: DeliverooAgentFromUpdate[]): void {
    for (const agent of agents) {
      const index = this.agents.findIndex((a) => a.id === agent.id);
      if (index !== -1) {
        let externalAgent = this.agents[index];
        externalAgent.x = Math.floor(agent.x);
        externalAgent.y = Math.floor(agent.y);
        this.agents[index] = externalAgent; // is this necessary? externalAgent is a reference to the object in the array, but let's be safe
      } else {
        const externalAgent: ExternalAgent = {
          id: agent.id,
          x: Math.floor(agent.x),
          y: Math.floor(agent.y),
          carrying: [],
        };
        this.agents.push(externalAgent);
      }
    }

    debug(`Updated agents: ${this.agents.length}`, this.id);
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
}

export class BeliefSet extends BeliefSetWithoutMap {
  private map: TileType[][] = [];
  private mapVersion: number = 0;
  private deliveryTiles: Position[] = [];
  private spawnableTiles: SpawnableTiles[] = [];

  constructor(
    id: string,
    unserialized_map: { width: number; height: number; tiles: Tile[] },
    pos: Position,
  ) {
    super(id, pos);
    const map = BeliefSet.convertMap(unserialized_map);
    this.updateMap(map);
    this.pos = this.normalizePos(pos);
  }

  getMap(): TileType[][] {
    return this.map;
  }

  updateMap(map: TileType[][]): void {
    this.map = map;
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

  getDeliveryTiles(): Position[] {
    return this.deliveryTiles;
  }

  getSpawnableTiles(): SpawnableTiles[] {
    return this.spawnableTiles;
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

export class BeliefSetWithoutMapFactory {
  static fromObject(obj: any): BeliefSetWithoutMap {
    // this is used in message passing, so map, deliveryTiles and spawnableTiles
    // are not included in the message because each agent has the same thing

    if (typeof obj.id !== "string") {
      throw new Error("Invalid belief set: id should be a string");
    }
    if (typeof obj.pos !== "object") {
      throw new Error("Invalid belief set: pos should be an object");
    }
    if (typeof obj.pos.x !== "number" || typeof obj.pos.y !== "number") {
      throw new Error("Invalid belief set: pos should have numeric x and y");
    }
    if (!Array.isArray(obj.parcels)) {
      throw new Error("Invalid belief set: parcels should be an array");
    }
    if (!Array.isArray(obj.agents)) {
      throw new Error("Invalid belief set: agents should be an array");
    }

    const beliefSet = new BeliefSetWithoutMap(obj.id, {
      x: Math.floor(obj.pos.x),
      y: Math.floor(obj.pos.y),
    });
    beliefSet.updateParcels(obj.parcels);
    beliefSet.updateAgents(obj.agents);
    return beliefSet;
  }
}
