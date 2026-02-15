import {
  AgentFromUpdate as DeliverooAgentFromUpdate,
  Parcel as DeliverooParcelType,
  Tile,
} from "@unitn-asa/deliveroo-js-client";
import config from "config";
import crypto from "crypto";
import { debug, error, warn } from "src/utils/log";
import { Position, SpawnableTiles, TileType } from "./beliefs/types";
import Parcel from "./beliefs/Parcel";
import ExternalAgent from "./beliefs/ExternalAgent";
import MapBelief from "./beliefs/MapBelief";
import { normalizePos } from "./beliefs/utils";
import AgentsBelief from "./beliefs/AgentsBelief";

export class ReducedBeliefSet {
  protected id: string;
  protected pos: Position;
  protected knownParcels: Map<string, Parcel> = new Map<string, Parcel>();
  protected agentsBelief: AgentsBelief;

  constructor(id: string, pos: Position) {
    this.id = id;
    this.pos = normalizePos(pos);
    this.agentsBelief = new AgentsBelief(new ExternalAgent(id, pos));
  }

  static fromJSON(o: Object): ReducedBeliefSet {
    const rbs = Object.assign(new ReducedBeliefSet("", { x: 0, y: 0 }), o);
    rbs.agentsBelief = AgentsBelief.fromJSON(o["agentsBelief"]);
    rbs.knownParcels = new Map<string, Parcel>(
      Object.entries(o["knownParcels"]).map(([id, parcel]) => [
        id,
        Object.assign(new Parcel(id, { x: 0, y: 0 }, 0), parcel as Object),
      ]),
    );
    return rbs;
  }

  getId(): string {
    return this.id;
  }

  getPos(): Position {
    return this.pos;
  }

  updatePos(pos: Position): void {
    this.pos = normalizePos(pos);
  }

  getCarryingParcels(): Set<string> {
    const carrying = new Set<string>();
    for (const [parcelId, parcel] of this.knownParcels.entries()) {
      if (parcel.getCarriedBy() === this.id) {
        carrying.add(parcelId);
      }
    }
    return carrying;
  }

  getChecksumOfBeliefs(): string {
    const parcelsStr = Array.from(this.knownParcels.values())
      .map((p) => {
        let carriedBy = p.getCarriedBy() ?? "null";
        if (p.getCarriedBy() == this.id) {
          carriedBy = "null";
        }
        return `${p.getId()}-${carriedBy}`;
      })
      .sort()
      .join("|");
    const agentsStr = this.getAllAgents()
      .map(
        (a) =>
          `${a.getId()}-${Math.floor(a.getPos().x)}-${Math.floor(a.getPos().y)}`,
      )
      .sort()
      .join("|");

    return crypto
      .createHash("md5")
      .update(`${parcelsStr}|${agentsStr}`)
      .digest("hex");
  }

  updateKnownParcels(parcels: Map<string, Parcel>): void {
    this.knownParcels = parcels;
  }

  getParcels(): Map<string, Parcel> {
    return this.knownParcels;
  }

  pickupParcel(parcelId: string): void {
    const parcel = this.knownParcels.get(parcelId);
    if (!parcel) {
      error(
        `Cannot pick up parcel ${parcelId} - not found in known parcels`,
        this.id,
      );
      return;
    }
    parcel.setCarriedBy(this.id);
    debug(`Picked parcel ${parcelId}`, this.id);
  }

  pickupParcelFailedFromAction(): void {
    for (const parcel of this.knownParcels.values()) {
      if (
        this.pos.x === parcel.getPos().x &&
        this.pos.y === parcel.getPos().y
      ) {
        this.knownParcels.delete(parcel.getId());
        debug(
          `Pickup failed for parcel ${parcel.getId()}, removing from discovered`,
          this.id,
        );
      }
    }
  }

  clearParcels(): void {
    for (const [parcelId, parcel] of this.knownParcels.entries()) {
      if (parcel.getCarriedBy() === this.id) {
        this.knownParcels.delete(parcelId);
      }
    }
    debug(`Cleared carrying parcels`, this.id);
  }

  removeParcelsById(parcelIds: Set<string>): void {
    for (const parcelId of parcelIds) {
      if (this.knownParcels.has(parcelId)) {
        this.knownParcels.delete(parcelId);
        debug(`Removed parcel ${parcelId} from known parcels`, this.id);
      }
    }
  }

  isPickupAvailable(): boolean {
    for (const parcel of this.knownParcels.values()) {
      if (
        this.pos.x === parcel.getPos().x &&
        this.pos.y === parcel.getPos().y &&
        !parcel.getCarriedBy()
      ) {
        return true;
      }
    }
    return false;
  }

  getAllAgents(): ExternalAgent[] {
    return this.agentsBelief.getAllAgents();
  }

  updateAgentsFromSensing(agents: DeliverooAgentFromUpdate[]): Set<string> {
    return this.agentsBelief.updateAgents(agents);
  }

  removeAgent(agentId: string): void {
    this.agentsBelief.removeAgent(agentId);
  }

  removeForeignAgentsById(agentIds: Set<string>): void {
    this.agentsBelief.removeForeignAgentsById(agentIds);
  }

  getGroupAgents(): Map<string, ExternalAgent> {
    return this.agentsBelief.getGroupAgents();
  }

  mergeFromMessage(
    otherAgentId: string,
    otherAgentBeliefs: ReducedBeliefSet,
    updateSeen: boolean = true,
  ): void {
    this.agentsBelief.merge(otherAgentBeliefs.agentsBelief, updateSeen);

    for (const [parcelId, parcel] of otherAgentBeliefs.knownParcels.entries()) {
      const optionalParcel = this.knownParcels.get(parcelId);
      if (!optionalParcel) {
        debug(
          `Adding new known parcel ${parcelId} from message of ${otherAgentId}`,
          this.id,
        );
        this.knownParcels.set(parcelId, parcel);
        continue;
      }

      // Skip updates of parcels older than the last update we have for the same parcel
      if (optionalParcel.getLastSeen() > parcel.getLastSeen()) {
        debug(
          `Skipping update of parcel ${parcelId} from message of ${otherAgentId} because it's older than our last seen`,
          this.id,
        );
        continue;
      }

      debug(
        `Updating known parcel ${parcelId} from message of ${otherAgentId}`,
        this.id,
      );
      this.knownParcels.set(parcelId, parcel);
    }
  }

  toObject(): any {
    const knownParcelsObj: any = {};
    for (const [parcelId, parcel] of this.knownParcels.entries()) {
      knownParcelsObj[parcelId] = {
        id: parcel.getId(),
        x: parcel.getPos().x,
        y: parcel.getPos().y,
        carriedBy: parcel.getCarriedBy() ?? null,
        reward: parcel.getReward(),
        lastSeen: parcel.getLastSeen(),
      };
    }
    return {
      id: this.id,
      pos: this.pos,
      knownParcels: knownParcelsObj,
      agentsBelief: this.agentsBelief,
    };
  }
}

export class BeliefSet extends ReducedBeliefSet {
  private mapBelief: MapBelief;

  constructor(
    id: string,
    unserialized_map: { width: number; height: number; tiles: Tile[] },
    pos: Position,
  ) {
    super(id, pos);
    this.mapBelief = new MapBelief(unserialized_map);
    this.pos = normalizePos(pos);
  }

  getMap(): TileType[][] {
    return this.mapBelief.getMap();
  }

  updateMap(width: number, height: number, tiles: Tile[]): void {
    const map = MapBelief.convertMap({ width, height, tiles });
    this.mapBelief.update(map);
    this.agentsBelief.reset();
    this.knownParcels = new Map<string, Parcel>();
  }

  getDeliveryTiles(): Position[] {
    return this.mapBelief.getDeliveryTiles();
  }

  getSpawnableTiles(): SpawnableTiles[] {
    return this.mapBelief.getSpawnableTiles();
  }

  isDeliveryAvailable(): boolean {
    if (this.getCarryingParcels().size !== 0 && this.isOnDeliveryTile()) {
      return true;
    }
    return false;
  }

  isOnDeliveryTile(): boolean {
    if (!this.mapBelief.contains(this.pos)) {
      return false;
    }
    if (this.mapBelief.getMap()[this.pos.y][this.pos.x] === TileType.DELIVERY) {
      return true;
    }
    return false;
  }

  deliverParcel(parcelId: string): void {
    if (this.knownParcels.has(parcelId)) {
      this.knownParcels.delete(parcelId);
      debug(`Delivered parcel ${parcelId}`, this.id);
    } else {
      warn(`Cannot deliver parcel ${parcelId} - not carrying it`, this.id);
    }

    if (this.isOnDeliveryTile()) {
      this.knownParcels.delete(parcelId);
      debug(`Removed parcel ${parcelId} from parcels list`, this.id);
    }
  }

  updateKnownParcelsFromParcelUpdate(
    parcels: DeliverooParcelType[],
  ): [boolean, Set<string>] {
    let somethingChanged = false;
    // TODO: Revise somethingChanged
    const carryingParcels = this.getCarryingParcels();

    for (const parcel of parcels) {
      if (!this.mapBelief.contains(parcel)) {
        error(`Position of parcel out of bounds: (${parcel.x}, ${parcel.y})`);
        continue;
      }
      const optionalParcel = this.knownParcels.get(parcel.id);
      if (optionalParcel) {
        // We already knew about the parcel
        optionalParcel.setPos({
          x: Math.floor(parcel.x),
          y: Math.floor(parcel.y),
        });
        optionalParcel.setCarriedBy(parcel.carriedBy);
        optionalParcel.setReward(parcel.reward);
        optionalParcel.setSeen();

        // we discover that the parcel is now being carried by us
        if (
          parcel.carriedBy &&
          parcel.carriedBy === this.id &&
          !carryingParcels.has(parcel.id)
        ) {
          optionalParcel.setCarriedBy(this.id);

          debug(
            `Parcel ${parcel.id} is now carried by ${parcel.carriedBy}`,
            this.id,
          );
          somethingChanged = true;
        }
      } else {
        // New parcel discovered
        this.knownParcels.set(
          parcel.id,
          Parcel.FromDeliverooParcelUpdate(parcel),
        );
        if (parcel.carriedBy && parcel.carriedBy === this.id) {
          error(
            `Parcel ${parcel.id} is already carried by us but we didn't know about it, adding to carrying parcels`,
          );
        }
        debug(`Discovered new parcel ${parcel.id}`, this.id);
        somethingChanged = true;
      }
    }

    // While transporting a parcel, if it expires drop it
    const parcelIds = parcels.map((p) => p.id);
    for (const parcelId of this.getCarryingParcels()) {
      if (!parcelIds.includes(parcelId)) {
        this.knownParcels.delete(parcelId);
        debug(`Parcel ${parcelId} dropped`, this.id);
        somethingChanged = true;
      }
    }

    // Get all known parcelIds that are within parcel sensing range,
    // if not present in the update, remove them because they are expired.
    // Distance is not gemoetric, but the number of tiles between the agent and
    // the parcel, considering also walls

    const deletedParcelIds = new Set<string>();
    for (const [parcelId, parcel] of this.knownParcels.entries()) {
      const distance =
        Math.abs(parcel.getPos().x - this.pos.x) +
        Math.abs(parcel.getPos().y - this.pos.y);
      if (
        distance <= config.parcelSensingDistance &&
        !parcelIds.includes(parcelId)
      ) {
        this.knownParcels.delete(parcelId);
        deletedParcelIds.add(parcelId);
        debug(
          `Parcel ${parcelId} is within sensing range but not in the update, removing from known parcels`,
          this.id,
        );
        somethingChanged = true;
      }
    }

    debug(`Updated parcels: ${this.knownParcels.size}`, this.id);
    return [somethingChanged, deletedParcelIds];
  }
}
