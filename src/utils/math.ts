import { Position } from "src/beliefs/types";

export function normalizePos(pos: Position): Position {
  return { x: Math.floor(pos.x), y: Math.floor(pos.y) };
}

export function manhattanDistance(pos1: Position, pos2: Position): number {
  return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}
