import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

async function readWorkflow(name) {
  return readFile(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
}

async function readScript(name) {
  return readFile(new URL(name, import.meta.url), "utf8");
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

test("desktop artifact workflow keeps unsigned Windows and arm64 macOS packages", async () => {
  const workflow = await readWorkflow("desktop-artifacts.yml");

  assertTelemetryEnv(workflow);
  assertIncludes(workflow, "run: npm run desktop:package:windows");
  assertIncludes(workflow, "TELEMETRY_DISTRIBUTION: desktop_windows_portable");
  assertIncludes(workflow, "runs-on: macos-15");
  assertIncludes(workflow, "name: macOS app zip (arm64)");
  assertIncludes(workflow, "run: npm run desktop:package:macos");
  assertIncludes(workflow, "node apps/desktop/scripts/verify-desktop-package.mjs macos \"$extract_dir\" arm64");
  assertIncludes(workflow, "name: pixelaid-macos-arm64-app");
  assertIncludes(workflow, "TELEMETRY_DISTRIBUTION: desktop_macos_app");
  assert.equal(workflow.includes("macos-15-intel"), false);
  assert.equal(workflow.includes("pixelaid-macos-x64-app"), false);
  assert.equal(workflow.includes("desktop:package:windows:signed"), false);
  assert.equal(workflow.includes("desktop:package:macos:signed"), false);
});

test("release artifact workflow builds web and unsigned desktop packages with telemetry distributions", async () => {
  const workflow = await readWorkflow("release-artifacts.yml");

  assertTelemetryEnv(workflow);
  assertIncludes(workflow, "name: Release Artifacts");
  assertIncludes(workflow, "workflow_dispatch:");
  assertIncludes(workflow, "push:");
  assertIncludes(workflow, "tags:");
  assertIncludes(workflow, '- "v*.*.*"');
  assertIncludes(workflow, "windows_signed:");
  assertIncludes(workflow, "macos_signed:");
  assertIncludes(workflow, "macos_x64:");
  assertIncludes(workflow, "publish_itch:");
  assertIncludes(workflow, "publish_npm:");
  assertIncludes(workflow, "Validate release tag");
  assertIncludes(workflow, "Release tag ${tag} does not match package version ${pkg.version}. Expected ${expected}.");
  assertIncludes(workflow, "run: npm run license:check");
  assertIncludes(workflow, "run: npm run typecheck");
  assertIncludes(workflow, "run: npm test");
  assertIncludes(workflow, "run: npm run lint");
  assertIncludes(workflow, "run: npm run build");
  assertIncludes(workflow, "run: npm run bundle:budget");
  assertIncludes(workflow, "run: npm run app-shell:check");
  assertIncludes(workflow, "run: npm run web:package:itch");
  assertIncludes(workflow, "TELEMETRY_DISTRIBUTION: web_itch");
  assertIncludes(workflow, "if: ${{ github.ref_type != 'tag' && github.event.inputs.windows_signed != 'true' }}");
  assertIncludes(workflow, "run: npm run desktop:package:windows");
  assertIncludes(workflow, "TELEMETRY_DISTRIBUTION: desktop_windows_portable");
  assertIncludes(workflow, "run: npm run desktop:package:macos");
  assertIncludes(workflow, "TELEMETRY_DISTRIBUTION: desktop_macos_app");
  assertIncludes(workflow, "if: ${{ github.ref_type != 'tag' && github.event.inputs.macos_signed != 'true' }}");
  assertIncludes(workflow, "fromJSON((github.ref_type == 'tag' || github.event.inputs.macos_x64 == 'true')");
  assertIncludes(workflow, "\"runner\":\"macos-15\",\"arch\":\"arm64\"");
  assertIncludes(workflow, "\"runner\":\"macos-15-intel\",\"arch\":\"x64\"");
  assertIncludes(workflow, "name: pixelaid-web-itch");
  assertIncludes(workflow, "name: pixelaid-windows-portable");
  assertIncludes(workflow, "name: pixelaid-macos-${{ matrix.arch }}-app");
  assertIncludes(workflow, "name: pixelaid-cli-npm");
  assertIncludes(workflow, "npm pack -w pixelaid --pack-destination artifacts/cli");
  assertIncludes(workflow, "run: npm publish -w pixelaid --dry-run");
  assert.equal(workflow.includes("run: npm run web:package:standalone"), false);
  assert.equal(workflow.includes("TELEMETRY_DISTRIBUTION: web_standalone"), false);
  assert.equal(workflow.includes("name: pixelaid-web-standalone"), false);
});

test("release artifact workflow keeps npm publication explicit", async () => {
  const workflow = await readWorkflow("release-artifacts.yml");

  assertIncludes(workflow, "name: Publish CLI to npm");
  assertIncludes(workflow, "if: ${{ github.event_name == 'workflow_dispatch' && github.event.inputs.publish_npm == 'true' }}");
  assertIncludes(workflow, "environment: release-publishing");
  assertIncludes(workflow, "registry-url: https://registry.npmjs.org");
  assertIncludes(workflow, "run: npm publish -w pixelaid --access public --provenance");
  assertIncludes(workflow, "NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}");
});

test("release artifact workflow can build signed Windows packages through release environment", async () => {
  const workflow = await readWorkflow("release-artifacts.yml");

  assertIncludes(workflow, "if: ${{ github.ref_type == 'tag' || github.event.inputs.windows_signed == 'true' }}");
  assertIncludes(workflow, "environment: release-signing");
  assertIncludes(workflow, "id-token: write");
  assertIncludes(workflow, "uses: azure/login@v3");
  assertIncludes(workflow, "client-id: ${{ secrets.AZURE_CLIENT_ID }}");
  assertIncludes(workflow, "tenant-id: ${{ secrets.AZURE_TENANT_ID }}");
  assertIncludes(workflow, "subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}");
  assertIncludes(workflow, "uses: actions/setup-dotnet@v5");
  assertIncludes(workflow, "dotnet-version: 8.0.x");
  assertIncludes(workflow, "dotnet add $project package Microsoft.ArtifactSigning.Client");
  assertIncludes(workflow, "run: npm run desktop:package:windows:signed");
  assertIncludes(workflow, "WINDOWS_SIGNING_ENDPOINT: ${{ secrets.WINDOWS_SIGNING_ENDPOINT }}");
  assertIncludes(workflow, "WINDOWS_SIGNING_ACCOUNT_NAME: ${{ secrets.WINDOWS_SIGNING_ACCOUNT_NAME }}");
  assertIncludes(workflow, "WINDOWS_SIGNING_CERTIFICATE_PROFILE_NAME: ${{ secrets.WINDOWS_SIGNING_CERTIFICATE_PROFILE_NAME }}");
  assertIncludes(workflow, "node apps/desktop/scripts/verify-desktop-package.mjs windows $extractDir --signed");
  assertIncludes(workflow, "name: pixelaid-windows-signed-portable");
  assertIncludes(workflow, "path: artifacts/desktop/*windows*-signed-portable.zip");
});

test("release artifact workflow can build signed macOS packages through release environment", async () => {
  const workflow = await readWorkflow("release-artifacts.yml");

  assertIncludes(workflow, "if: ${{ github.ref_type == 'tag' || github.event.inputs.macos_signed == 'true' }}");
  assertIncludes(workflow, "environment: release-signing");
  assertIncludes(workflow, "MACOS_CERTIFICATE_P12_BASE64: ${{ secrets.MACOS_CERTIFICATE_P12_BASE64 }}");
  assertIncludes(workflow, "MACOS_CERTIFICATE_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}");
  assertIncludes(workflow, "MACOS_KEYCHAIN_PASSWORD: ${{ secrets.MACOS_KEYCHAIN_PASSWORD }}");
  assertIncludes(workflow, "APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}");
  assertIncludes(workflow, "APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}");
  assertIncludes(workflow, "APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}");
  assertIncludes(workflow, "APPLE_API_KEY_P8_BASE64: ${{ secrets.APPLE_API_KEY_P8_BASE64 }}");
  assertIncludes(workflow, "security create-keychain");
  assertIncludes(workflow, "security import \"$certificate_path\"");
  assertIncludes(workflow, "run: npm run desktop:package:macos:signed -- --arch ${{ matrix.arch }}");
  assertIncludes(workflow, "node apps/desktop/scripts/verify-desktop-package.mjs macos \"$extract_dir\" \"${{ matrix.arch }}\" --signed");
  assertIncludes(workflow, "name: pixelaid-macos-${{ matrix.arch }}-signed-app");
  assertIncludes(workflow, "path: artifacts/desktop/*macos*-${{ matrix.arch }}-signed-app.zip");
});

test("release artifact workflow can publish release artifacts to itch.io", async () => {
  const workflow = await readWorkflow("release-artifacts.yml");
  const publishScript = await readScript("publish-itch-artifacts.sh");

  assertIncludes(workflow, "if: ${{ always() && (github.ref_type == 'tag' || github.event.inputs.publish_itch == 'true') }}");
  assertIncludes(workflow, "environment: release-publishing");
  assertIncludes(workflow, "RELEASE_TAG: ${{ github.ref_type == 'tag' }}");
  assertIncludes(workflow, "BUTLER_API_KEY: ${{ secrets.BUTLER_API_KEY }}");
  assertIncludes(workflow, "ITCH_TARGET: ${{ vars.ITCH_TARGET }}");
  assertIncludes(workflow, 'if [ "$RELEASE_TAG" != "true" ] && { [ "$WINDOWS_SIGNED" != "true" ] || [ "$MACOS_SIGNED" != "true" ]; }; then');
  assertIncludes(workflow, "uses: actions/download-artifact@v8");
  assertIncludes(workflow, "skip-decompress: true");
  assertIncludes(workflow, "https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default");
  assertIncludes(workflow, "bash scripts/publish-itch-artifacts.sh");
  assertIncludes(publishScript, "Downloaded artifact files:");
  assertIncludes(publishScript, "find \"$artifact_root\" -name \"$pattern\"");
  assertIncludes(publishScript, "find_artifact '*web-itch.zip'");
  assertIncludes(publishScript, "find_artifact '*windows*-signed-portable.zip'");
  assertIncludes(publishScript, "find_artifact '*macos*-arm64-signed-app.zip'");
  assertIncludes(publishScript, "butler push \"$web_zip\" \"$ITCH_TARGET:html5\" --userversion \"$version\"");
  assertIncludes(publishScript, "butler push \"$windows_zip\" \"$ITCH_TARGET:windows\" --userversion \"$version\"");
  assertIncludes(publishScript, "butler push \"$macos_arm64_dir\" \"$ITCH_TARGET:macos-arm64\" --userversion \"$version\"");
  assertIncludes(publishScript, "butler push \"$macos_x64_dir\" \"$ITCH_TARGET:macos-x64\" --userversion \"$version\"");
  assertIncludes(workflow, "Itch publishing requires windows_signed and macos_signed.");
  assertIncludes(workflow, "PUBLISH_MACOS_X64: ${{ github.ref_type == 'tag' || github.event.inputs.macos_x64 == 'true' }}");
  assert.equal(workflow.includes("release-artifacts/pixelaid-web-itch"), false);
});

test("publish itch workflow can reuse artifacts from an existing release run", async () => {
  const workflow = await readWorkflow("publish-itch.yml");

  assertIncludes(workflow, "name: Publish itch.io");
  assertIncludes(workflow, "run_id:");
  assertIncludes(workflow, "macos_x64:");
  assertIncludes(workflow, "actions: read");
  assertIncludes(workflow, "environment: release-publishing");
  assertIncludes(workflow, "uses: actions/download-artifact@v8");
  assertIncludes(workflow, "run-id: ${{ inputs.run_id }}");
  assertIncludes(workflow, "github-token: ${{ secrets.GITHUB_TOKEN }}");
  assertIncludes(workflow, "skip-decompress: true");
  assertIncludes(workflow, "BUTLER_API_KEY: ${{ secrets.BUTLER_API_KEY }}");
  assertIncludes(workflow, "ITCH_TARGET: ${{ vars.ITCH_TARGET }}");
  assertIncludes(workflow, "PUBLISH_MACOS_X64: ${{ inputs.macos_x64 }}");
  assertIncludes(workflow, "bash scripts/publish-itch-artifacts.sh");
});
