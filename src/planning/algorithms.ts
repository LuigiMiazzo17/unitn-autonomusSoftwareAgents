import { PriorityQueue } from "priority-queue-typescript";
import { Action } from "src/intents";
import { TileType, Position, ExternalAgent } from "src/beliefs";
import { error } from "src/utils/log";
import { normalizePos, hasValidMap, isInsideMap } from "./utils";

export function computeDistanceVector(
  map: TileType[][],
  agents: ExternalAgent[],
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
  agents: ExternalAgent[],
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
