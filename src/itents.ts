export enum Intent {
  MOVE_UP,
  MOVE_DOWN,
  MOVE_LEFT,
  MOVE_RIGHT,
  PICKUP,
  DELIVER,
  NOOP,
}

export enum CurrentOperationMode {
  PDDL,
  CUSTOM_PLANNER,
  HUNTING,
}
