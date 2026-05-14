import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  packageDesktopArtifact,
  resolveSubprocessCommand,
  resolveDesktopPackageTarget,
} from "./package-desktop-artifacts.mjs";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createPackageFixture() {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "pixelaid-desktop-package-test-"));
  await writeJson(path.join(repoRoot, "package.json"), {
    name: "pixelaid",
    version: "0.1.0",
  });
  await writeJson(path.join(repoRoot, "apps/desktop/src-tauri/tauri.conf.json"), {
    productName: "PixelAid",
    version: "0.1.0",
  });
  await writeFile(
    path.join(repoRoot, "apps/desktop/src-tauri/Cargo.toml"),
    `[package]\nname = "pixelaid-desktop"\nversion = "0.1.0"\nedition = "2021"\n`,
    "utf8",
  );

  for (const noticeFile of ["LICENSE", "NOTICE", "LICENSES.md", "THIRD_PARTY_NOTICES.md"]) {
    await writeFile(path.join(repoRoot, noticeFile), `${noticeFile} text\n`, "utf8");
  }

  return repoRoot;
}

async function fakeArchiveCommand(_command, { archivePath }) {
  await mkdir(path.dirname(archivePath), { recursive: true });
  await writeFile(archivePath, "zip bytes", "utf8");
}

test("resolves the current platform package target", () => {
  assert.equal(resolveDesktopPackageTarget(undefined, "win32"), "windows");
  assert.equal(resolveDesktopPackageTarget(undefined, "darwin"), "macos");
  assert.equal(resolveDesktopPackageTarget("windows", "darwin"), "windows");
  assert.throws(
    () => resolveDesktopPackageTarget(undefined, "linux"),
    (error) => error.code === "UNSUPPORTED_PLATFORM",
  );
});

test("wraps Windows command files through cmd.exe for spawning", () => {
  assert.deepEqual(resolveSubprocessCommand(["npm.cmd", "run", "check"], "win32"), {
    executable: "cmd.exe",
    args: ["/d", "/c", "npm.cmd", "run", "check"],
  });
  assert.deepEqual(resolveSubprocessCommand(["ditto", "--help"], "darwin"), {
    executable: "ditto",
    args: ["--help"],
  });
});

test("packages a Windows release executable into a portable archive", async () => {
  const repoRoot = await createPackageFixture();

  try {
    const exePath = path.join(repoRoot, "apps/desktop/src-tauri/target/release/pixelaid-desktop.exe");
    await mkdir(path.dirname(exePath), { recursive: true });
    await writeFile(exePath, "exe bytes", "utf8");

    const result = await packageDesktopArtifact({
      repoRoot,
      target: "windows",
      arch: "x64",
      skipBuild: true,
      runCommand: fakeArchiveCommand,
    });

    assert.equal(result.archivePath, path.join(repoRoot, "artifacts/desktop/PixelAid-0.1.0-windows-x64-portable.zip"));
    assert.equal(result.stageDir, path.join(repoRoot, "artifacts/desktop/staging/PixelAid-0.1.0-windows-x64-portable"));
    assert.equal(
      await readFile(path.join(result.stageDir, "PixelAid.exe"), "utf8"),
      "exe bytes",
    );
    assert.equal(await readFile(path.join(result.stageDir, "LICENSE"), "utf8"), "LICENSE text\n");
    assert.equal(await readFile(result.archivePath, "utf8"), "zip bytes");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("packages a macOS app bundle into an app archive", async () => {
  const repoRoot = await createPackageFixture();

  try {
    const appBinaryPath = path.join(
      repoRoot,
      "apps/desktop/src-tauri/target/release/bundle/macos/PixelAid.app/Contents/MacOS/pixelaid-desktop",
    );
    await mkdir(path.dirname(appBinaryPath), { recursive: true });
    await writeFile(appBinaryPath, "app bytes", "utf8");

    const result = await packageDesktopArtifact({
      repoRoot,
      target: "macos",
      arch: "arm64",
      skipBuild: true,
      runCommand: fakeArchiveCommand,
    });

    assert.equal(result.archivePath, path.join(repoRoot, "artifacts/desktop/PixelAid-0.1.0-macos-arm64-app.zip"));
    assert.equal(
      await readFile(path.join(result.stageDir, "PixelAid.app/Contents/MacOS/pixelaid-desktop"), "utf8"),
      "app bytes",
    );
    assert.equal(await readFile(path.join(result.stageDir, "NOTICE"), "utf8"), "NOTICE text\n");
    assert.equal(await readFile(result.archivePath, "utf8"), "zip bytes");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("fails clearly when the expected desktop build output is missing", async () => {
  const repoRoot = await createPackageFixture();

  try {
    await assert.rejects(
      () =>
        packageDesktopArtifact({
          repoRoot,
          target: "windows",
          arch: "x64",
          skipBuild: true,
          runCommand: fakeArchiveCommand,
        }),
      (error) =>
        error.code === "SOURCE_ARTIFACT_NOT_FOUND" &&
        /target[\\/]release[\\/]pixelaid-desktop\.exe/u.test(error.message),
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
