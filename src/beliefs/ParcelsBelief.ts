import { Parcel as DeliverooParcelType } from "@unitn-asa/deliveroo-js-client";
import config from "config";
import Parcel from "src/beliefs/Parcel";
import { MeAgent } from "src/beliefs/agents";
import { debug, error } from "src/utils/log";

export default class ParcelsBelief {
  private knownParcels: Map<string, Parcel> = new Map<string, Parcel>();
  private parcelsHandedOff: Set<string> = new Set<string>();

  static fromJSON(o: object): ParcelsBelief {
    const pb = Object.assign(new ParcelsBelief(), o);
    pb.knownParcels = new Map<string, Parcel>(
      Object.entries(o["knownParcels"]).map(([id, parcel]) => [
        id,
        Object.assign(new Parcel(id, { x: 0, y: 0 }, 0), parcel),
      ]),
    );
    return pb;
  }

  getParcels(): MapIterator<Parcel> {
    return this.knownParcels.values();
  }

  getParcel(id: string): Parcel | undefined {
    return this.knownParcels.get(id);
  }

  deleteParcel(id: string): void {
    this.knownParcels.delete(id);
  }

  clear() {
    this.knownParcels.clear();
  }

  pickupParcel(parcelId: string, agentId: string): void {
    const parcel = this.knownParcels.get(parcelId);
    if (!parcel) {
      error(`Cannot pick up parcel ${parcelId} - not found in known parcels`);
      return;
    }
    parcel.setCarriedBy(agentId);
    debug(`Picked up parcel ${parcelId}`);
  }

  deliverParcels(agentId: string): void {
    for (const [parcelId, parcel] of this.knownParcels.entries()) {
      if (parcel.getCarriedBy() === agentId) {
        this.knownParcels.delete(parcelId);
      }
    }
    debug(`Cleared carrying parcels`);
  }

  handoffParcels(agentId: string) {
    for (const [parcelId, parcel] of this.knownParcels.entries()) {
      if (parcel.getCarriedBy() === agentId) {
        this.parcelsHandedOff.add(parcelId);
        this.knownParcels.delete(parcelId);
      }
    }
  }

  ignoreParcel(parcelId: string): boolean {
    return this.parcelsHandedOff.has(parcelId);
  }

  removeParcelsById(parcelIds: Set<string>): void {
    for (const parcelId of parcelIds) {
      if (this.knownParcels.has(parcelId)) {
        this.knownParcels.delete(parcelId);
        debug(`Removed parcel ${parcelId} from known parcels`);
      }
    }
  }

  isPickupAvailable(agent: MeAgent): boolean {
    for (const parcel of this.knownParcels.values()) {
      if (agent.isOn(parcel.getPos()) && !parcel.getCarriedBy()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Add or update a parcel in the belief. Only updates if the new parcel has a more recent last seen timestamp than the current one.
   * @param newParcel The new parcel information to add or update in the belief.
   */
  private upsertParcel(newParcel: Parcel): void {
    const currentParcel = this.knownParcels.get(newParcel.getId());
    if (
      !currentParcel ||
      newParcel.getLastSeen() > currentParcel.getLastSeen()
    ) {
      this.setParcel(newParcel);
    }
  }

  private setParcel(parcel: Parcel): void {
    if (!this.ignoreParcel(parcel.getId())) {
      this.knownParcels.set(parcel.getId(), parcel);
    }
  }

  merge(otherParcelsBelief: ParcelsBelief) {
    for (const parcel of otherParcelsBelief.getParcels()) {
      this.upsertParcel(parcel);
    }
  }

  getCarriedParcels(agentId: string): Set<string> {
    const carrying = new Set<string>();
    for (const parcel of this.getParcels()) {
      if (parcel.getCarriedBy() === agentId) {
        carrying.add(parcel.getId());
      }
    }
    return carrying;
  }

  updateParcels(parcels: DeliverooParcelType[], agent: MeAgent): Set<string> {
    for (const parcel of parcels) {
      this.setParcel(Parcel.fromUpdateParcel(parcel));
    }

    // While transporting a parcel, if it expires drop it
    const parcelIds = parcels.map((p) => p.id);
    for (const parcelId of this.getCarriedParcels(agent.getId())) {
      if (!parcelIds.includes(parcelId)) {
        this.knownParcels.delete(parcelId);
        debug(`Parcel ${parcelId} dropped`, agent.getId());
      }
    }

    // Get all known parcelIds that are within parcel sensing range,
    // if not present in the update, remove them because they are expired.
    // Distance is not gemoetric, but the number of tiles between the agent and
    // the parcel, considering also walls
    const deletedParcelIds = new Set<string>();
    for (const [parcelId, parcel] of this.knownParcels.entries()) {
      const distance = agent.manhattanDistance(parcel.getPos());
      if (
        distance <= config.parcelSensingDistance &&
        !parcelIds.includes(parcelId)
      ) {
        this.knownParcels.delete(parcelId);
        deletedParcelIds.add(parcelId);
        debug(
          `Parcel ${parcelId} is within sensing range but not in the update, removing from known parcels`,
        );
      }
    }

    debug(`Updated parcels: ${this.knownParcels.size}`, agent.getId());
    return deletedParcelIds;
  }
}
