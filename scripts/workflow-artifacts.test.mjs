import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

async function readWorkflow(name) {
  return readFile(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
}

function assertIncludes(text, expected) {
  assert.ok(text.includes(expected), `Expected workflow to include: ${expected}`);
}

function assertTelemetryEnv(text) {
  assertIncludes(text, "TELEMETRY_PROVIDER: ${{ vars.TELEMETRY_PROVIDER }}");
  assertIncludes(text, "TELEMETRY_POSTHOG_PROJECT_KEY: ${{ secrets.TELEMETRY_POSTHOG_PROJECT_KEY }}");
  assertIncludes(text, "TELEMETRY_POSTHOG_HOST: ${{ vars.TELEMETRY_POSTHOG_HOST }}");
  assertIncludes(text, "TELEMETRY_ENABLED: ${{ vars.TELEMETRY_ENABLED }}");
  assertIncludes(text, "TELEMETRY_BUILD_CHANNEL: ${{ vars.TELEMETRY_BUILD_CHANNEL }}");
}

test("desktop artifact workflow keeps unsigned packages but injects telemetry distributions", async () => {
  const workflow = await readWorkflow("desktop-artifacts.yml");

  assertTelemetryEnv(workflow);
  assertIncludes(workflow, "run: npm run desktop:package:windows");
  assertIncludes(workflow, "TELEMETRY_DISTRIBUTION: desktop_windows_portable");
  assertIncludes(workflow, "run: npm run desktop:package:macos");
  assertIncludes(workflow, "TELEMETRY_DISTRIBUTION: desktop_macos_app");
  assert.equal(workflow.includes("desktop:package:windows:signed"), false);
  assert.equal(workflow.includes("desktop:package:macos:signed"), false);
});

test("release artifact workflow builds web and unsigned desktop packages with telemetry distributions", async () => {
  const workflow = await readWorkflow("release-artifacts.yml");

  assertTelemetryEnv(workflow);
  assertIncludes(workflow, "name: Release Artifacts");
  assertIncludes(workflow, "workflow_dispatch:");
  assertIncludes(workflow, "run: npm run license:check");
  assertIncludes(workflow, "run: npm run typecheck");
  assertIncludes(workflow, "run: npm test");
  assertIncludes(workflow, "run: npm run lint");
  assertIncludes(workflow, "run: npm run web:package:standalone");
  assertIncludes(workflow, "TELEMETRY_DISTRIBUTION: web_standalone");
  assertIncludes(workflow, "run: npm run web:package:itch");
  assertIncludes(workflow, "TELEMETRY_DISTRIBUTION: web_itch");
  assertIncludes(workflow, "run: npm run desktop:package:windows");
  assertIncludes(workflow, "TELEMETRY_DISTRIBUTION: desktop_windows_portable");
  assertIncludes(workflow, "run: npm run desktop:package:macos");
  assertIncludes(workflow, "TELEMETRY_DISTRIBUTION: desktop_macos_app");
  assertIncludes(workflow, "name: pixelaid-web-standalone");
  assertIncludes(workflow, "name: pixelaid-web-itch");
  assertIncludes(workflow, "name: pixelaid-windows-portable");
  assertIncludes(workflow, "name: pixelaid-macos-${{ matrix.arch }}-app");
  assert.equal(workflow.includes(":signed"), false);
});
