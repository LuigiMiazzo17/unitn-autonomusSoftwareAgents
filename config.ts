import path from "path";
import LOG_LEVELS from "src/utils/log/levels";
import { fileURLToPath } from "url";

const logLevel = (process.env.LOG_LEVEL || "warn").toUpperCase();

if (!Object.keys(LOG_LEVELS).includes(logLevel)) {
  throw new Error(`Invalid log level: ${logLevel}`);
}

const pddlDomainFilePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "domain.pddl",
);

export default {
  host: process.env.HOST || "http://localhost:8080",
  logLevel: LOG_LEVELS[logLevel as keyof typeof LOG_LEVELS],
  pddlDomain: pddlDomainFilePath,
};
