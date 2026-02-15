import {
  AgentFromUpdate as DeliverooAgentFromUpdate,
  Parcel as DeliverooParcelType,
  Tile,
} from "@unitn-asa/deliveroo-js-client";
import crypto from "crypto";
import { ExternalAgent } from "src/beliefs/agents";
import AgentsBelief from "src/beliefs/AgentsBelief";
import MapBelief from "src/beliefs/MapBelief";
import Parcel from "src/beliefs/Parcel";
import ParcelsBelief from "src/beliefs/ParcelsBelief";
import { Position, SpawnableTiles, TileType } from "src/beliefs/types";
import { debug } from "src/utils/log";

export class ReducedBeliefSet {
  protected agentsBelief: AgentsBelief;
  protected parcelsBelief: ParcelsBelief;

  constructor(id: string, pos: Position) {
    this.agentsBelief = new AgentsBelief(id, pos);
    this.parcelsBelief = new ParcelsBelief();
  }

  static fromJSON(o: object): ReducedBeliefSet {
    const rbs = Object.assign(new ReducedBeliefSet("", { x: 0, y: 0 }), o);
    rbs.agentsBelief = AgentsBelief.fromJSON(o["agentsBelief"]);
    rbs.parcelsBelief = ParcelsBelief.fromJSON(o["parcelsBelief"]);
    return rbs;
  }

  protected getAgentId(): string {
    return this.agentsBelief.me.getId();
  }

  getAgentPos(): Position {
    return this.agentsBelief.me.getPos();
  }

  updateAgentPos(pos: Position): void {
    this.agentsBelief.me.updatePos(pos);
  }

  getCarriedParcels(): Set<Parcel> {
    const carrying = new Set<Parcel>();
    for (const parcel of this.parcelsBelief.getParcels()) {
      if (parcel.getCarriedBy() === this.getAgentId()) {
        carrying.add(parcel);
      }
    }
    return carrying;
  }

  getChecksumOfBeliefs(): string {
    const parcelsStr = Array.from(this.parcelsBelief.getParcels())
      .map((p) => {
        let carriedBy = p.getCarriedBy() ?? "null";
        if (p.getCarriedBy() == this.getAgentId()) {
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

  getMasterAgentId(): string | null {
    return this.agentsBelief.getMasterAgentId();
  }

  getParcels(): MapIterator<Parcel> {
    return this.parcelsBelief.getParcels();
  }

  pickupParcel(parcelId: string): void {
    this.parcelsBelief.pickupParcel(parcelId, this.getAgentId());
  }

  pickupParcelFailedFromAction(): void {
    for (const parcel of this.parcelsBelief.getParcels()) {
      if (this.agentsBelief.me.isOn(parcel.getPos())) {
        this.parcelsBelief.deleteParcel(parcel.getId());
        debug(
          `Pickup failed for parcel ${parcel.getId()}, removing from discovered`,
        );
      }
    }
  }

  deliverParcels(): void {
    this.parcelsBelief.deliverParcels(this.getAgentId());
  }

  handoffParcels(): void {
    this.parcelsBelief.handoffParcels(this.getAgentId());
  }

  ignoreParcel(parcelId: string): boolean {
    return this.parcelsBelief.ignoreParcel(parcelId);
  }

  resetHandedOffParcels(parcelIds: string[]): void {
    this.parcelsBelief.resetHandedOffParcels(parcelIds);
  }

  removeParcelsById(parcelIds: Set<string>): void {
    this.parcelsBelief.removeParcelsById(parcelIds);
  }

  private isPickupAvailable(): boolean {
    return this.parcelsBelief.isPickupAvailable(this.agentsBelief.me);
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

  getGroupAgents(): MapIterator<ExternalAgent> {
    return this.agentsBelief.getGroupAgents();
  }

  merge(otherAgentBeliefs: ReducedBeliefSet, updateSeen: boolean = true): void {
    this.agentsBelief.merge(otherAgentBeliefs.agentsBelief, updateSeen);
    this.parcelsBelief.merge(otherAgentBeliefs.parcelsBelief);
  }

  toObject(): object {
    return {
      parcelsBelief: this.parcelsBelief,
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
  }

  getMap(): TileType[][] {
    return this.mapBelief.getMap();
  }

  mapContains(pos: Position): boolean {
    return this.mapBelief.contains(pos);
  }

  isWalkable(pos: Position): boolean {
    const tile = this.mapBelief.getTile(pos);
    const tileTypeWalkable =
      tile === TileType.EMPTY ||
      tile === TileType.DELIVERY ||
      tile === TileType.SPAWNABLE;
    const occupiedByAgent = Array.from(this.agentsBelief.getAllAgents()).some(
      (agent) => agent.isOn(pos),
    );
    return tileTypeWalkable && !occupiedByAgent;
  }

  updateMap(width: number, height: number, tiles: Tile[]): void {
    const map = MapBelief.fromRawMap({ width, height, tiles });
    this.mapBelief.update(map);
    this.agentsBelief.clear();
    this.parcelsBelief.clear();
  }

  getSpawnableTiles(): SpawnableTiles[] {
    return this.mapBelief.getSpawnableTiles();
  }

  private isDeliveryAvailable(): boolean {
    if (this.getCarriedParcels().size !== 0 && this.isOnDeliveryTile()) {
      return true;
    }
    return false;
  }

  private isOnDeliveryTile(): boolean {
    return this.mapBelief.getTile(this.getAgentPos()) === TileType.DELIVERY;
  }

  isOnSpawnableTile(): boolean {
    return this.mapBelief.getTile(this.getAgentPos()) === TileType.SPAWNABLE;
  }

  markCurrentSpawnableTileChecked() {
    this.mapBelief.markSpawnableTileChecked(this.getAgentPos());
  }

  updateKnownParcelsFromParcelUpdate(
    parcels: DeliverooParcelType[],
  ): Set<string> {
    const inMapParcels = parcels.filter((parcel) =>
      this.mapBelief.contains(parcel),
    );

    return this.parcelsBelief.updateParcels(inMapParcels, this.agentsBelief.me);
  }
}
