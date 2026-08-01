import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectWebBundleMetrics,
  evaluateWebBundleBudget,
  initialJavaScriptAssetNames
} from "./check-web-bundle-budget.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("distinguishes initial modulepreloads from deferred workers and routes", () => {
  const distRoot = createDist({
    "index-main.js": "export const main = 'initial entry';",
    "react-vendor.js": "export const react = 'initial vendor';",
    "docs-page.js": "export const docs = 'deferred route';",
    "fix.worker.js": "export const worker = 'deferred worker';"
  });
  writeFileSync(
    join(distRoot, "index.html"),
    '<script type="module" src="./assets/index-main.js"></script><link rel="modulepreload" href="./assets/react-vendor.js">'
  );

  assert.deepEqual(initialJavaScriptAssetNames(readFileSync(join(distRoot, "index.html"), "utf8")), ["index-main.js", "react-vendor.js"]);

  const metrics = collectWebBundleMetrics(distRoot);
  assert.deepEqual(metrics.initialFiles.map((file) => file.file), ["index-main.js", "react-vendor.js"]);
  assert.deepEqual(metrics.deferredFiles.map((file) => file.file).sort(), ["docs-page.js", "fix.worker.js"]);
  assert.equal(metrics.totalGzipBytes, metrics.initialGzipBytes + metrics.deferredGzipBytes);
});

test("enforces initial and all-JavaScript gzip budgets independently", () => {
  const distRoot = createDist({
    "index-main.js": "export const main = 'initial entry';",
    "deferred.js": "export const deferred = 'lazy feature';"
  });
  writeFileSync(join(distRoot, "index.html"), '<script type="module" src="/assets/index-main.js"></script>');
  const metrics = collectWebBundleMetrics(distRoot);

  assert.deepEqual(evaluateWebBundleBudget(metrics, {
    maxChunkBytes: metrics.largest.size,
    maxInitialGzipBytes: metrics.initialGzipBytes,
    maxTotalGzipBytes: metrics.totalGzipBytes
  }), []);

  assert.match(evaluateWebBundleBudget(metrics, {
    maxChunkBytes: metrics.largest.size,
    maxInitialGzipBytes: metrics.initialGzipBytes - 1,
    maxTotalGzipBytes: metrics.totalGzipBytes
  })[0], /initial gzipped JS/);

  assert.match(evaluateWebBundleBudget(metrics, {
    maxChunkBytes: metrics.largest.size,
    maxInitialGzipBytes: metrics.initialGzipBytes,
    maxTotalGzipBytes: metrics.totalGzipBytes - 1
  })[0], /all gzipped JS/);
});

function createDist(files) {
  const distRoot = mkdtempSync(join(tmpdir(), "pixelaid-bundle-budget-"));
  temporaryDirectories.push(distRoot);
  const assetsDir = join(distRoot, "assets");
  mkdirSync(assetsDir);
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(assetsDir, name), contents);
  }
  return distRoot;
}
