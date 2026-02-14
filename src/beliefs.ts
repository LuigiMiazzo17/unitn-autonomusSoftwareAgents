import {
  AgentFromUpdate as DeliverooAgentFromUpdate,
  Parcel as DeliverooParcelType,
  Tile,
} from "@unitn-asa/deliveroo-js-client";
import config from "config";
import crypto from "crypto";
import { debug, error, info, warn } from "src/utils/log";
import { isInsideMap } from "./planning";
import { Position, SpawnableTiles, TileType } from "./beliefs/types";
import Parcel from "./beliefs/Parcel";

export class ExternalAgent {
  private id: string;
  private pos: Position;
  private lastSeen: Date;

  constructor(id: string, pos: Position, lastSeen?: Date) {
    this.id = id;
    this.pos = pos;
    this.lastSeen = lastSeen ?? new Date();
  }

  getId(): string {
    return this.id;
  }

  getPos(): Position {
    return this.pos;
  }

  updatePos(pos: Position): void {
    this.pos = pos;
  }

  getLastSeen() {
    return this.lastSeen;
  }

  setSeen() {
    this.lastSeen = new Date();
  }
}

export class ReducedBeliefSet {
  protected id: string;
  protected pos: Position;
  protected knownParcels: Map<string, Parcel> = new Map<string, Parcel>();
  protected foreignAgents: Map<string, ExternalAgent> = new Map();
  protected groupAgents: Map<string, ExternalAgent> = new Map();

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
    const agentsStr = this.getAllAgentsArray()
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

  getKnwonAgentsIds(): Set<string> {
    return new Set<string>([
      ...this.foreignAgents.keys(),
      ...this.groupAgents.keys(),
    ]);
  }

  getAllAgentsArray(): ExternalAgent[] {
    const allAgents: ExternalAgent[] = [
      ...this.foreignAgents.values(),
      ...this.groupAgents.values(),
    ];
    return allAgents;
  }

  updateAgentsFromSensing(
    agents: DeliverooAgentFromUpdate[],
  ): [boolean, Set<string>] {
    let somethingHasChanged = false;
    // TODO: Revise somethingHasChanged

    for (const agent of agents) {
      const optionalGroupAgent = this.groupAgents.get(agent.id);
      if (optionalGroupAgent) {
        debug(
          `Updating group agent ${agent.id} position to (${Math.floor(agent.x)}, ${Math.floor(agent.y)})`,
          this.id,
        );
        optionalGroupAgent.updatePos({
          x: Math.floor(agent.x),
          y: Math.floor(agent.y),
        });
        optionalGroupAgent.setSeen();
        continue;
      }

      const optionalForeignAgent = this.foreignAgents.get(agent.id);
      if (optionalForeignAgent) {
        debug(
          `Updating foreign agent ${agent.id} position to (${Math.floor(agent.x)}, ${Math.floor(agent.y)})`,
          this.id,
        );
        optionalForeignAgent.updatePos({
          x: Math.floor(agent.x),
          y: Math.floor(agent.y),
        });
      } else {
        info(
          `Discovered new foreign agent ${agent.id} at position (${Math.floor(agent.x)}, ${Math.floor(agent.y)})`,
          this.id,
        );
        this.foreignAgents.set(
          agent.id,
          new ExternalAgent(agent.id, {
            x: Math.floor(agent.x),
            y: Math.floor(agent.y),
          }),
        );
      }
    }

    // Get all known agentIds that are within agent sensing range,
    // if not present in the update, remove them because they are expired.

    const deletedAgentIds = new Set<string>();
    for (const [agentId, agent] of this.foreignAgents.entries()) {
      const distance =
        Math.abs(agent.getPos().x - this.pos.x) +
        Math.abs(agent.getPos().y - this.pos.y);
      if (
        distance < config.agentSensingDistance &&
        !agents.some((a) => a.id === agentId)
      ) {
        this.foreignAgents.delete(agentId);
        deletedAgentIds.add(agentId);
        debug(
          `Agent ${agentId} is within sensing range but not in the update, removing from foreign agents`,
          this.id,
        );
      }
    }

    // We don't want to remove group agents, because they are better handled
    // with the connection manager

    return [somethingHasChanged, deletedAgentIds];
  }

  removeAgent(agentId: string): void {
    if (this.groupAgents.has(agentId)) {
      debug(`Removing agent ${agentId} from group agents`, this.id);
      this.groupAgents.delete(agentId);
    } else if (this.foreignAgents.has(agentId)) {
      debug(`Removing agent ${agentId} from foreign agents`, this.id);
      this.foreignAgents.delete(agentId);
    } else {
      error(
        `Cannot remove agent ${agentId} - not found in known agents`,
        this.id,
      );
    }
  }

  removeForeignAgentsById(agentIds: Set<string>): void {
    for (const agentId of agentIds) {
      if (this.foreignAgents.has(agentId)) {
        this.foreignAgents.delete(agentId);
        debug(`Removed agent ${agentId} from foreign agents`, this.id);
      }
    }
  }

  getForeignAgents(): Map<string, ExternalAgent> {
    return this.foreignAgents;
  }

  updateForeignAgents(agents: Map<string, ExternalAgent>): void {
    this.foreignAgents = agents;
  }

  getGroupAgents(): Map<string, ExternalAgent> {
    return this.groupAgents;
  }

  updateGroupAgents(agents: Map<string, ExternalAgent>): void {
    this.groupAgents = agents;
  }

  mergeFromMessage(
    otherAgentId: string,
    otherAgentBeliefs: ReducedBeliefSet,
    updateSeen: boolean = true,
  ): void {
    // First thing first, update the agent who sent the message
    const groupAgent = this.groupAgents.get(otherAgentId);
    if (groupAgent) {
      groupAgent.updatePos(otherAgentBeliefs.getPos());
      if (updateSeen) {
        groupAgent.setSeen();
      }
    } else {
      this.groupAgents.set(
        this.id,
        new ExternalAgent(otherAgentId, otherAgentBeliefs.getPos()),
      );
    }

    // If sender is in foreign agents, move it to group agents because we now know that it's in our group
    if (this.foreignAgents.has(otherAgentId)) {
      debug(
        `Agent ${otherAgentId} is now in our group according to message, moving from foreign agents to group agents`,
        this.id,
      );
      this.foreignAgents.delete(otherAgentId);
      console.log("EVVIVA");
      this.groupAgents.set(
        otherAgentId,
        new ExternalAgent(otherAgentId, otherAgentBeliefs.getPos()),
      );
    }

    // Now update all foreign agent knowledge
    for (const [
      foreignAgentId,
      foreignAgent,
    ] of otherAgentBeliefs.foreignAgents.entries()) {
      if (foreignAgentId === this.id) {
        error(
          `Agent ${otherAgentId} thinks we are a foreign agent, ignoring`,
          this.id,
        );
        continue;
      }

      // If we don't know about this agent, add it to foreign agents
      const optionalForeignAgent = this.foreignAgents.get(foreignAgentId);
      if (!optionalForeignAgent) {
        info(
          `Adding new foreign agent ${foreignAgentId} from message of ${otherAgentId}`,
          this.id,
        );
        this.foreignAgents.set(foreignAgentId, foreignAgent);
        continue;
      }

      // Skip updates of agents older than the last update we have for the same
      // agent
      if (optionalForeignAgent.getLastSeen() > foreignAgent.getLastSeen()) {
        debug(
          `Skipping update of agent ${foreignAgentId} from message of ${otherAgentId} because it's older than our last seen`,
          this.id,
        );
        continue;
      }

      // The other agent thinks that this foreign agent is not in our group,
      // better if we ignore it because we know better
      if (this.groupAgents.has(foreignAgentId)) {
        continue;
      }

      // Update foreign agent position and last seen
      debug(
        `Updating foreign agent ${foreignAgentId} from message of ${otherAgentId}`,
        this.id,
      );
      this.foreignAgents.set(foreignAgentId, foreignAgent);
    }

    for (const [
      groupAgentId,
      groupAgent,
    ] of otherAgentBeliefs.groupAgents.entries()) {
      if (groupAgentId === this.id) {
        debug("Don't process our self in group update", this.id);
        continue;
      }

      // If we don't know about this agent, add it to group agents
      const optionalGroupAgent = this.groupAgents.get(groupAgentId);
      if (!optionalGroupAgent) {
        info(
          `Adding new group agent ${groupAgentId} from message of ${otherAgentId}`,
          this.id,
        );
        this.groupAgents.set(groupAgentId, groupAgent);
        continue;
      }

      // Skip updates of agents older than the last update we have for the same agent
      if (optionalGroupAgent.getLastSeen() > groupAgent.getLastSeen()) {
        debug(
          `Skipping update of group agent ${groupAgentId} from message of ${otherAgentId} because it's older than our last seen`,
          this.id,
        );
        continue;
      }

      // If we thought that this agent was a foreign agent, remove it from foreign agents and add to group agents
      if (this.foreignAgents.has(groupAgentId)) {
        debug(
          `Agent ${groupAgentId} is now in our group according to message of ${otherAgentId}, moving from foreign agents to group agents`,
          this.id,
        );
        this.foreignAgents.delete(groupAgentId);
        this.groupAgents.set(groupAgentId, groupAgent);
        continue;
      }

      debug(
        `Updating group agent ${groupAgentId} from message of ${otherAgentId}`,
        this.id,
      );
      this.groupAgents.set(groupAgentId, groupAgent);
    }

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
        lastSeen: parcel.getLastSeen().toISOString(),
      };
    }
    const foreignAgentsObj: any = {};
    for (const [agentId, agent] of this.foreignAgents.entries()) {
      foreignAgentsObj[agentId] = {
        id: agent.getId(),
        pos: { x: agent.getPos().x, y: agent.getPos().y },
        lastSeen: agent.getLastSeen().toISOString(),
      };
    }
    const groupAgentsObj: any = {};
    for (const [agentId, agent] of this.groupAgents.entries()) {
      groupAgentsObj[agentId] = {
        id: agent.getId(),
        pos: { x: agent.getPos().x, y: agent.getPos().y },
        lastSeen: agent.getLastSeen().toISOString(),
      };
    }
    return {
      id: this.id,
      pos: this.pos,
      knownParcels: knownParcelsObj,
      foreignAgents: foreignAgentsObj,
      groupAgents: groupAgentsObj,
    };
  }
}

export class BeliefSet extends ReducedBeliefSet {
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
    this.foreignAgents = new Map<string, ExternalAgent>();
    this.groupAgents = new Map<string, ExternalAgent>();
    this.knownParcels = new Map<string, Parcel>();
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
    if (this.getCarryingParcels().size !== 0 && this.isOnDeliveryTile()) {
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

  updateKnownParcelsFromParcelUpdate(
    parcels: DeliverooParcelType[],
  ): [boolean, Set<string>] {
    let somethingChanged = false;
    // TODO: Revise somethingChanged
    const carryingParcels = this.getCarryingParcels();

    for (const parcel of parcels) {
      if (!isInsideMap(this.map, parcel)) {
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

export class ReducedBeliefSetWithout {
  static fromObject(obj: any): ReducedBeliefSet {
    // this is used in message passing, so map, deliveryTiles and spawnableTiles
    // are not included in the message because each agent has the same thing

    // Field: id: string
    if (typeof obj.id !== "string") {
      throw new Error("Invalid belief set: id should be a string");
    }

    // Field: pos: Position
    if (typeof obj.pos !== "object") {
      throw new Error("Invalid belief set: pos should be an object");
    }
    if (typeof obj.pos.x !== "number" || typeof obj.pos.y !== "number") {
      throw new Error("Invalid belief set: pos should have numeric x and y");
    }

    // Field: knownParcels: Map<string, DeliverooParcelType>
    if (typeof obj.knownParcels !== "object") {
      throw new Error("Invalid belief set: parcels should be an object");
    }

    const knownParcels = new Map<string, Parcel>();
    for (const [parcelId, parcel] of Object.entries(obj.knownParcels) as [
      string,
      any,
    ]) {
      if (typeof parcel.id !== "string") {
        throw new Error("Invalid belief set: parcel id should be a string");
      }
      if (typeof parcel.x !== "number" || typeof parcel.y !== "number") {
        throw new Error(
          "Invalid belief set: parcel position should have numeric x and y",
        );
      }
      if (parcel.carriedBy !== null && typeof parcel.carriedBy !== "string") {
        throw new Error(
          "Invalid belief set: parcel carriedBy should be null or a string",
        );
      }
      if (typeof parcel.reward !== "number") {
        throw new Error("Invalid belief set: parcel reward should be a number");
      }
      if (typeof parcel.lastSeen !== "string") {
        throw new Error(
          "Invalid belief set: parcel lastSeen should be a string",
        );
      }

      knownParcels.set(
        parcelId,
        new Parcel(
          parcel.id,
          {
            x: Math.floor(parcel.x),
            y: Math.floor(parcel.y),
          },
          parcel.reward,
          parcel.carriedBy ?? undefined,
          new Date(parcel.lastSeen),
        ),
      );
    }

    // Field: foreignAgents: Map<string, ExternalForeignAgent>
    if (typeof obj.foreignAgents !== "object") {
      throw new Error("Invalid belief set: foreignAgents should be an object");
    }

    const foreignAgents = new Map<string, ExternalAgent>();
    for (const [agentId, agent] of Object.entries(obj.foreignAgents) as [
      string,
      any,
    ]) {
      if (typeof agentId !== "string") {
        throw new Error(
          "Invalid belief set: foreign agent id should be a string",
        );
      }
      if (typeof agent.pos !== "object") {
        throw new Error(
          "Invalid belief set: foreign agent pos should be an object",
        );
      }
      if (typeof agent.pos.x !== "number" || typeof agent.pos.y !== "number") {
        throw new Error(
          "Invalid belief set: foreign agent pos should have numeric x and y",
        );
      }
      if (typeof agent.lastSeen !== "string") {
        throw new Error(
          "Invalid belief set: foreign agent lastSeen should be a string",
        );
      }

      foreignAgents.set(
        agentId,
        new ExternalAgent(
          agentId,
          {
            x: Math.floor(agent.pos.x),
            y: Math.floor(agent.pos.y),
          },
          new Date(agent.lastSeen),
        ),
      );
    }

    // Field: groupAgents: Map<string, ExternalGroupAgent>
    if (typeof obj.groupAgents !== "object") {
      throw new Error("Invalid belief set: groupAgents should be an object");
    }

    const groupAgents = new Map<string, ExternalAgent>();
    for (const [agentId, agent] of Object.entries(obj.groupAgents) as [
      string,
      any,
    ]) {
      if (typeof agentId !== "string") {
        throw new Error(
          "Invalid belief set: group agent id should be a string",
        );
      }
      if (typeof agent.pos !== "object") {
        throw new Error(
          "Invalid belief set: group agent pos should be an object",
        );
      }
      if (typeof agent.pos.x !== "number" || typeof agent.pos.y !== "number") {
        throw new Error(
          "Invalid belief set: group agent pos should have numeric x and y",
        );
      }
      if (typeof agent.lastSeen !== "string") {
        throw new Error(
          "Invalid belief set: group agent lastSeen should be a string",
        );
      }

      groupAgents.set(
        agentId,
        new ExternalAgent(
          agentId,
          {
            x: Math.floor(agent.pos.x),
            y: Math.floor(agent.pos.y),
          },
          new Date(agent.lastSeen),
        ),
      );
    }

    const beliefSet = new ReducedBeliefSet(obj.id, {
      x: Math.floor(obj.pos.x),
      y: Math.floor(obj.pos.y),
    });
    beliefSet.updateKnownParcels(knownParcels);
    beliefSet.updateForeignAgents(foreignAgents);
    beliefSet.updateGroupAgents(groupAgents);
    return beliefSet;
  }
}
