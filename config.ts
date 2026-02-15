import LOG_LEVELS from "src/utils/log/levels";

export type PlannerType = "pddl" | "custom";

const pddlSolverHost = process.env.PDDL_SOLVER_HOST;
if (!pddlSolverHost) {
  throw new Error("PDDL_SOLVER_HOST is not defined");
}

const logLevel = (process.env.LOG_LEVEL || "warn").toUpperCase();
if (!Object.keys(LOG_LEVELS).includes(logLevel)) {
  throw new Error(`Invalid log level: ${logLevel}`);
}

export default {
  deliverooHost: process.env.DELIVEROO_HOST || "http://localhost:8080",
  pddlSolverHost,
  logLevel: LOG_LEVELS[logLevel as keyof typeof LOG_LEVELS],
  maxMoveFailCount: 3,
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
