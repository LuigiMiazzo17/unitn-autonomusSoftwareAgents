import LOG_LEVELS from "src/utils/log/levels";

const logLevel = (process.env.LOG_LEVEL || "warn").toUpperCase();
const solverHost = process.env.SOLVER_HOST;
if (!solverHost) {
  throw new Error("SOLVER_HOST is not defined");
}

if (!Object.keys(LOG_LEVELS).includes(logLevel)) {
  throw new Error(`Invalid log level: ${logLevel}`);
}

export type PlannerType = "pddl" | "custom";

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
  recalculatePlanOnParcelUpdate:
    process.env.RECALCULATE_PLAN_ON_PARCEL_UPDATE === "true" || true,
};
