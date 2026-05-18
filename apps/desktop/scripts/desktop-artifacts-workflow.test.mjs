import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.resolve(scriptDir, "..", "..", "..", ".github", "workflows", "desktop-artifacts.yml");

test("desktop artifact uploads preserve package zips directly", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  const uploadArtifactSteps = workflow.match(/uses: actions\/upload-artifact@v7[\s\S]*?(?=\n\s*- name:|\n\s*$)/gu) ?? [];

  assert.equal(uploadArtifactSteps.length, 2);
  for (const step of uploadArtifactSteps) {
    assert.match(step, /\n\s+archive: false/u);
  }
});

test("desktop artifact workflow only builds arm64 macOS package", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /runs-on: macos-15/u);
  assert.match(workflow, /pixelaid-macos-arm64-app/u);
  assert.doesNotMatch(workflow, /macos-15-intel/u);
  assert.doesNotMatch(workflow, /pixelaid-macos-x64-app/u);
});

test("macOS workflow verification reads the bundle executable name dynamically", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.doesNotMatch(workflow, /Contents\/MacOS\/PixelAid/u);
  assert.match(workflow, /verify-desktop-package\.mjs macos/u);
});
