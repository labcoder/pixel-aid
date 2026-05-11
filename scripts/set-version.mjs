import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RELEASE_INCREMENTS = new Set(["patch", "minor", "major"]);
const VERSION_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const INTERNAL_VERSION_SPEC_PATTERN =
  /^([~^]?)(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

class VersionCommandError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = "VersionCommandError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

function parseSemver(version) {
  const match = SEMVER_PATTERN.exec(version);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? "",
    build: match[5] ?? "",
  };
}

export function resolveNextVersion(currentVersion, target) {
  if (typeof target !== "string" || target.trim() === "") {
    throw new VersionCommandError(
      "INVALID_VERSION_TARGET",
      "Version target is required. Use an exact semver version, patch, minor, or major.",
      2,
    );
  }

  const normalizedTarget = target.trim();
  if (!RELEASE_INCREMENTS.has(normalizedTarget)) {
    if (!parseSemver(normalizedTarget)) {
      throw new VersionCommandError(
        "INVALID_VERSION_TARGET",
        `Invalid version target "${normalizedTarget}". Use an exact semver version, patch, minor, or major.`,
        2,
      );
    }

    return normalizedTarget;
  }

  const current = parseSemver(currentVersion);
  if (!current || current.prerelease || current.build) {
    throw new VersionCommandError(
      "INVALID_CURRENT_VERSION",
      `Cannot apply "${normalizedTarget}" to current version "${currentVersion}". Release increments require a plain x.y.z version.`,
      2,
    );
  }

  if (normalizedTarget === "patch") {
    return `${current.major}.${current.minor}.${current.patch + 1}`;
  }

  if (normalizedTarget === "minor") {
    return `${current.major}.${current.minor + 1}.0`;
  }

  return `${current.major + 1}.0.0`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function toRepoRelative(cwd, filePath) {
  return path.relative(cwd, filePath).replace(/\\/gu, "/");
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeWorkspacePattern(pattern) {
  return pattern.replace(/\\/gu, "/").replace(/\/+$/u, "");
}

async function findWorkspacePackageJsons(cwd, workspaces) {
  const packageJsons = [path.join(cwd, "package.json")];

  for (const workspace of workspaces) {
    const normalized = normalizeWorkspacePattern(workspace);
    const match = /^(.*)\/\*$/u.exec(normalized);
    if (!match) {
      continue;
    }

    const workspaceRoot = path.join(cwd, match[1]);
    if (!(await fileExists(workspaceRoot))) {
      continue;
    }

    const entries = await readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageJsonPath = path.join(workspaceRoot, entry.name, "package.json");
      if (await fileExists(packageJsonPath)) {
        packageJsons.push(packageJsonPath);
      }
    }
  }

  return [...new Set(packageJsons)].sort((left, right) =>
    toRepoRelative(cwd, left).localeCompare(toRepoRelative(cwd, right)),
  );
}

function updateInternalDependencyVersions(json, internalPackageNames, nextVersion) {
  for (const field of VERSION_FIELDS) {
    const dependencies = json[field];
    if (!dependencies || typeof dependencies !== "object") {
      continue;
    }

    for (const packageName of internalPackageNames) {
      const currentSpec = dependencies[packageName];
      if (typeof currentSpec !== "string") {
        continue;
      }

      const match = INTERNAL_VERSION_SPEC_PATTERN.exec(currentSpec);
      if (match) {
        dependencies[packageName] = `${match[1]}${nextVersion}`;
      }
    }
  }
}

function stringifyJson(json) {
  return `${JSON.stringify(json, null, 2)}\n`;
}

async function writeIfChanged(cwd, filePath, content, updatedFiles) {
  const existingContent = await readFile(filePath, "utf8");
  if (existingContent === content) {
    return;
  }

  await writeFile(filePath, content, "utf8");
  updatedFiles.push(toRepoRelative(cwd, filePath));
}

function collectPackageVersionMismatches(packageFiles, currentVersion) {
  return packageFiles
    .filter(({ json }) => json.version !== currentVersion)
    .map(({ relativePath, json }) => `${relativePath} has ${json.version ?? "(missing)"}`);
}

function updateLockfilePackage(lockPackage, internalPackageNames, nextVersion) {
  if (!lockPackage || typeof lockPackage !== "object") {
    return;
  }

  if (typeof lockPackage.version === "string") {
    lockPackage.version = nextVersion;
  }

  updateInternalDependencyVersions(lockPackage, internalPackageNames, nextVersion);
}

async function updatePackageLock(cwd, internalPackageNames, packageFiles, nextVersion, updatedFiles) {
  const lockfilePath = path.join(cwd, "package-lock.json");
  if (!(await fileExists(lockfilePath))) {
    return;
  }

  const lockfile = await readJson(lockfilePath);
  if (typeof lockfile.version === "string") {
    lockfile.version = nextVersion;
  }

  if (lockfile.packages && typeof lockfile.packages === "object") {
    updateLockfilePackage(lockfile.packages[""], internalPackageNames, nextVersion);

    for (const { relativeDir } of packageFiles) {
      if (relativeDir === "") {
        continue;
      }

      updateLockfilePackage(lockfile.packages[relativeDir], internalPackageNames, nextVersion);
    }

    for (const lockPackage of Object.values(lockfile.packages)) {
      if (!lockPackage || typeof lockPackage !== "object") {
        continue;
      }

      if (typeof lockPackage.name === "string" && internalPackageNames.has(lockPackage.name)) {
        updateLockfilePackage(lockPackage, internalPackageNames, nextVersion);
      }
    }
  }

  if (lockfile.dependencies && typeof lockfile.dependencies === "object") {
    for (const [packageName, dependency] of Object.entries(lockfile.dependencies)) {
      if (internalPackageNames.has(packageName)) {
        updateLockfilePackage(dependency, internalPackageNames, nextVersion);
      }
    }
  }

  await writeIfChanged(cwd, lockfilePath, stringifyJson(lockfile), updatedFiles);
}

function updateCargoPackageVersion(cargoToml, nextVersion) {
  const updated = cargoToml.replace(
    /(^\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/mu,
    `$1${nextVersion}$2`,
  );

  if (updated === cargoToml) {
    throw new VersionCommandError(
      "CARGO_VERSION_NOT_FOUND",
      "Could not find the [package] version in apps/desktop/src-tauri/Cargo.toml.",
    );
  }

  return updated;
}

async function updateCargoToml(cwd, nextVersion, updatedFiles) {
  const cargoTomlPath = path.join(cwd, "apps/desktop/src-tauri/Cargo.toml");
  if (!(await fileExists(cargoTomlPath))) {
    return;
  }

  const cargoToml = await readFile(cargoTomlPath, "utf8");
  await writeIfChanged(cwd, cargoTomlPath, updateCargoPackageVersion(cargoToml, nextVersion), updatedFiles);
}

async function updateTauriConfig(cwd, nextVersion, updatedFiles) {
  const tauriConfigPath = path.join(cwd, "apps/desktop/src-tauri/tauri.conf.json");
  if (!(await fileExists(tauriConfigPath))) {
    return;
  }

  const tauriConfig = await readJson(tauriConfigPath);
  tauriConfig.version = nextVersion;
  await writeIfChanged(cwd, tauriConfigPath, stringifyJson(tauriConfig), updatedFiles);
}

export async function setWorkspaceVersion({ cwd = process.cwd(), target }) {
  const rootPackagePath = path.join(cwd, "package.json");
  const rootPackage = await readJson(rootPackagePath);
  const currentVersion = rootPackage.version;
  const normalizedTarget = typeof target === "string" ? target.trim() : target;
  const nextVersion = resolveNextVersion(currentVersion, normalizedTarget);
  const packageJsonPaths = await findWorkspacePackageJsons(cwd, rootPackage.workspaces ?? []);
  const packageFiles = [];

  for (const packageJsonPath of packageJsonPaths) {
    const json = await readJson(packageJsonPath);
    const relativePath = toRepoRelative(cwd, packageJsonPath);
    packageFiles.push({
      json,
      packageJsonPath,
      relativePath,
      relativeDir: path.dirname(relativePath) === "." ? "" : path.dirname(relativePath).replace(/\\/gu, "/"),
    });
  }

  if (RELEASE_INCREMENTS.has(normalizedTarget)) {
    const mismatches = collectPackageVersionMismatches(packageFiles, currentVersion);
    if (mismatches.length > 0) {
      throw new VersionCommandError(
        "VERSION_MISMATCH",
        `Cannot apply "${normalizedTarget}" because current package versions are not aligned to ${currentVersion}: ${mismatches.join(", ")}`,
        2,
      );
    }
  }

  const internalPackageNames = new Set(
    packageFiles.map(({ json }) => json.name).filter((name) => typeof name === "string" && name.length > 0),
  );
  const updatedFiles = [];

  for (const packageFile of packageFiles) {
    packageFile.json.version = nextVersion;
    updateInternalDependencyVersions(packageFile.json, internalPackageNames, nextVersion);
    await writeIfChanged(cwd, packageFile.packageJsonPath, stringifyJson(packageFile.json), updatedFiles);
  }

  await updatePackageLock(cwd, internalPackageNames, packageFiles, nextVersion, updatedFiles);
  await updateCargoToml(cwd, nextVersion, updatedFiles);
  await updateTauriConfig(cwd, nextVersion, updatedFiles);

  return {
    previousVersion: currentVersion,
    nextVersion,
    updatedFiles,
  };
}

function printUsage() {
  console.error("Usage: npm run version:set -- <version|patch|minor|major>");
  console.error("Examples:");
  console.error("  npm run version:set -- 0.2.0");
  console.error("  npm run version:set -- patch");
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    process.exitCode = argv.length === 1 ? 0 : 2;
    return;
  }

  try {
    const result = await setWorkspaceVersion({ target: argv[0] });
    console.log(`PixelAid version: ${result.previousVersion} -> ${result.nextVersion}`);

    if (result.updatedFiles.length === 0) {
      console.log("No files changed; versions were already aligned.");
      return;
    }

    console.log("Updated files:");
    for (const file of result.updatedFiles) {
      console.log(`- ${file}`);
    }
  } catch (error) {
    if (error instanceof VersionCommandError) {
      console.error(error.message);
      process.exitCode = error.exitCode;
      return;
    }

    throw error;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
