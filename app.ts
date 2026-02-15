import Agent from "src/agent";

const args = process.argv.slice(2);

const n = parseInt(args[0] ?? "");
if (isNaN(n) || n < 1) {
  console.error("Usage: app.ts <number_of_agents> [--timeout <seconds>]");
  process.exit(1);
}

const timeoutIdx = args.indexOf("--timeout");
const timeoutSec =
  timeoutIdx !== -1 ? parseInt(args[timeoutIdx + 1] ?? "") : NaN;
if (timeoutIdx !== -1 && (isNaN(timeoutSec) || timeoutSec < 1)) {
  console.error("--timeout must be followed by a positive integer (seconds)");
  process.exit(1);
}

const agents = await Promise.all(
  Array.from({ length: n }, () => Agent.build({})),
);

agents.forEach((agent) => agent.run());

if (!isNaN(timeoutSec)) {
  setTimeout(() => agents.forEach((agent) => agent.stop()), timeoutSec * 1000);
}
