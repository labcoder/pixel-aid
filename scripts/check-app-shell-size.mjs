import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appPath = resolve("apps/web/src/App.tsx");
const args = new Map(
  process.argv.slice(2).flatMap((arg, index, allArgs) => {
    if (!arg.startsWith("--")) {
      return [];
    }
    const [rawKey, inlineValue] = arg.split("=", 2);
    const key = rawKey.slice(2);
    return [[key, inlineValue ?? allArgs[index + 1] ?? "true"]];
  })
);
const maxLines = Number(args.get("max-lines") ?? 9800);
const source = readFileSync(appPath, "utf8");
const lines = source.split(/\r?\n/).length;
const directWorkerImports = [
  "startFixJob",
  "startSourceAnalysisJob",
  "startQualityAnalysisJob"
].filter((symbol) => source.includes(`import { ${symbol}`) || source.includes(`, ${symbol}`));

if (Number.isFinite(maxLines) && lines > maxLines) {
  console.warn(
    `[app-shell] App.tsx has ${lines} lines, above the warn-only budget of ${maxLines}. Move orchestration into packages/engine, web adapters, or panel components.`
  );
} else {
  console.log(`[app-shell] App.tsx has ${lines} lines, within the warn-only budget of ${maxLines}.`);
}

if (directWorkerImports.length > 0) {
  console.warn(
    `[app-shell] App.tsx imports worker starters directly (${directWorkerImports.join(", ")}). Prefer engine job adapters for new orchestration.`
  );
}
