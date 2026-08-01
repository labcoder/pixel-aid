import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { zipSync } from "fflate";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const noticeFiles = ["LICENSE", "NOTICE", "LICENSES.md", "THIRD_PARTY_NOTICES.md", "RELEASE_NOTES.md"];
const packageTargets = new Set(["itch", "standalone"]);

class WebPackageError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = "WebPackageError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function npmExecutable() {
  return "npm";
}

function resolveSubprocessCommand(command, platform = process.platform) {
  if (platform === "win32" && command[0] === "npm") {
    return {
      executable: "cmd.exe",
      args: ["/d", "/c", ...command]
    };
  }

  return {
    executable: command[0],
    args: command.slice(1)
  };
}

async function runCommand(command, { cwd = repoRoot, env = process.env, label } = {}) {
  const subprocess = resolveSubprocessCommand(command);
  await new Promise((resolve, reject) => {
    const child = spawn(subprocess.executable, subprocess.args, {
      cwd,
      env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new WebPackageError("COMMAND_FAILED", `Command "${label ?? command.join(" ")}" failed with exit code ${code}.`));
    });
  });
}

export function resolveWebPackageTarget(target) {
  if (target === undefined || target === "current") {
    return "standalone";
  }

  if (packageTargets.has(target)) {
    return target;
  }

  throw new WebPackageError("INVALID_TARGET", `Invalid web package target "${target}". Use itch or standalone.`, 2);
}

export function parseWebPackageArgs(argv = process.argv.slice(2)) {
  const args = [...argv];
  let target;
  let skipBuild = false;

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === "--skip-build") {
      skipBuild = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new WebPackageError("HELP", "Usage: npm run web:package -- [itch|standalone] [--skip-build]", 0);
    }

    if (arg?.startsWith("--")) {
      throw new WebPackageError("INVALID_ARGUMENT", `Invalid argument "${arg}".`, 2);
    }

    if (target !== undefined) {
      throw new WebPackageError("INVALID_ARGUMENT", `Unexpected extra target "${arg}".`, 2);
    }

    target = arg;
  }

  return {
    target: resolveWebPackageTarget(target),
    skipBuild
  };
}

export function getWebArtifactName({ version, target }) {
  return `PixelAid-${version}-web-${target}.zip`;
}

function readmeForTarget(target) {
  const targetLine = target === "itch"
    ? "PixelAid web package for itch.io HTML5 upload."
    : "PixelAid web package for standalone static hosting.";
  return `${targetLine}\n\nRobust Preview is opt-in; Classic remains the default.\nSee RELEASE_NOTES.md for eligibility and current limitations.\n`;
}

async function copyDirectoryContents(sourceDir, destinationDir) {
  await mkdir(destinationDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    await cp(path.join(sourceDir, entry.name), path.join(destinationDir, entry.name), { recursive: true });
  }
}

async function collectZipEntries(directory, baseDir = directory) {
  const files = {};
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      Object.assign(files, await collectZipEntries(fullPath, baseDir));
      continue;
    }

    const relativePath = path.relative(baseDir, fullPath).replace(/\\/gu, "/");
    files[relativePath] = new Uint8Array(await readFile(fullPath));
  }

  return files;
}

async function createZipFromDirectory(stageDir, archivePath) {
  const files = await collectZipEntries(stageDir);
  await mkdir(path.dirname(archivePath), { recursive: true });
  await writeFile(archivePath, zipSync(files, { level: 9 }));
}

export async function packageWebArtifact({
  repoRoot: packageRepoRoot = repoRoot,
  target = "standalone",
  skipBuild = false,
  env = process.env,
  runCommand: commandRunner = runCommand
} = {}) {
  const resolvedTarget = resolveWebPackageTarget(target);
  const packageJson = await readJson(path.join(packageRepoRoot, "package.json"));
  const version = packageJson.version;
  const packageName = `PixelAid-${version}-web-${resolvedTarget}`;
  const distDir = path.join(packageRepoRoot, "apps/web/dist");
  const stageDir = path.join(packageRepoRoot, "artifacts/web/staging", packageName);
  const archivePath = path.join(packageRepoRoot, "artifacts/web", getWebArtifactName({ version, target: resolvedTarget }));

  if (!skipBuild) {
    await commandRunner([npmExecutable(), "run", "build", "-w", "@pixelaid/web"], {
      cwd: packageRepoRoot,
      env: {
        ...env,
        PIXELAID_WEB_BASE: "./",
        PIXELAID_WEB_PACKAGE_TARGET: resolvedTarget
      },
      label: "npm run build -w @pixelaid/web"
    });
  }

  if (!(await pathExists(path.join(distDir, "index.html")))) {
    throw new WebPackageError(
      "WEB_DIST_NOT_FOUND",
      "Expected apps/web/dist/index.html. Run npm run build -w @pixelaid/web before packaging or omit --skip-build.",
    );
  }

  await rm(stageDir, { recursive: true, force: true });
  await rm(archivePath, { force: true });
  await copyDirectoryContents(distDir, stageDir);

  for (const noticeFile of noticeFiles) {
    const sourcePath = path.join(packageRepoRoot, noticeFile);
    if (await pathExists(sourcePath)) {
      await cp(sourcePath, path.join(stageDir, noticeFile));
    }
  }

  await writeFile(path.join(stageDir, "README.txt"), readmeForTarget(resolvedTarget), "utf8");
  await createZipFromDirectory(stageDir, archivePath);

  return {
    archivePath,
    stageDir,
    target: resolvedTarget
  };
}

function printUsage() {
  console.error("Usage: npm run web:package -- [itch|standalone] [--skip-build]");
  console.error("Examples:");
  console.error("  npm run web:package:itch");
  console.error("  npm run web:package:standalone");
}

async function main() {
  try {
    const options = parseWebPackageArgs();
    const result = await packageWebArtifact(options);
    console.log(`Created ${result.archivePath}`);
  } catch (error) {
    if (error instanceof WebPackageError) {
      if (error.code === "HELP") {
        printUsage();
      } else {
        console.error(error.message);
      }
      process.exitCode = error.exitCode;
      return;
    }

    throw error;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
