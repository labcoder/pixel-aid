import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
export const defaultPhase8DryRunOutput = path.resolve(repoRoot, "..", "pixel-aid-phase8-evidence", "dry-run-v1");

export function parsePhase8DryRunArgs(argv = process.argv.slice(2)) {
  const args = [...argv];
  let outputRoot = defaultPhase8DryRunOutput;
  let overwrite = false;
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--overwrite") {
      overwrite = true;
      continue;
    }
    if (arg === "--out-dir") {
      const value = args.shift();
      if (!value) throw new Error("--out-dir requires a path.");
      outputRoot = path.resolve(value);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true, outputRoot, overwrite };
    }
    throw new Error(`Unknown argument "${arg}".`);
  }
  return { help: false, outputRoot, overwrite };
}

export async function runBundledPhase8DryRun(options = parsePhase8DryRunArgs()) {
  if (options.help) {
    console.log("Usage: npm run phase8:dry-run -- [--out-dir <path>] [--overwrite]");
    return undefined;
  }
  const bundleDir = await mkdtemp(path.join(tmpdir(), "pixelaid-phase8-runner-"));
  const bundlePath = path.join(bundleDir, "runner.mjs");
  try {
    await build({
      entryPoints: [path.join(scriptDir, "phase8-dry-run-entry.ts")],
      outfile: bundlePath,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      sourcemap: false,
      logLevel: "silent"
    });
    const runner = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
    return await runner.runPhase8DryRun({ outputRoot: options.outputRoot, overwrite: options.overwrite });
  } finally {
    await rm(bundleDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = await runBundledPhase8DryRun();
  if (result) console.log(`Phase 8 dry run report: ${result.reportPath}`);
}
