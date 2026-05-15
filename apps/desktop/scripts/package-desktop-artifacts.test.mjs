import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  packageDesktopArtifact,
  parseDesktopPackageArgs,
  resolveMacosSigningConfig,
  resolveSubprocessCommand,
  resolveDesktopPackageTarget,
  stripMacosSigningEnv,
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

function createRecordingCommandRunner() {
  const calls = [];
  return {
    calls,
    runCommand: async (command, options = {}) => {
      calls.push({ command, env: options.env, label: options.label });
      if (options.archivePath) {
        await mkdir(path.dirname(options.archivePath), { recursive: true });
        await writeFile(options.archivePath, "zip bytes", "utf8");
      }
      if (command[0] === "ditto") {
        const outputPath = command.at(-1);
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, "zip bytes", "utf8");
      }
    },
  };
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

test("parses signed macOS package arguments", () => {
  assert.deepEqual(parseDesktopPackageArgs(["macos", "--signed", "--arch", "arm64"]), {
    arch: "arm64",
    signed: true,
    skipBuild: false,
    target: "macos",
  });
});

test("strips Apple signing env from unsigned macOS builds", () => {
  assert.deepEqual(stripMacosSigningEnv({
    APPLE_SIGNING_IDENTITY: "Developer ID Application: Example",
    APPLE_API_KEY: "key-id",
    APPLE_API_ISSUER: "issuer",
    APPLE_API_KEY_PATH: "/secure/key.p8",
    PATH: "/bin",
  }), {
    PATH: "/bin",
  });
});

test("resolves macOS signing configuration from env values", () => {
  assert.deepEqual(
    resolveMacosSigningConfig({
      env: {
        APPLE_SIGNING_IDENTITY: " Developer ID Application: Example ",
        APPLE_API_KEY: " KEYID ",
        APPLE_API_ISSUER: " 11111111-1111-4111-8111-111111111111 ",
        APPLE_API_KEY_PATH: "$HOME/private/AuthKey_KEYID.p8",
      },
      homeDir: "/Users/example",
    }),
    {
      identity: "Developer ID Application: Example",
      notarization: {
        issuer: "11111111-1111-4111-8111-111111111111",
        keyId: "KEYID",
        keyPath: "/Users/example/private/AuthKey_KEYID.p8",
      },
    },
  );
});

test("rejects a non-UUID App Store Connect issuer before notarytool runs", () => {
  assert.throws(
    () =>
      resolveMacosSigningConfig({
        env: {
          APPLE_SIGNING_IDENTITY: "Developer ID Application: Example",
          APPLE_API_KEY: "KEYID",
          APPLE_API_ISSUER: "ISSUER_UUID-not-a-uuid",
          APPLE_API_KEY_PATH: "/secure/AuthKey_KEYID.p8",
        },
      }),
    (error) =>
      error.code === "MACOS_SIGNING_ENV_INVALID" &&
      /APPLE_API_ISSUER must be the App Store Connect issuer UUID only/u.test(error.message),
  );
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

test("packages a signed macOS app bundle with signing, notarization, and stapling", async () => {
  const repoRoot = await createPackageFixture();

  try {
    const appBinaryPath = path.join(
      repoRoot,
      "apps/desktop/src-tauri/target/release/bundle/macos/PixelAid.app/Contents/MacOS/pixelaid-desktop",
    );
    await mkdir(path.dirname(appBinaryPath), { recursive: true });
    await writeFile(appBinaryPath, "app bytes", "utf8");
    await writeFile(
      path.join(repoRoot, ".env"),
      [
        "APPLE_SIGNING_IDENTITY=\"Developer ID Application: Example\"",
        "APPLE_API_KEY=KEYID",
        "APPLE_API_ISSUER=11111111-1111-4111-8111-111111111111",
        "APPLE_API_KEY_PATH=~/private/AuthKey_KEYID.p8",
        "",
      ].join("\n"),
      "utf8",
    );

    const commandRunner = createRecordingCommandRunner();
    const result = await packageDesktopArtifact({
      repoRoot,
      target: "macos",
      arch: "arm64",
      skipBuild: true,
      signed: true,
      env: {
        HOME: "/Users/example",
        PATH: "/bin",
      },
      runCommand: commandRunner.runCommand,
    });

    assert.equal(result.signed, true);
    assert.equal(result.archivePath, path.join(repoRoot, "artifacts/desktop/PixelAid-0.1.0-macos-arm64-signed-app.zip"));
    assert.match(
      await readFile(path.join(result.stageDir, "README.txt"), "utf8"),
      /Developer ID signed, notarized/u,
    );
    assert.deepEqual(
      commandRunner.calls.map((call) => call.label).filter(Boolean),
      [
        "codesign PixelAid.app",
        "codesign verify PixelAid.app",
        "create notarization zip",
        "xcrun notarytool submit PixelAid.app",
        "xcrun stapler staple PixelAid.app",
        "xcrun stapler validate PixelAid.app",
        "spctl assess PixelAid.app",
      ],
    );
    assert.equal(commandRunner.calls.at(-1).command[0], "ditto");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("rejects signed packaging for non-macOS targets", async () => {
  const repoRoot = await createPackageFixture();

  try {
    await assert.rejects(
      () =>
        packageDesktopArtifact({
          repoRoot,
          target: "windows",
          arch: "x64",
          skipBuild: true,
          signed: true,
          runCommand: fakeArchiveCommand,
        }),
      (error) => error.code === "SIGNED_TARGET_UNSUPPORTED",
    );
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
