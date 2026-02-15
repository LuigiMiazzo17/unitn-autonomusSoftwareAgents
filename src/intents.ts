// Plan steps
export enum Action {
  MOVE_UP,
  MOVE_DOWN,
  MOVE_LEFT,
  MOVE_RIGHT,
  PICKUP,
  DELIVER,
  HANDOFF, // Dropping a parcel on the current location for another agent to pick up
  NOOP,
}

export function actionToString(action: Action): string {
  switch (action) {
    case Action.MOVE_UP:
      return "MOVE_UP";
    case Action.MOVE_DOWN:
      return "MOVE_DOWN";
    case Action.MOVE_LEFT:
      return "MOVE_LEFT";
    case Action.MOVE_RIGHT:
      return "MOVE_RIGHT";
    case Action.PICKUP:
      return "PICKUP";
    case Action.DELIVER:
      return "DELIVER";
    case Action.HANDOFF:
      return "HANDOFF";
    case Action.NOOP:
      return "NOOP";
  }
}

export function stringToAction(actionStr: string): Action {
  switch (actionStr) {
    case "MOVE_UP":
      return Action.MOVE_UP;
    case "MOVE_DOWN":
      return Action.MOVE_DOWN;
    case "MOVE_LEFT":
      return Action.MOVE_LEFT;
    case "MOVE_RIGHT":
      return Action.MOVE_RIGHT;
    case "PICKUP":
      return Action.PICKUP;
    case "DELIVER":
      return Action.DELIVER;
    case "HANDOFF":
      return Action.HANDOFF;
    case "NOOP":
      return Action.NOOP;
    default:
      throw new Error(`Unknown action string: ${actionStr}`);
  }
}
