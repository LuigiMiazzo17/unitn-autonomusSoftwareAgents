import { PriorityQueue } from "priority-queue-typescript";
import { Action } from "src/intents";
import { ExternalAgent } from "src/beliefs";
import { TileType, Position } from "src/beliefs/types";
import { error } from "src/utils/log";
import { normalizePos } from "./utils";

export function computeDistanceVectors(
  map: TileType[][],
  agents: ExternalAgent[],
  start: Position,
): [number[][], (Position | null)[][]] {
  const startPos = normalizePos(start);

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
        map[ny][nx] !== TileType.WALL &&
        !agents.some(
          (a) =>
            Math.floor(a.getPos().x) === nx && Math.floor(a.getPos().y) === ny,
        )
      ) {
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
  distances: number[][],
  previous: (Position | null)[][],
  goal: Position,
): Action[] | null {
  if (!distances || distances.length === 0 || distances[0].length === 0) {
    error("Distances not computed, cannot compute path");
    return null;
  }
  if (distances[goal.y][goal.x] === Infinity) {
    error(`No path found to goal at (${goal.x}, ${goal.y})`);
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
      error("Failed parsing dijkstra outcome");
    }
  }

  return actions;
}

export function dijkstra(
  map: TileType[][],
  agents: ExternalAgent[],
  start: Position,
  goal: Position,
): Action[] | null {
  const [distances, previous] = computeDistanceVectors(map, agents, start);
  return getPathFromDistances(distances, previous, goal);
}
