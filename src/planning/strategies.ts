import { Queue } from "queue-typed";
import { BeliefSet } from "src/beliefs";
import { Position, TileType } from "src/beliefs/types";
import { Action } from "src/planning/actions";
import { error, warn } from "src/utils/log";
import { computeDistanceVectors, dijkstra } from "./algorithms";

export function getSortedClosestDeliveryTiles(
  beliefs: BeliefSet,
  pos: Position,
  precomputedDistances: number[][] | null = null,
): Position[] {
  const map = beliefs.getMap();

  const distances =
    precomputedDistances ??
    computeDistanceVectors(map, beliefs.getAllAgents(), pos)[0];
  if (!distances || distances.length === 0 || distances[0].length === 0) {
    error("Distances not computed, cannot sort delivery tiles");
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

export function generatePlanToPos(
  beliefs: BeliefSet,
  targetPos: Position,
): Queue<Action> {
  const map = beliefs.getMap();
  const pos = beliefs.getAgentPos();
  const agents = beliefs.getAllAgents();
  const queue = new Queue<Action>();

  if (pos.x === targetPos.x && pos.y === targetPos.y) {
    warn(`Already on target tile at (${targetPos.x}, ${targetPos.y})`);
    return new Queue<Action>();
  }

  const pathToTarget = dijkstra(map, agents, pos, targetPos);
  if (pathToTarget && pathToTarget.length > 0) {
    for (const action of pathToTarget) {
      queue.push(action);
    }
  } else {
    error(`No path found to target tile at (${targetPos.x}, ${targetPos.y})`);
    return new Queue<Action>([Action.NOOP]);
  }

  return queue;
}
