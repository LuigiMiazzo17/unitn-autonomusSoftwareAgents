import { Position } from "src/beliefs/types";

export function normalizePos(pos: Position): Position {
  return { x: Math.floor(pos.x), y: Math.floor(pos.y) };
}
