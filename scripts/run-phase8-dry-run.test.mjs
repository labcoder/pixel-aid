import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defaultPhase8DryRunOutput, parsePhase8DryRunArgs } from "./run-phase8-dry-run.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

test("defaults the Phase 8 dry run outside the repository", () => {
  const parsed = parsePhase8DryRunArgs([]);
  assert.equal(parsed.help, false);
  assert.equal(parsed.overwrite, false);
  assert.equal(parsed.outputRoot, defaultPhase8DryRunOutput);
  assert.equal(path.basename(path.dirname(parsed.outputRoot)), "pixel-aid-phase8-evidence");
});

test("parses an explicit dry-run output and overwrite opt-in", () => {
  const parsed = parsePhase8DryRunArgs(["--out-dir", "./local-evidence", "--overwrite"]);
  assert.equal(parsed.outputRoot, path.resolve("./local-evidence"));
  assert.equal(parsed.overwrite, true);
});

test("preregisters 24 unique first-party procedural fixtures", async () => {
  const manifest = JSON.parse(
    await readFile(path.resolve(scriptDir, "../docs/research/phase8-dry-run-corpus.json"), "utf8")
  );
  assert.equal(manifest.assets.length, 24);
  assert.equal(new Set(manifest.assets.map((asset) => asset.id)).size, 24);
  assert.match(manifest.purpose, /procedural instrumentation dry run only/iu);
  assert.match(manifest.license, /first-party synthetic/iu);
  assert.deepEqual(
    manifest.assets.filter((asset) => asset.generator === "step1g").map((asset) => asset.expectedGeometry),
    [
      { field: "nativeCanvas", width: 24, height: 56 },
      { field: "nativeCanvas", width: 24, height: 24 }
    ]
  );
});
