/** Low-level executable action (plan step) */
export enum Action {
  MOVE_UP,
  MOVE_DOWN,
  MOVE_LEFT,
  MOVE_RIGHT,
  PICKUP,
  DELIVER,
  NOOP,
}

/** High-level BDI intention — what the agent wants to achieve */
export type Intention =
  | { kind: "go_pickup"; parcelId: string; pos: { x: number; y: number } }
  | { kind: "deliver_parcels" }
  | { kind: "explore_spawn"; pos: { x: number; y: number } }
  | { kind: "noop" };
