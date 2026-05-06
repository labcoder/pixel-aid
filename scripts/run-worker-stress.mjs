import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const separatorIndex = args.indexOf("--");
const scriptArgs = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args;
const extraVitestArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];

let outputPath = "benchmark-results/worker-stress/latest.json";
let iterations = "2";
let fixtureId = "fake-pixel-720p-single";

for (let index = 0; index < scriptArgs.length; index += 1) {
  const arg = scriptArgs[index];
  if (arg === "--out") {
    outputPath = requiredValue(scriptArgs[index + 1], "--out");
    index += 1;
    continue;
  }
  if (arg.startsWith("--out=")) {
    outputPath = arg.slice("--out=".length);
    continue;
  }
  if (arg === "--iterations") {
    iterations = requiredValue(scriptArgs[index + 1], "--iterations");
    index += 1;
    continue;
  }
  if (arg.startsWith("--iterations=")) {
    iterations = arg.slice("--iterations=".length);
    continue;
  }
  if (arg === "--fixture") {
    fixtureId = requiredValue(scriptArgs[index + 1], "--fixture");
    index += 1;
    continue;
  }
  if (arg.startsWith("--fixture=")) {
    fixtureId = arg.slice("--fixture=".length);
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

const absoluteOutputPath = resolve(repoRoot, outputPath);
mkdirSync(dirname(absoluteOutputPath), { recursive: true });

const result = spawnSync(
  "npx",
  ["vitest", "run", "apps/web/src/lib/workerClientStress.stress.test.ts", ...extraVitestArgs],
  {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PIXELAID_WORKER_STRESS_OUT: outputPath,
      PIXELAID_WORKER_STRESS_ITERATIONS: iterations,
      PIXELAID_WORKER_STRESS_FIXTURE: fixtureId,
      PIXELAID_WORKER_STRESS: "1"
    }
  }
);

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Worker stress results written to ${outputPath}`);

function requiredValue(value, flag) {
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
