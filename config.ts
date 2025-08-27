import LOG_LEVELS from "src/utils/log/levels";

const logLevel = (process.env.LOG_LEVEL || "warn").toUpperCase();
const solverUrl = process.env.SOLVER_URL;
if (!solverUrl) {
  throw new Error("SOLVER_URL is not defined");
}

if (!Object.keys(LOG_LEVELS).includes(logLevel)) {
  throw new Error(`Invalid log level: ${logLevel}`);
}

export default {
  host: process.env.HOST || "http://localhost:8080",
  logLevel: LOG_LEVELS[logLevel as keyof typeof LOG_LEVELS],
  maxMoveFailCount: 3,
  solverUrl,
};
