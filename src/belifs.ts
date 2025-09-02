import {
  Agent as DeliverooAgentType,
  Parcel as DeliverooParcelType,
  Tile,
} from "@unitn-asa/deliveroo-js-client";
import config from "config";
import crypto from "crypto";
import { Queue } from "queue-typed";
import { Intent } from "src/itents";
import { debug, info, error } from "src/utils/log";

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

type SpawnableTiles = {
  pos: Position;
  checkedCount: number;
};

export class BelifsSet {
  private id: string;
  private pos: Position;
  private map: TileType[][];
  private deliveryTiles: Position[] = [];
  private parcels: DeliverooParcelType[] = [];
  private agents: DeliverooAgentType[] = [];
  private carryingParcels: Set<string> = new Set<string>();
  private spawnableTiles: SpawnableTiles[];
  private sortedClosestDeliveryTileCache: { [key: string]: Position[] } = {};
  private knownGroupAgents: Set<string> = new Set<string>();

  constructor(
    id: string,
    map: { width: number; height: number; tiles: Tile[] },
    pos: Position,
  ) {
    this.id = id;
    this.map = BelifsSet.convertMap(map);

    // precalculate deplivery tiles
    this.deliveryTiles = this.map
      .map((row, y) =>
        row
          .map((tile, x) => (tile === TileType.DELIVERY ? { x, y } : null))
          .filter((pos) => pos !== null)
          .map((pos) => pos as Position),
      )
      .flat();
    this.pos = pos;
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
    if (this.map[this.pos.y][this.pos.x] === TileType.DELIVERY) {
      return true;
    }
    return false;
  }

  getHuntingMovePlan(): Queue<Intent> {
    const queue = new Queue<Intent>();

    if (this.isPickupAvailable()) {
      queue.push(Intent.PICKUP);
      return queue;
    }

    if (this.isDeliveryAvailable()) {
      queue.push(Intent.DELIVER);
      return queue;
    }

    const lessSeenedSpawnableTiles = this.spawnableTiles.sort(
      (a, b) => a.checkedCount - b.checkedCount,
    );
    const lessSeenedSpawnable =
      lessSeenedSpawnableTiles[
        Math.floor(Math.random() * lessSeenedSpawnableTiles.length)
      ];

    if (lessSeenedSpawnable) {
      lessSeenedSpawnable.checkedCount += 1;
      const pathToSpawnable = this.dijsktra(this.pos, lessSeenedSpawnable.pos);
      if (pathToSpawnable && pathToSpawnable.length > 0) {
        for (const intent of pathToSpawnable) {
          queue.push(intent);
        }
      } else {
        error(
          `No path found to spawnable tile at (${lessSeenedSpawnable.pos.x}, ${lessSeenedSpawnable.pos.y})`,
          this.id,
        );
        return this.randomMove();
      }
    } else {
      throw new Error("No spawnable tiles found");
    }

    return queue;
  }

  randomMove(): Queue<Intent> {
    const queue = new Queue<Intent>();
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

  distance_vector(start: Position): [number[][], Position[][]] {
    const directions: {
      [key: string]: { dx: number; dy: number; intent: Intent };
    } = {
      up: { dx: 0, dy: 1, intent: Intent.MOVE_UP },
      down: { dx: 0, dy: -1, intent: Intent.MOVE_DOWN },
      left: { dx: -1, dy: 0, intent: Intent.MOVE_LEFT },
      right: { dx: 1, dy: 0, intent: Intent.MOVE_RIGHT },
    };

    const rows = this.map.length;
    const cols = this.map[0].length;

    const distances = Array.from({ length: rows }, () =>
      Array(cols).fill(Infinity),
    );
    const previous = Array.from({ length: rows }, () => Array(cols).fill(null));
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));

    distances[start.y][start.x] = 0;

    const pq: { pos: Position; dist: number }[] = [];
    pq.push({ pos: start, dist: 0 });

    while (pq.length > 0) {
      pq.sort((a, b) => a.dist - b.dist);
      const current = pq.shift()!;
      const { x, y } = current.pos;

      if (visited[y][x]) continue;
      visited[y][x] = true;

      for (const dir in directions) {
        const { dx, dy } = directions[dir];
        const nx = x + dx;
        const ny = y + dy;

        if (
          nx >= 0 &&
          nx < cols &&
          ny >= 0 &&
          ny < rows &&
          this.map[ny][nx] !== TileType.WALL
        ) {
          if (
            this.agents
              .filter((a) => a.id !== this.id)
              .some((a) => a.x === nx && a.y === ny)
          ) {
            continue;
          }
          const alt = distances[y][x] + 1;
          if (alt < distances[ny][nx]) {
            distances[ny][nx] = alt;
            previous[ny][nx] = { x, y };
            pq.push({ pos: { x: nx, y: ny }, dist: alt });
          }
        }
      }
    }

    return [distances, previous];
  }

  getPathFromDistances(
    distances: number[][],
    previous: (Position | null)[][],
    goal: Position,
  ): Intent[] | null {
    if (distances === undefined || distances[goal.y][goal.x] === Infinity) {
      error(`No path found to goal at (${goal.x}, ${goal.y})`, this.id);
      return null;
    }

    const path: Position[] = [];
    let curr: Position | null = goal;
    while (curr) {
      path.push(curr);
      curr = previous[curr.y][curr.x];
    }
    path.reverse();

    const intents: Intent[] = [];
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1];
      const to = path[i];
      if (to.x === from.x && to.y === from.y + 1) {
        intents.push(Intent.MOVE_UP);
      } else if (to.x === from.x && to.y === from.y - 1) {
        intents.push(Intent.MOVE_DOWN);
      } else if (to.x === from.x - 1 && to.y === from.y) {
        intents.push(Intent.MOVE_LEFT);
      } else if (to.x === from.x + 1 && to.y === from.y) {
        intents.push(Intent.MOVE_RIGHT);
      } else {
        error("Failed parsing dijistra outcome", this.id);
      }
    }

    return intents;
  }

  dijsktra(start: Position, goal: Position): Intent[] | null {
    const [distances, previous] = this.distance_vector(start);
    return this.getPathFromDistances(distances, previous, goal);
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

  getOrCacheDistanceVectorAndPrevious(
    cache: { [key: string]: [number[][], Position[][]] },
    pos: Position,
  ): [number[][], (Position | null)[][]] {
    const key = `${pos.x},${pos.y}`;
    if (cache[key]) {
      debug(`Using cached distance vector for ${key}`, this.id);
      return [cache[key][0], cache[key][1]];
    }

    debug(`Calculating distance vector from scratch for ${key}`, this.id);

    const [distances, previous] = this.distance_vector(pos);
    cache[key] = [distances, previous];
    return [distances, previous];
  }

  getSortedClosestDeliveryTileFromCache(
    cache: { [key: string]: [number[][], Position[][]] },
    pos: Position,
  ): Position[] {
    const key = `${pos.x},${pos.y}`;
    if (this.sortedClosestDeliveryTileCache[key]) {
      debug(`Using cached sorted closest delivery tiles for ${key}`, this.id);
      return this.sortedClosestDeliveryTileCache[key];
    }

    debug(
      `Calculating sorted closest delivery tiles from scratch for ${key}`,
      this.id,
    );

    if (this.deliveryTiles.length === 0) {
      throw new Error("No delivery tiles found on the map");
    }

    const distances = this.getOrCacheDistanceVectorAndPrevious(cache, pos)[0];

    const deliveryPositions: Position[] = [];
    for (let y = 0; y < this.map.length; y++) {
      for (let x = 0; x < this.map[0].length; x++) {
        if (this.map[y][x] === TileType.DELIVERY) {
          deliveryPositions.push({ x, y });
        }
      }
    }

    const deliveryTilesWithDistance = deliveryPositions.map((tile) => ({
      tile,
      distance: distances[tile.y][tile.x],
    }));

    deliveryTilesWithDistance.sort((a, b) => a.distance - b.distance);

    const sortedTiles = deliveryTilesWithDistance.map((d) => d.tile);
    this.sortedClosestDeliveryTileCache[key] = sortedTiles;
    return sortedTiles;
  }

  getSmartPlan(): Queue<Intent> | null {
    const distanceVectorCache: {
      [key: string]: [number[][], Position[][]];
    } = {};

    const parcelsToPickup = this.parcels.filter((p) => !p.carriedBy);

    if (parcelsToPickup.length === 0 && this.carryingParcels.size === 0) {
      return null;
    }

    type Step = {
      pos: Position;
      carrying: Set<string>;
      toPickup: DeliverooParcelType[];
      tilesWithParcels: number;
      plan: Intent[];
      cost: number;
    };

    const initialStep: Step = {
      pos: this.pos,
      carrying: new Set(this.carryingParcels),
      toPickup: parcelsToPickup,
      tilesWithParcels: parcelsToPickup.length,
      plan: [],
      cost: 0,
    };

    const queue: Step[] = [initialStep];
    let bestPlan: Intent[] | null = null;
    let bestCost = Infinity;
    let arrangementsTried = 0;

    debug(`Parcels known: ${parcelsToPickup.length}`, this.id);
    debug(`Delivery tiles known: ${this.deliveryTiles.length}`, this.id);

    while (queue.length > 0) {
      const current = queue.shift();
      arrangementsTried += 1;
      if (!current) break;

      // if we have a better plan, update it
      if (current.toPickup.length === 0 && current.carrying.size === 0) {
        if (current.cost < bestCost) {
          bestCost = current.cost;
          bestPlan = current.plan;
        }
        continue;
      }

      const [distances, previous] = this.getOrCacheDistanceVectorAndPrevious(
        distanceVectorCache,
        current.pos,
      );

      // choose the closes legal parcel to pickup, use geometric distance to sort them
      current.toPickup.sort((a, b) => {
        const distA =
          Math.abs(a.x - current.pos.x) + Math.abs(a.y - current.pos.y);
        const distB =
          Math.abs(b.x - current.pos.x) + Math.abs(b.y - current.pos.y);
        return distA - distB;
      });

      // try to pickup up to 3 parcels (to limit branching factor)
      const toPickupCount = Math.min(
        current.toPickup.length,
        config.pickupBranchingFactor,
      );
      for (let i = 0; i < toPickupCount; i++) {
        // try to pickup each parcel
        const parcel = current.toPickup[i];
        const pathToParcel = this.getPathFromDistances(distances, previous, {
          x: parcel.x,
          y: parcel.y,
        });

        if (pathToParcel !== null) {
          const newCarrying = new Set(current.carrying);
          newCarrying.add(parcel.id);
          queue.push({
            pos: { x: parcel.x, y: parcel.y },
            carrying: newCarrying,
            toPickup: current.toPickup.filter((_, idx) => idx !== i),
            tilesWithParcels:
              current.tilesWithParcels + pathToParcel.length * newCarrying.size,
            plan: current.plan.concat(pathToParcel, [Intent.PICKUP]),
            cost: current.cost,
          });
        } else {
          error(
            `No path found to parcel ${parcel.id} at (${parcel.x}, ${parcel.y})`,
            this.id,
          );
        }
      }

      // try to deliver each carrying parcel
      if (current.carrying.size !== 0) {
        const sortedDeliveryTiles = this.getSortedClosestDeliveryTileFromCache(
          distanceVectorCache,
          current.pos,
        );

        while (sortedDeliveryTiles.length > 0) {
          const closestDeliveryTile = sortedDeliveryTiles.shift()!;
          const pathToDelivery = this.getPathFromDistances(
            distances,
            previous,
            closestDeliveryTile,
          );
          if (pathToDelivery !== null) {
            queue.push({
              pos: { x: closestDeliveryTile.x, y: closestDeliveryTile.y },
              carrying: new Set<string>(),
              toPickup: current.toPickup.slice(0),
              tilesWithParcels: 0,
              plan: current.plan.concat(pathToDelivery, [Intent.DELIVER]),
              cost:
                current.cost + pathToDelivery.length * current.tilesWithParcels,
            });
            break;
          } else {
            error(
              `No path found to delivery tile at (${closestDeliveryTile.x}, ${closestDeliveryTile.y})`,
              this.id,
            );
          }
        }
      }
    }
    info(
      `Tried ${arrangementsTried} arrangements to find the best plan with distance ${bestCost}`,
      this.id,
    );

    if (bestPlan) {
      const intentQueue = new Queue<Intent>();
      for (const intent of bestPlan) {
        intentQueue.push(intent);
      }
      return intentQueue;
    }

    error("No plan found with custom resolver", this.id);
    return null;
  }
}
