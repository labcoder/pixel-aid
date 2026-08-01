import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export class WebBundleBudgetError extends Error {
  constructor(message) {
    super(message);
    this.name = "WebBundleBudgetError";
  }
}

export function readWebBundleBudgets(env = process.env) {
  return {
    maxChunkBytes: Number(env.PIXELAID_WEB_MAX_JS_CHUNK_BYTES ?? 700_000),
    maxInitialGzipBytes: Number(env.PIXELAID_WEB_MAX_INITIAL_JS_GZIP_BYTES ?? 230_000),
    maxTotalGzipBytes: Number(env.PIXELAID_WEB_MAX_TOTAL_JS_GZIP_BYTES ?? 390_000)
  };
}

export function collectWebBundleMetrics(distRoot = join(process.cwd(), "apps", "web", "dist")) {
  const assetsDir = join(distRoot, "assets");
  const indexPath = join(distRoot, "index.html");
  if (!existsSync(assetsDir)) {
    throw new WebBundleBudgetError(`Web bundle assets do not exist at ${assetsDir}. Run npm run build first.`);
  }
  if (!existsSync(indexPath)) {
    throw new WebBundleBudgetError(`Web bundle entry does not exist at ${indexPath}. Run npm run build first.`);
  }

  const jsFiles = readdirSync(assetsDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => {
      const path = join(assetsDir, file);
      const size = statSync(path).size;
      const gzipSize = gzipSync(readFileSync(path)).length;
      return { file, size, gzipSize };
    })
    .sort((left, right) => right.size - left.size);

  if (jsFiles.length === 0) {
    throw new WebBundleBudgetError("Web bundle contains no JavaScript assets.");
  }

  const initialNames = initialJavaScriptAssetNames(readFileSync(indexPath, "utf8"));
  if (initialNames.length === 0) {
    throw new WebBundleBudgetError("Web bundle index does not reference an initial JavaScript entry.");
  }

  const byName = new Map(jsFiles.map((file) => [file.file, file]));
  const missingInitialAssets = initialNames.filter((file) => !byName.has(file));
  if (missingInitialAssets.length > 0) {
    throw new WebBundleBudgetError(`Web bundle index references missing JavaScript: ${missingInitialAssets.join(", ")}`);
  }

  const initialFiles = initialNames.map((file) => byName.get(file));
  const initialNameSet = new Set(initialNames);
  const deferredFiles = jsFiles.filter((file) => !initialNameSet.has(file.file));

  return {
    jsFiles,
    initialFiles,
    deferredFiles,
    largest: jsFiles[0],
    initialGzipBytes: sumGzip(initialFiles),
    deferredGzipBytes: sumGzip(deferredFiles),
    totalGzipBytes: sumGzip(jsFiles)
  };
}

export function evaluateWebBundleBudget(metrics, budgets) {
  const failures = [];
  if (metrics.largest.size > budgets.maxChunkBytes) {
    failures.push(`largest JS chunk ${metrics.largest.file} is ${formatBytes(metrics.largest.size)}, budget is ${formatBytes(budgets.maxChunkBytes)}`);
  }
  if (metrics.initialGzipBytes > budgets.maxInitialGzipBytes) {
    failures.push(`initial gzipped JS is ${formatBytes(metrics.initialGzipBytes)}, budget is ${formatBytes(budgets.maxInitialGzipBytes)}`);
  }
  if (metrics.totalGzipBytes > budgets.maxTotalGzipBytes) {
    failures.push(`all gzipped JS is ${formatBytes(metrics.totalGzipBytes)}, budget is ${formatBytes(budgets.maxTotalGzipBytes)}`);
  }
  return failures;
}

export function initialJavaScriptAssetNames(indexHtml) {
  const names = [];
  const seen = new Set();
  const assetPattern = /(?:src|href)=["'][^"']*assets\/([^"'?#]+\.js)(?:[?#][^"']*)?["']/gu;
  for (const match of indexHtml.matchAll(assetPattern)) {
    const name = match[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function sumGzip(files) {
  return files.reduce((sum, file) => sum + file.gzipSize, 0);
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function printReport(metrics) {
  console.log("PixelAid web bundle budget");
  console.log(`Largest JS chunk: ${metrics.largest.file} ${formatBytes(metrics.largest.size)} (${formatBytes(metrics.largest.gzipSize)} gzip)`);
  console.log(`Initial gzipped JS: ${formatBytes(metrics.initialGzipBytes)}`);
  console.log(`Deferred gzipped JS: ${formatBytes(metrics.deferredGzipBytes)}`);
  console.log(`All gzipped JS: ${formatBytes(metrics.totalGzipBytes)}`);

  for (const file of metrics.jsFiles.slice(0, 8)) {
    const loadClass = metrics.initialFiles.some((initial) => initial.file === file.file) ? "initial" : "deferred";
    console.log(`- ${file.file}: ${formatBytes(file.size)} (${formatBytes(file.gzipSize)} gzip, ${loadClass})`);
  }
}

function main() {
  try {
    const metrics = collectWebBundleMetrics();
    const failures = evaluateWebBundleBudget(metrics, readWebBundleBudgets());
    printReport(metrics);
    if (failures.length > 0) {
      console.error("Bundle budget failed:");
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Web bundle budget check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
