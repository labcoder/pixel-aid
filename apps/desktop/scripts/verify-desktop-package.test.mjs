import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyMacosPackageDirectory } from "./verify-desktop-package.mjs";

test("verifies macOS app executable from CFBundleExecutable", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pixelaid-macos-verify-"));
  const packageDir = path.join(root, "PixelAid-0.1.0-macos-arm64-app");
  const appDir = path.join(packageDir, "PixelAid.app");
  const macosDir = path.join(appDir, "Contents", "MacOS");
  const executable = path.join(macosDir, "pixelaid-desktop");

  await mkdir(macosDir, { recursive: true });
  await writeFile(
    path.join(appDir, "Contents", "Info.plist"),
    [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<plist version=\"1.0\">",
      "<dict>",
      "<key>CFBundleExecutable</key>",
      "<string>pixelaid-desktop</string>",
      "</dict>",
      "</plist>",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(executable, "test executable", "utf8");
  await chmod(executable, 0o755);

  const result = await verifyMacosPackageDirectory({ packageRoot: root });

  assert.equal(result.appPath, appDir);
  assert.equal(result.executableName, "pixelaid-desktop");
  assert.equal(result.executablePath, executable);
});

test("verifies signed macOS app checks without exposing command output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pixelaid-macos-signed-verify-"));
  const packageDir = path.join(root, "PixelAid-0.1.0-macos-arm64-signed-app");
  const appDir = path.join(packageDir, "PixelAid.app");
  const macosDir = path.join(appDir, "Contents", "MacOS");
  const executable = path.join(macosDir, "pixelaid-desktop");
  const commands = [];

  await mkdir(macosDir, { recursive: true });
  await writeFile(
    path.join(appDir, "Contents", "Info.plist"),
    [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<plist version=\"1.0\">",
      "<dict>",
      "<key>CFBundleExecutable</key>",
      "<string>pixelaid-desktop</string>",
      "</dict>",
      "</plist>",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(executable, "test executable", "utf8");
  await chmod(executable, 0o755);

  const result = await verifyMacosPackageDirectory({
    packageRoot: root,
    expectedArch: "arm64",
    signed: true,
    runCommand: (command, args) => {
      commands.push([command, ...args]);
      if (command === "file") {
        return { status: 0, stdout: "Mach-O 64-bit executable arm64" };
      }
      return { status: 0, stdout: "Developer ID Application: Example (TEAMID)" };
    },
  });

  assert.deepEqual(result.signing, {
    gatekeeper: true,
    notarized: true,
    signature: true,
  });
  assert.deepEqual(
    commands.map((command) => command[0]),
    ["file", "codesign", "xcrun", "spctl"],
  );
});
