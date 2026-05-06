import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
let configPath = "benchmark-budgets.json";
let resultsPath = "benchmark-results/latest.json";
let warnOnly = true;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--config") {
    configPath = args[index + 1];
    index += 1;
    continue;
  }
  if (arg.startsWith("--config=")) {
    configPath = arg.slice("--config=".length);
    continue;
  }
  if (arg === "--results") {
    resultsPath = args[index + 1];
    index += 1;
    continue;
  }
  if (arg.startsWith("--results=")) {
    resultsPath = arg.slice("--results=".length);
    continue;
  }
  if (arg === "--warn-only") {
    warnOnly = true;
    continue;
  }
  if (arg === "--fail-on-blocking") {
    warnOnly = false;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

const config = readJson(configPath, "benchmark budget config");
const results = existsSync(resolve(resultsPath)) ? readJson(resultsPath, "benchmark results") : null;
const benchmarkByName = new Map((results?.benchmarks ?? []).map((benchmark) => [benchmark.name, benchmark]));
const rows = (config.budgets ?? []).map((budget) => evaluateBudget(budget, benchmarkByName.get(budget.benchmarkName)));
const counts = rows.reduce(
  (summary, row) => {
    summary[row.status] = (summary[row.status] ?? 0) + 1;
    return summary;
  },
  { pass: 0, warn: 0, missing: 0 }
);

console.log("PixelAid benchmark budget report");
console.log(`Results: ${results ? resultsPath : `${resultsPath} (missing)`}`);
console.log(`Config: ${configPath}`);
console.log(`Mode: ${warnOnly ? "warn-only" : "fail-on-blocking"}`);
if (results?.environment) {
  console.log(`Environment: ${results.environment.nodeVersion ?? "node unknown"} / ${results.environment.platform ?? "platform unknown"} / ${results.environment.cpuModel ?? "cpu unknown"}`);
  console.log(`Commit: ${results.environment.commitSha ?? "unknown"}`);
}
console.log("");
console.log(formatRow(["Status", "Blocking", "Benchmark", "Actual", "Budget", "Delta"]));
console.log(formatRow(["---", "---", "---", "---", "---", "---"]));
for (const row of rows) {
  console.log(formatRow([row.status, row.blocking ? "yes" : "no", row.benchmarkName, row.actualText, row.budgetText, row.deltaText]));
}
console.log("");
console.log(`Summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.missing} missing`);

const blockingFailures = rows.filter((row) => row.blocking && row.status !== "pass");
if (!warnOnly && blockingFailures.length > 0) {
  console.error(`Blocking benchmark budget check failed: ${blockingFailures.length} blocking budget(s) are warn/missing.`);
  process.exit(1);
}

function evaluateBudget(budget, benchmark) {
  const metric = budget.metric ?? "meanMs";
  const budgetValue = Number(budget.budgetMs);
  if (!benchmark || !Number.isFinite(benchmark[metric])) {
    return {
      benchmarkName: budget.benchmarkName,
      blocking: Boolean(budget.blocking),
      status: "missing",
      actualText: "missing",
      budgetText: `${formatMs(budgetValue)} ${metric}`,
      deltaText: "--"
    };
  }

  const actualValue = Number(benchmark[metric]);
  const percent = budgetValue === 0 ? 0 : ((actualValue - budgetValue) / budgetValue) * 100;
  return {
    benchmarkName: budget.benchmarkName,
    blocking: Boolean(budget.blocking),
    status: actualValue <= budgetValue ? "pass" : "warn",
    actualText: `${formatMs(actualValue)} ${metric}`,
    budgetText: `${formatMs(budgetValue)} ${metric}`,
    deltaText: `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`
  };
}

function readJson(path, label) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing ${label}: ${path}`);
  }
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}ms` : "--";
}

function formatRow(values) {
  return `| ${values.join(" | ")} |`;
}
