import LOG_LEVELS from "src/utils/log/levels";

export type PlannerType = "pddl" | "custom";

const pddlSolverHost = process.env.SOLVER_HOST;
if (!pddlSolverHost) {
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
  deliverooHost: process.env.DELIVEROO_HOST || "http://localhost:8080",
  logLevel: LOG_LEVELS[logLevel as keyof typeof LOG_LEVELS],
  maxMoveFailCount: 3,
  pddlSolverHost,
  plannerType: (process.env.PLANNER as PlannerType) || "pddl",
  deliveryOverPickupRatio: parseFloat(
    process.env.DELIVERY_OVER_PICKUP_RATIO || "0.8",
  ),
  parcelSensingDistance: parseInt(process.env.PARCEL_SENSING_DISTANCE || "5"),
  agentSensingDistance: parseInt(process.env.AGENT_SENSING_DISTANCE || "5"),
  recalculatePlanOnParcelUpdate: process.env.RECALCULATE_PLAN_ON_PARCEL_UPDATE
    ? process.env.RECALCULATE_PLAN_ON_PARCEL_UPDATE === "true"
    : true,
  modeOfOperation: process.env.MODE_OF_OPERATION || "decentralized",
};
