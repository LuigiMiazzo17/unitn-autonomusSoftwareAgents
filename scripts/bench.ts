import fs from "node:fs/promises";
import path from "node:path";
import Agent from "src/agent";

type BenchRunResult = {
  run: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  score: number;
  frames: number;
};

type BenchResult = {
  meta: {
    host: string;
    planner: string;
    level: string | null;
    durationMs: number;
    runs: number;
    timestampMs: number;
  };
  runs: BenchRunResult[];
};

const host = process.env.HOST || "http://localhost:8080";
const planner = process.env.PLANNER || "pddl";
const level = process.env.BENCH_LEVEL || null;
const durationMs = parseInt(process.env.BENCH_DURATION_MS || "120000", 10);
const runs = parseInt(process.env.BENCH_RUNS || "3", 10);
const outputPath = process.env.BENCH_OUTPUT || "";
const waitTimeoutMs = parseInt(
  process.env.BENCH_WAIT_TIMEOUT_MS || "30000",
  10,
);

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/configs`);
      if (res.ok) {
        return;
      }
    } catch {
      // ignore, retry
    }
    await sleep(1000);
  }
  throw new Error(`Server not ready after ${timeoutMs}ms at ${url}`);
}

async function runBench(): Promise<void> {
  if (Number.isNaN(durationMs) || durationMs <= 0) {
    throw new Error("BENCH_DURATION_MS must be a positive integer");
  }
  if (Number.isNaN(runs) || runs <= 0) {
    throw new Error("BENCH_RUNS must be a positive integer");
  }

  await waitForServer(host, waitTimeoutMs);

  const results: BenchRunResult[] = [];

  for (let i = 0; i < runs; i++) {
    const agent = await Agent.build({});
    const startMs = Date.now();
    await agent.runFor(durationMs);
    const endMs = Date.now();

    results.push({
      run: i + 1,
      startMs,
      endMs,
      durationMs: endMs - startMs,
      score: agent.getScore(),
      frames: agent.getFrame(),
    });

    await sleep(1000);
  }

  const output: BenchResult = {
    meta: {
      host,
      planner,
      level,
      durationMs,
      runs,
      timestampMs: Date.now(),
    },
    runs: results,
  };

  const json = JSON.stringify(output, null, 2);
  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (dir && dir !== ".") {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(outputPath, json, "utf8");
  }

  console.log(json);
}

runBench().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
