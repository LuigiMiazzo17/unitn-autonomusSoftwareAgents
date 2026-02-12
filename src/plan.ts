import {
  Agent as DeliverooAgentType,
  Parcel as DeliverooParcelType,
} from "@unitn-asa/deliveroo-js-client";
import config from "config";
import { Queue } from "queue-typed";
import { PriorityQueue } from "priority-queue-typescript";
import { Action } from "src/intents";
import { BeliefSet, TileType, Position } from "src/beliefs";
import { debug, info, error } from "src/utils/log";

export function computeDistanceVector(
  map: TileType[][],
  agents: DeliverooAgentType[],
  selfId: string,
  start: Position,
): [number[][], (Position | null)[][]] {
  const startPos = normalizePos(start);

  if (!hasValidMap(map)) {
    error("Map not initialized, cannot compute distances", selfId);
    return [[], []];
  }
  if (!isInsideMap(map, startPos)) {
    error(
      `Start position out of bounds: (${startPos.x}, ${startPos.y})`,
      selfId,
    );
    return [[], []];
  }

  const rows = map.length;
  const cols = map[0].length;

  const distances = Array.from({ length: rows }, () =>
    Array(cols).fill(Infinity),
  );
  const previous = Array.from({ length: rows }, () => Array(cols).fill(null));
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));

  distances[startPos.y][startPos.x] = 0;

  type PQEntry = { pos: Position; dist: number };

  const pq = new PriorityQueue<PQEntry>(
    rows * cols,
    (a: PQEntry, b: PQEntry) => a.dist - b.dist,
  );

  pq.add({ pos: start, dist: 0 });

  const directions = [
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (!pq.empty()) {
    const current = pq.poll()!;
    const { x, y } = current.pos;

    if (visited[y][x]) continue;
    visited[y][x] = true;

    for (const { dx, dy } of directions) {
      const nx = x + dx;
      const ny = y + dy;

      if (
        nx >= 0 &&
        nx < cols &&
        ny >= 0 &&
        ny < rows &&
        map[ny][nx] !== TileType.WALL
      ) {
        if (
          agents
            .filter((a) => a.id !== selfId)
            .some((a) => Math.floor(a.x) === nx && Math.floor(a.y) === ny)
        ) {
          continue;
        }
        const alt = distances[y][x] + 1;
        if (alt < distances[ny][nx]) {
          distances[ny][nx] = alt;
          previous[ny][nx] = { x, y };
          pq.add({ pos: { x: nx, y: ny }, dist: alt });
        }
      }
    }
  }

  return [distances, previous];
}

export function getPathFromDistances(
  map: TileType[][],
  distances: number[][],
  previous: (Position | null)[][],
  goal: Position,
  logId?: string,
): Action[] | null {
  if (!hasValidMap(map)) {
    error("Map not initialized, cannot compute path", logId);
    return null;
  }
  if (!distances || distances.length === 0 || distances[0].length === 0) {
    error("Distances not computed, cannot compute path", logId);
    return null;
  }
  if (!isInsideMap(map, goal)) {
    error(`Goal out of bounds: (${goal.x}, ${goal.y})`, logId);
    return null;
  }
  if (distances[goal.y][goal.x] === Infinity) {
    error(`No path found to goal at (${goal.x}, ${goal.y})`, logId);
    return null;
  }

  const path: Position[] = [];
  let curr: Position | null = goal;
  while (curr) {
    path.push(curr);
    curr = previous[curr.y][curr.x];
  }
  path.reverse();

  const actions: Action[] = [];
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    if (to.x === from.x && to.y === from.y + 1) {
      actions.push(Action.MOVE_UP);
    } else if (to.x === from.x && to.y === from.y - 1) {
      actions.push(Action.MOVE_DOWN);
    } else if (to.x === from.x - 1 && to.y === from.y) {
      actions.push(Action.MOVE_LEFT);
    } else if (to.x === from.x + 1 && to.y === from.y) {
      actions.push(Action.MOVE_RIGHT);
    } else {
      error("Failed parsing dijkstra outcome", logId);
    }
  }

  return actions;
}

export function dijkstra(
  map: TileType[][],
  agents: DeliverooAgentType[],
  selfId: string,
  start: Position,
  goal: Position,
): Action[] | null {
  if (!isInsideMap(map, start) || !isInsideMap(map, goal)) {
    error(
      `Dijkstra positions out of bounds: (${start.x}, ${start.y}) -> (${goal.x}, ${goal.y})`,
      selfId,
    );
    return null;
  }
  const [distances, previous] = computeDistanceVector(
    map,
    agents,
    selfId,
    start,
  );
  return getPathFromDistances(map, distances, previous, goal, selfId);
}

export function getDistanceVectorAndPrevious(
  map: TileType[][],
  agents: DeliverooAgentType[],
  selfId: string,
  pos: Position,
): [number[][], (Position | null)[][]] {
  if (!isInsideMap(map, pos)) {
    error(`Position out of bounds: (${pos.x}, ${pos.y})`, selfId);
    return [[], []];
  }

  return computeDistanceVector(map, agents, selfId, pos);
}

export function getSortedClosestDeliveryTile(
  beliefs: BeliefSet,
  pos: Position,
): Position[] {
  const map = beliefs.getMap();
  const logId = beliefs.getId();

  if (!hasValidMap(map)) {
    error("Map not initialized, cannot compute delivery tiles", logId);
    return [];
  }
  if (!isInsideMap(map, pos)) {
    error(`Position out of bounds: (${pos.x}, ${pos.y})`, logId);
    return [];
  }

  const [distances] = getDistanceVectorAndPrevious(
    map,
    beliefs.getAgents(),
    logId,
    pos,
  );
  if (!distances || distances.length === 0 || distances[0].length === 0) {
    error("Distances not computed, cannot sort delivery tiles", logId);
    return [];
  }

  const deliveryPositions: Position[] = [];
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[0].length; x++) {
      if (map[y][x] === TileType.DELIVERY) {
        deliveryPositions.push({ x, y });
      }
    }
  }

  const deliveryTilesWithDistance = deliveryPositions.map((tile) => ({
    tile,
    distance: distances[tile.y][tile.x],
  }));

  deliveryTilesWithDistance.sort((a, b) => a.distance - b.distance);

  return deliveryTilesWithDistance.map((d) => d.tile);
}

export function generateSmartPlan(beliefs: BeliefSet): Queue<Action> | null {
  const map = beliefs.getMap();
  const pos = beliefs.getPos();
  const logId = beliefs.getId();
  const parcels = beliefs.getParcels();
  const carryingParcels = beliefs.getCarryingParcels();
  const deliveryTiles = beliefs.getDeliveryTiles();
  const agents = beliefs.getAgents();

  if (!hasValidMap(map)) {
    error("Map not initialized, cannot plan", logId);
    return null;
  }
  if (!isInsideMap(map, pos)) {
    error(`Position out of bounds: (${pos.x}, ${pos.y})`, logId);
    return null;
  }

  const parcelsToPickup = parcels.filter(
    (p) => !p.carriedBy && isInsideMap(map, { x: p.x, y: p.y }),
  );

  if (parcelsToPickup.length === 0 && carryingParcels.size === 0) {
    return null;
  }

  if (deliveryTiles.length === 0) {
    error("No delivery tiles found on the map", logId);
    return null;
  }

  if (carryingParcels.size > 0 && beliefs.isOnDeliveryTile()) {
    const queue = new Queue<Action>();
    queue.push(Action.DELIVER);
    return queue;
  }

  if (carryingParcels.size > 0) {
    const [distances, previous] = getDistanceVectorAndPrevious(
      map,
      agents,
      logId,
      pos,
    );
    if (!distances || distances.length === 0 || distances[0].length === 0) {
      error(
        "Distances not computed, cannot compare delivery vs pickup",
        logId,
      );
      return null;
    }

    const sortedDeliveryTiles = getSortedClosestDeliveryTile(beliefs, pos);
    const reachableDeliveryTiles = sortedDeliveryTiles.filter((tile) => {
      const row = distances[tile.y];
      if (!row) return false;
      const dist = row[tile.x];
      return dist !== undefined && dist !== Infinity;
    });

    const reachableParcels = parcelsToPickup.filter((p) => {
      const row = distances[p.y];
      if (!row) return false;
      const dist = row[p.x];
      return dist !== undefined && dist !== Infinity;
    });

    const nearestDeliveryDist = reachableDeliveryTiles.length
      ? distances[reachableDeliveryTiles[0].y][reachableDeliveryTiles[0].x]
      : Infinity;
    const nearestParcelDist = reachableParcels.reduce((best, p) => {
      const dist = distances[p.y][p.x];
      return dist < best ? dist : best;
    }, Infinity);

    if (
      reachableDeliveryTiles.length > 0 &&
      (reachableParcels.length === 0 ||
        nearestDeliveryDist * config.deliveryOverPickupRatio <=
          nearestParcelDist)
    ) {
      const pathToDelivery = getPathFromDistances(
        map,
        distances,
        previous,
        reachableDeliveryTiles[0],
        logId,
      );
      if (pathToDelivery !== null) {
        const queue = new Queue<Action>();
        for (const action of pathToDelivery) {
          queue.push(action);
        }
        queue.push(Action.DELIVER);
        return queue;
      }
    }
  }

  type Step = {
    pos: Position;
    carrying: Set<string>;
    toPickup: DeliverooParcelType[];
    tilesWithParcels: number;
    plan: Action[];
    cost: number;
  };

  const initialStep: Step = {
    pos,
    carrying: new Set(carryingParcels),
    toPickup: parcelsToPickup,
    tilesWithParcels: parcelsToPickup.length,
    plan: [],
    cost: 0,
  };

  const queue: Step[] = [initialStep];
  let bestPlan: Action[] | null = null;
  let bestCost = Infinity;
  let arrangementsTried = 0;

  debug(`Parcels known: ${parcelsToPickup.length}`, logId);
  debug(`Delivery tiles known: ${deliveryTiles.length}`, logId);

  while (queue.length > 0) {
    const current = queue.shift();
    arrangementsTried += 1;
    if (!current) break;

    if (current.toPickup.length === 0 && current.carrying.size === 0) {
      if (current.cost < bestCost) {
        bestCost = current.cost;
        bestPlan = current.plan;
      }
      continue;
    }

    const [distances, previous] = getDistanceVectorAndPrevious(
      map,
      agents,
      logId,
      current.pos,
    );
    if (!distances || distances.length === 0 || distances[0].length === 0) {
      error("Distances not computed, skipping step", logId);
      continue;
    }

    const reachableToPickup = current.toPickup.filter((p) => {
      const row = distances[p.y];
      if (!row) return false;
      const dist = row[p.x];
      return dist !== undefined && dist !== Infinity;
    });

    reachableToPickup.sort((a, b) => {
      const distA =
        Math.abs(a.x - current.pos.x) + Math.abs(a.y - current.pos.y);
      const distB =
        Math.abs(b.x - current.pos.x) + Math.abs(b.y - current.pos.y);
      return distA - distB;
    });

    const toPickupCount = Math.min(
      reachableToPickup.length,
      config.pickupBranchingFactor,
    );
    for (let i = 0; i < toPickupCount; i++) {
      const parcel = reachableToPickup[i];
      const pathToParcel = getPathFromDistances(
        map,
        distances,
        previous,
        { x: parcel.x, y: parcel.y },
        logId,
      );

      if (pathToParcel !== null) {
        const newCarrying = new Set(current.carrying);
        newCarrying.add(parcel.id);
        queue.push({
          pos: { x: parcel.x, y: parcel.y },
          carrying: newCarrying,
          toPickup: reachableToPickup.filter((_, idx) => idx !== i),
          tilesWithParcels:
            current.tilesWithParcels + pathToParcel.length * newCarrying.size,
          plan: current.plan.concat(pathToParcel, [Action.PICKUP]),
          cost: current.cost,
        });
      } else {
        error(
          `No path found to parcel ${parcel.id} at (${parcel.x}, ${parcel.y})`,
          logId,
        );
      }
    }

    if (current.carrying.size !== 0) {
      const sortedDeliveryTiles = getSortedClosestDeliveryTile(
        beliefs,
        current.pos,
      );

      while (sortedDeliveryTiles.length > 0) {
        const closestDeliveryTile = sortedDeliveryTiles.shift()!;
        const pathToDelivery = getPathFromDistances(
          map,
          distances,
          previous,
          closestDeliveryTile,
          logId,
        );
        if (pathToDelivery !== null) {
          queue.push({
            pos: { x: closestDeliveryTile.x, y: closestDeliveryTile.y },
            carrying: new Set<string>(),
            toPickup: reachableToPickup.slice(0),
            tilesWithParcels: 0,
            plan: current.plan.concat(pathToDelivery, [Action.DELIVER]),
            cost:
              current.cost + pathToDelivery.length * current.tilesWithParcels,
          });
          break;
        } else {
          error(
            `No path found to delivery tile at (${closestDeliveryTile.x}, ${closestDeliveryTile.y})`,
            logId,
          );
        }
      }
    }
  }
  info(
    `Tried ${arrangementsTried} arrangements to find the best plan with distance ${bestCost}`,
    logId,
  );

  if (bestPlan) {
    const actionQueue = new Queue<Action>();
    for (const action of bestPlan) {
      actionQueue.push(action);
    }
    return actionQueue;
  }

  error("No plan found with custom resolver", logId);
  return null;
}

export function generateHuntingPlan(
  beliefs: BeliefSet,
  targetPos: Position,
): Queue<Action> {
  const map = beliefs.getMap();
  const pos = beliefs.getPos();
  const logId = beliefs.getId();
  const agents = beliefs.getAgents();
  const queue = new Queue<Action>();

  if (!hasValidMap(map)) {
    error("Map not initialized, cannot plan", logId);
    queue.push(Action.NOOP);
    return queue;
  }

  if (beliefs.isPickupAvailable()) {
    queue.push(Action.PICKUP);
    return queue;
  }

  if (beliefs.isDeliveryAvailable()) {
    queue.push(Action.DELIVER);
    return queue;
  }

  const pathToTarget = dijkstra(map, agents, logId, pos, targetPos);
  if (pathToTarget && pathToTarget.length > 0) {
    for (const action of pathToTarget) {
      queue.push(action);
    }
  } else {
    error(
      `No path found to target tile at (${targetPos.x}, ${targetPos.y})`,
      logId,
    );
    queue.push(Action.NOOP);
  }

  return queue;
}

function normalizePos(pos: Position): Position {
  return { x: Math.floor(pos.x), y: Math.floor(pos.y) };
}

function hasValidMap(map: TileType[][]): boolean {
  return map.length > 0 && map[0].length > 0;
}

function isInsideMap(map: TileType[][], pos: Position): boolean {
  if (!hasValidMap(map)) return false;
  const norm = normalizePos(pos);
  return (
    norm.x >= 0 &&
    norm.x < map[0].length &&
    norm.y >= 0 &&
    norm.y < map.length
  );
}
