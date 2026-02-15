import { Position } from "src/beliefs/types";

export type Intention =
  | {
      kind: "go_pickup";
      parcelId: string;
      distance: number;
    }
  | { kind: "deliver_parcels"; pos: Position; distance: number }
  | { kind: "explore_spawn" }
  | { kind: "noop" };
