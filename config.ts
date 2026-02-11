import LOG_LEVELS from "src/utils/log/levels";

export type PlannerType = "pddl" | "custom";

const solverHost = process.env.SOLVER_HOST;
if (!solverHost) {
  throw new Error("SOLVER_HOST is not defined");
}

const logLevel = (process.env.LOG_LEVEL || "warn").toUpperCase();
if (!Object.keys(LOG_LEVELS).includes(logLevel)) {
  throw new Error(`Invalid log level: ${logLevel}`);
}

const planner = (process.env.PLANNER || "pddl").toLowerCase() as PlannerType;
const solverUrl = process.env.SOLVER_URL;
if (!solverUrl && planner === "pddl") {
  throw new Error("SOLVER_URL is not defined");
}

export default {
  host: process.env.HOST || "http://localhost:8080",
  logLevel: LOG_LEVELS[logLevel as keyof typeof LOG_LEVELS],
  maxMoveFailCount: 3,
  solverHost,
  planner: (process.env.PLANNER as PlannerType) || "pddl",
  pickupBranchingFactor: parseInt(
    process.env.PICKUP_BRANCHING_FACTOR || "3",
    10,
  ),
  deliveryOverPickupRatio: parseFloat(
    process.env.DELIVERY_OVER_PICKUP_RATIO || "1.5",
  ),
  recalculatePlanOnParcelUpdate: process.env.RECALCULATE_PLAN_ON_PARCEL_UPDATE
    ? process.env.RECALCULATE_PLAN_ON_PARCEL_UPDATE === "true"
    : true,
};
