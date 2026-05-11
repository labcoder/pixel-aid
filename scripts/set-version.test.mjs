import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveNextVersion, setWorkspaceVersion } from "./set-version.mjs";

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "set-version.mjs");

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function createVersionFixture(currentVersion = "0.1.0") {
  const cwd = await mkdtemp(path.join(tmpdir(), "pixelaid-version-test-"));
  const packages = new Map([
    [
      "package.json",
      {
        name: "pixelaid",
        version: currentVersion,
        private: true,
        workspaces: ["apps/*", "packages/*"],
      },
    ],
    [
      "apps/web/package.json",
      {
        name: "@pixelaid/web",
        version: currentVersion,
        private: true,
        dependencies: {
          "@pixelaid/core": currentVersion,
          "@pixelaid/shared": currentVersion,
          react: "^19.0.0",
        },
      },
    ],
    [
      "apps/desktop/package.json",
      {
        name: "@pixelaid/desktop",
        version: currentVersion,
        private: true,
        devDependencies: {
          "@tauri-apps/cli": "^2.0.0",
        },
      },
    ],
    [
      "packages/core/package.json",
      {
        name: "@pixelaid/core",
        version: currentVersion,
        dependencies: {
          "@pixelaid/shared": currentVersion,
        },
      },
    ],
    [
      "packages/cli/package.json",
      {
        name: "@pixelaid/cli",
        version: currentVersion,
        dependencies: {
          "@pixelaid/core": currentVersion,
          "@pixelaid/shared": currentVersion,
          fflate: "^0.8.2",
        },
      },
    ],
    [
      "packages/shared/package.json",
      {
        name: "@pixelaid/shared",
        version: currentVersion,
      },
    ],
  ]);

  for (const [relativePath, json] of packages) {
    await writeJson(path.join(cwd, relativePath), json);
  }

  await writeJson(path.join(cwd, "package-lock.json"), {
    name: "pixelaid",
    version: currentVersion,
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "pixelaid",
        version: currentVersion,
        workspaces: ["apps/*", "packages/*"],
      },
      "apps/web": {
        name: "@pixelaid/web",
        version: currentVersion,
        dependencies: {
          "@pixelaid/core": currentVersion,
          "@pixelaid/shared": currentVersion,
          react: "^19.0.0",
        },
      },
      "apps/desktop": {
        name: "@pixelaid/desktop",
        version: currentVersion,
      },
      "node_modules/@pixelaid/core": {
        resolved: "packages/core",
        link: true,
      },
      "packages/core": {
        name: "@pixelaid/core",
        version: currentVersion,
        dependencies: {
          "@pixelaid/shared": currentVersion,
        },
      },
      "packages/cli": {
        name: "@pixelaid/cli",
        version: currentVersion,
        dependencies: {
          "@pixelaid/core": currentVersion,
          "@pixelaid/shared": currentVersion,
          fflate: "^0.8.2",
        },
      },
      "packages/shared": {
        name: "@pixelaid/shared",
        version: currentVersion,
      },
    },
  });

  await mkdir(path.join(cwd, "apps/desktop/src-tauri"), { recursive: true });
  await writeFile(
    path.join(cwd, "apps/desktop/src-tauri/Cargo.toml"),
    `[package]\nname = "pixelaid-desktop"\nversion = "${currentVersion}"\nedition = "2021"\n`,
    "utf8",
  );
  await writeJson(path.join(cwd, "apps/desktop/src-tauri/tauri.conf.json"), {
    productName: "PixelAid",
    version: currentVersion,
  });

  return cwd;
}

test("sets every workspace, lockfile, desktop, and internal dependency version", async () => {
  const cwd = await createVersionFixture();

  try {
    const result = await setWorkspaceVersion({ cwd, target: "0.2.3" });

    assert.equal(result.previousVersion, "0.1.0");
    assert.equal(result.nextVersion, "0.2.3");
    assert.ok(result.updatedFiles.includes("package.json"));
    assert.ok(result.updatedFiles.includes("apps/desktop/src-tauri/Cargo.toml"));

    for (const relativePath of [
      "package.json",
      "apps/web/package.json",
      "apps/desktop/package.json",
      "packages/core/package.json",
      "packages/cli/package.json",
      "packages/shared/package.json",
    ]) {
      const json = await readJson(path.join(cwd, relativePath));
      assert.equal(json.version, "0.2.3", relativePath);
    }

    const webPackage = await readJson(path.join(cwd, "apps/web/package.json"));
    assert.equal(webPackage.dependencies["@pixelaid/core"], "0.2.3");
    assert.equal(webPackage.dependencies["@pixelaid/shared"], "0.2.3");
    assert.equal(webPackage.dependencies.react, "^19.0.0");

    const lockfile = await readJson(path.join(cwd, "package-lock.json"));
    assert.equal(lockfile.version, "0.2.3");
    assert.equal(lockfile.packages[""].version, "0.2.3");
    assert.equal(lockfile.packages["apps/web"].version, "0.2.3");
    assert.equal(lockfile.packages["apps/web"].dependencies["@pixelaid/core"], "0.2.3");
    assert.equal(lockfile.packages["packages/core"].dependencies["@pixelaid/shared"], "0.2.3");
    assert.equal(lockfile.packages["packages/cli"].dependencies.fflate, "^0.8.2");

    const cargoToml = await readFile(path.join(cwd, "apps/desktop/src-tauri/Cargo.toml"), "utf8");
    assert.match(cargoToml, /version = "0\.2\.3"/u);

    const tauriConfig = await readJson(path.join(cwd, "apps/desktop/src-tauri/tauri.conf.json"));
    assert.equal(tauriConfig.version, "0.2.3");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("resolves exact semver and release increments from the current root version", () => {
  assert.equal(resolveNextVersion("1.2.3", "1.4.0"), "1.4.0");
  assert.equal(resolveNextVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(resolveNextVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(resolveNextVersion("1.2.3", "major"), "2.0.0");
});

test("rejects invalid version targets", async () => {
  const cwd = await createVersionFixture();

  try {
    await assert.rejects(
      () => setWorkspaceVersion({ cwd, target: "v1.2" }),
      (error) => error.code === "INVALID_VERSION_TARGET" && /v1\.2/u.test(error.message),
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("requires aligned current package versions before release increments", async () => {
  const cwd = await createVersionFixture();

  try {
    const corePackagePath = path.join(cwd, "packages/core/package.json");
    const corePackage = await readJson(corePackagePath);
    corePackage.version = "0.1.1";
    await writeJson(corePackagePath, corePackage);

    await assert.rejects(
      () => setWorkspaceVersion({ cwd, target: "patch" }),
      (error) => error.code === "VERSION_MISMATCH" && /packages\/core\/package\.json/u.test(error.message),
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("the CLI exits with usage guidance when no target is provided", async () => {
  const cwd = await createVersionFixture();

  try {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd,
      encoding: "utf8",
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage: npm run version:set -- <version\|patch\|minor\|major>/u);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
