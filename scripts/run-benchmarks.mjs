import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cpus, platform, release, type, arch } from "node:os";

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const separatorIndex = args.indexOf("--");
const scriptArgs = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args;
const extraVitestArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];

let outputPath = "benchmark-results/latest.json";
for (let index = 0; index < scriptArgs.length; index += 1) {
  const arg = scriptArgs[index];
  if (arg === "--out") {
    outputPath = scriptArgs[index + 1];
    index += 1;
    continue;
  }
  if (arg.startsWith("--out=")) {
    outputPath = arg.slice("--out=".length);
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

const absoluteOutputPath = resolve(repoRoot, outputPath);
const rawOutputPath = resolve(dirname(absoluteOutputPath), ".latest-vitest-bench.json");
mkdirSync(dirname(absoluteOutputPath), { recursive: true });

const benchmarkFiles = ["packages/core/src/fixtureSuite.bench.ts", "packages/core/src/singleSpriteCleanup.bench.ts"];
const vitestArgs = ["vitest", "bench", "--run", ...benchmarkFiles, "--outputJson", rawOutputPath, ...extraVitestArgs];
const startedAt = new Date();
const result = spawnSync("npx", vitestArgs, {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});
const finishedAt = new Date();

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  rmSync(rawOutputPath, { force: true });
  process.exit(result.status ?? 1);
}

const rawReport = JSON.parse(readFileSync(rawOutputPath, "utf8"));
const report = {
  schemaVersion: 1,
  generatedAt: finishedAt.toISOString(),
  durationMs: finishedAt.getTime() - startedAt.getTime(),
  command: ["node", "scripts/run-benchmarks.mjs", ...process.argv.slice(2)],
  vitestCommand: ["npx", ...vitestArgs],
  environment: collectEnvironment(),
  summary: {
    benchmarkCount: countBenchmarks(rawReport),
    sourceFiles: benchmarkFiles
  },
  benchmarks: normalizeBenchmarks(rawReport)
};

writeFileSync(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
rmSync(rawOutputPath, { force: true });
console.log(`Structured benchmark results written to ${outputPath}`);

function collectEnvironment() {
  const cpuList = cpus();
  return {
    nodeVersion: process.version,
    platform: platform(),
    osType: type(),
    osRelease: release(),
    arch: arch(),
    cpuModel: cpuList[0]?.model ?? "unknown",
    cpuCount: cpuList.length,
    commitSha: gitCommitSha(),
    timestamp: new Date().toISOString()
  };
}

function gitCommitSha() {
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (git.status !== 0) {
    return null;
  }
  return git.stdout.trim() || null;
}

function countBenchmarks(rawReport) {
  return normalizeBenchmarks(rawReport).length;
}

function normalizeBenchmarks(rawReport) {
  return (rawReport.files ?? []).flatMap((file) =>
    (file.groups ?? []).flatMap((group) =>
      (group.benchmarks ?? []).map((benchmark) => ({
        name: benchmark.name,
        fullName: `${group.fullName} > ${benchmark.name}`,
        file: relativeFilePath(file.filepath),
        group: group.fullName,
        meanMs: numberOrNull(benchmark.mean),
        medianMs: numberOrNull(benchmark.median),
        minMs: numberOrNull(benchmark.min),
        maxMs: numberOrNull(benchmark.max),
        hz: numberOrNull(benchmark.hz),
        rmePercent: numberOrNull(benchmark.rme),
        iterationCount: Number.isFinite(benchmark.sampleCount) ? benchmark.sampleCount : null
      }))
    )
  );
}

function relativeFilePath(filePath) {
  return typeof filePath === "string" && filePath.startsWith(`${repoRoot}/`) ? filePath.slice(repoRoot.length + 1) : filePath;
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}
