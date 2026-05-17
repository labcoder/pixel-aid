import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyMacosPackageDirectory, verifyWindowsPackageDirectory } from "./verify-desktop-package.mjs";

async function writeWindowsGuiExecutable(exePath) {
  const peHeaderOffset = 0x80;
  const data = Buffer.alloc(256);
  data.writeUInt32LE(peHeaderOffset, 0x3c);
  data.writeUInt16LE(2, peHeaderOffset + 0x5c);
  await writeFile(exePath, data);
}

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

test("verifies signed Windows executable checks", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pixelaid-windows-signed-verify-"));
  const exePath = path.join(root, "PixelAid.exe");
  const commands = [];
  await writeWindowsGuiExecutable(exePath);

  const result = await verifyWindowsPackageDirectory({
    env: {
      "ProgramFiles(x86)": path.join(root, "missing-program-files-x86"),
    },
    packageRoot: root,
    signed: true,
    runCommand: (command, args) => {
      commands.push([command, ...args]);
      return { status: 0, stdout: "Valid" };
    },
  });

  assert.equal(result.subsystem, 2);
  assert.deepEqual(result.signing, { signature: true });
  assert.deepEqual(commands.map((command) => command[0]), ["powershell.exe"]);
});

test("prefers configured SignTool for signed Windows executable verification", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pixelaid-windows-signtool-verify-"));
  const exePath = path.join(root, "PixelAid.exe");
  const signtoolPath = path.join(root, "tools", "signtool.exe");
  const commands = [];
  await writeWindowsGuiExecutable(exePath);
  await mkdir(path.dirname(signtoolPath), { recursive: true });
  await writeFile(signtoolPath, "signtool", "utf8");

  const result = await verifyWindowsPackageDirectory({
    env: {
      WINDOWS_SIGNING_SIGNTOOL_PATH: signtoolPath,
    },
    packageRoot: root,
    signed: true,
    runCommand: (command, args) => {
      commands.push([command, ...args]);
      return { status: 0, stdout: "Successfully verified" };
    },
  });

  assert.deepEqual(result.signing, { signature: true });
  assert.deepEqual(commands, [[signtoolPath, "verify", "/pa", exePath]]);
});

test("reports Authenticode status details when signed Windows fallback verification fails", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pixelaid-windows-signed-failed-verify-"));
  const exePath = path.join(root, "PixelAid.exe");
  await writeWindowsGuiExecutable(exePath);

  await assert.rejects(
    () =>
      verifyWindowsPackageDirectory({
        env: {
          "ProgramFiles(x86)": path.join(root, "missing-program-files-x86"),
        },
        packageRoot: root,
        signed: true,
        runCommand: () => ({
          status: 1,
          stderr: "Authenticode signature status: NotTrusted\nAuthenticode status message: certificate chain failed",
        }),
      }),
    /NotTrusted[\s\S]*certificate chain failed/u,
  );
});
