import config from "config";
import LOG_LEVELS from "src/utils/log/levels";

function log(
  message: string,
  level: (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS],
  agent: string | undefined,
) {
  if (config.logLevel.value < level.value) {
    return;
  }
  let msg = `[${new Date().toISOString()}]`;
  if (agent) {
    msg += ` [${agent}]`;
  }
  msg += ` [${level.ansiColor}${level.name}\x1b[0m] ${message}`;
  console.log(msg);
}

export function error(message: string, agent: string | undefined = undefined) {
  log(message, LOG_LEVELS.ERROR, agent);
}

export function warn(message: string, agent: string | undefined = undefined) {
  log(message, LOG_LEVELS.WARN, agent);
}

export function info(message: string, agent: string | undefined = undefined) {
  log(message, LOG_LEVELS.INFO, agent);
}

export function debug(message: string, agent: string | undefined = undefined) {
  log(message, LOG_LEVELS.DEBUG, agent);
}
