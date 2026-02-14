import config from "config";
import { Queue } from "queue-typed";
import { Action } from "src/intents";
import { BeliefSet } from "src/beliefs";
import { TileType, Position } from "src/beliefs/types";
import { debug, info, error } from "src/utils/log";
import {
  getPathFromDistances,
  dijkstra,
  computeDistanceVectors,
} from "./algorithms";
import Parcel from "src/beliefs/Parcel";

export function getSortedClosestDeliveryTiles(
  beliefs: BeliefSet,
  pos: Position,
): Position[] {
  const map = beliefs.getMap();
  const logId = beliefs.getId();

  const [distances] = computeDistanceVectors(
    map,
    beliefs.getAllAgentsArray(),
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
  const agents = beliefs.getAllAgentsArray();

  const parcelsToPickup = [...parcels.entries()]
    .filter(([_, p]) => !p.getCarriedBy())
    .map(([_, p]) => p);

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
    const [distances, previous] = computeDistanceVectors(map, agents, pos);
    if (!distances || distances.length === 0 || distances[0].length === 0) {
      error("Distances not computed, cannot compare delivery vs pickup", logId);
      return null;
    }

    const sortedDeliveryTiles = getSortedClosestDeliveryTiles(beliefs, pos);
    const reachableDeliveryTiles = sortedDeliveryTiles.filter((tile) => {
      const row = distances[tile.y];
      if (!row) return false;
      const dist = row[tile.x];
      return dist !== undefined && dist !== Infinity;
    });

    const reachableParcels = parcelsToPickup.filter((p) => {
      const row = distances[p.getPos().y];
      if (!row) return false;
      const dist = row[p.getPos().x];
      return dist !== undefined && dist !== Infinity;
    });

    const nearestDeliveryDist = reachableDeliveryTiles.length
      ? distances[reachableDeliveryTiles[0].y][reachableDeliveryTiles[0].x]
      : Infinity;
    const nearestParcelDist = reachableParcels.reduce((best, p) => {
      const dist = distances[p.getPos().y][p.getPos().x];
      return dist < best ? dist : best;
    }, Infinity);

    if (
      reachableDeliveryTiles.length > 0 &&
      (reachableParcels.length === 0 ||
        nearestDeliveryDist * config.deliveryOverPickupRatio <=
          nearestParcelDist)
    ) {
      const pathToDelivery = getPathFromDistances(
        distances,
        previous,
        reachableDeliveryTiles[0],
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
    toPickup: Parcel[];
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

    const [distances, previous] = computeDistanceVectors(
      map,
      agents,
      current.pos,
    );
    if (!distances || distances.length === 0 || distances[0].length === 0) {
      error("Distances not computed, skipping step", logId);
      continue;
    }

    const reachableToPickup = current.toPickup.filter((p) => {
      const row = distances[p.getPos().y];
      if (!row) return false;
      const dist = row[p.getPos().x];
      return dist !== undefined && dist !== Infinity;
    });

    reachableToPickup.sort((a, b) => {
      const distA =
        Math.abs(a.getPos().x - current.pos.x) +
        Math.abs(a.getPos().y - current.pos.y);
      const distB =
        Math.abs(b.getPos().x - current.pos.x) +
        Math.abs(b.getPos().y - current.pos.y);
      return distA - distB;
    });

    const toPickupCount = Math.min(
      reachableToPickup.length,
      config.pickupBranchingFactor,
    );
    for (let i = 0; i < toPickupCount; i++) {
      const parcel = reachableToPickup[i];
      const pathToParcel = getPathFromDistances(distances, previous, {
        x: parcel.getPos().x,
        y: parcel.getPos().y,
      });

      if (pathToParcel !== null) {
        const newCarrying = new Set(current.carrying);
        newCarrying.add(parcel.getId());
        queue.push({
          pos: { x: parcel.getPos().x, y: parcel.getPos().y },
          carrying: newCarrying,
          toPickup: reachableToPickup.filter((_, idx) => idx !== i),
          tilesWithParcels:
            current.tilesWithParcels + pathToParcel.length * newCarrying.size,
          plan: current.plan.concat(pathToParcel, [Action.PICKUP]),
          cost: current.cost,
        });
      } else {
        error(
          `No path found to parcel ${parcel.getId()} at (${parcel.getPos().x}, ${parcel.getPos().y})`,
          logId,
        );
      }
    }

    if (current.carrying.size !== 0) {
      const sortedDeliveryTiles = getSortedClosestDeliveryTiles(
        beliefs,
        current.pos,
      );

      while (sortedDeliveryTiles.length > 0) {
        const closestDeliveryTile = sortedDeliveryTiles.shift()!;
        const pathToDelivery = getPathFromDistances(
          distances,
          previous,
          closestDeliveryTile,
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
  const agents = beliefs.getAllAgentsArray();
  const queue = new Queue<Action>();

  if (beliefs.isPickupAvailable()) {
    queue.push(Action.PICKUP);
    return queue;
  }

  if (beliefs.isDeliveryAvailable()) {
    queue.push(Action.DELIVER);
    return queue;
  }

  const pathToTarget = dijkstra(map, agents, pos, targetPos);
  if (pathToTarget && pathToTarget.length > 0) {
    for (const action of pathToTarget) {
      queue.push(action);
    }
  } else {
    error(`No path found to target tile at (${targetPos.x}, ${targetPos.y})`);
    queue.push(Action.NOOP);
  }

  return queue;
}
