import { TileType, Position } from "src/beliefs";

export function normalizePos(pos: Position): Position {
  return { x: Math.floor(pos.x), y: Math.floor(pos.y) };
}

export function hasValidMap(map: TileType[][]): boolean {
  return map.length > 0 && map[0].length > 0;
}

export function isInsideMap(map: TileType[][], pos: Position): boolean {
  if (!hasValidMap(map)) return false;
  const norm = normalizePos(pos);
  return (
    norm.x >= 0 && norm.x < map[0].length && norm.y >= 0 && norm.y < map.length
  );
}
