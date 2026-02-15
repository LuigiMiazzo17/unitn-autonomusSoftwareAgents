import { Position, SpawnableTiles } from "src/beliefs/types";

export type Intention =
  | {
      kind: "go_pickup";
      parcelId: string;
      distance: number;
      pos: Position;
    }
  | { kind: "deliver_parcels"; pos: Position; distance: number }
  | { kind: "explore_spawn"; tile: SpawnableTiles }
  | { kind: "handoff"; parcelId: string; pos: Position; distance: number }
  | { kind: "noop" };
