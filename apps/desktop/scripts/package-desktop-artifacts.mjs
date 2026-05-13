import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const noticeFiles = ["LICENSE", "NOTICE", "LICENSES.md", "THIRD_PARTY_NOTICES.md"];

class DesktopPackageError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = "DesktopPackageError";
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

function normalizeArch(arch) {
  if (arch === "x64" || arch === "arm64") {
    return arch;
  }

  return arch.replace(/[^a-z0-9._-]+/giu, "-");
}

function sanitizeName(value) {
  return value.replace(/[^a-z0-9._-]+/giu, "-").replace(/^-+|-+$/gu, "");
}

function escapePowerShellSingleQuoted(value) {
  return value.replace(/'/gu, "''");
}

function npmExecutable(platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

function parseCargoPackageName(cargoToml) {
  const match = /(^\[package\][\s\S]*?^name\s*=\s*")([^"]+)(")/mu.exec(cargoToml);
  if (!match) {
    throw new DesktopPackageError(
      "CARGO_PACKAGE_NAME_NOT_FOUND",
      "Could not find the [package] name in apps/desktop/src-tauri/Cargo.toml.",
    );
  }

  return match[2];
}

export function resolveDesktopPackageTarget(target, platform = process.platform) {
  if (target === "windows" || target === "macos") {
    return target;
  }

  if (target && target !== "current") {
    throw new DesktopPackageError(
      "INVALID_TARGET",
      `Invalid desktop package target "${target}". Use windows, macos, or omit the target for the current platform.`,
      2,
    );
  }

  if (platform === "win32") {
    return "windows";
  }

  if (platform === "darwin") {
    return "macos";
  }

  throw new DesktopPackageError(
    "UNSUPPORTED_PLATFORM",
    `No desktop package target is configured for platform "${platform}". Use windows or macos on the matching OS.`,
    2,
  );
}

function assertBuildPlatform({ target, platform, skipBuild }) {
  if (skipBuild) {
    return;
  }

  if (target === "windows" && platform !== "win32") {
    throw new DesktopPackageError(
      "TARGET_PLATFORM_MISMATCH",
      "Windows portable packages must be built on Windows. Re-run on Windows or pass --skip-build when packaging an existing build output.",
      2,
    );
  }

  if (target === "macos" && platform !== "darwin") {
    throw new DesktopPackageError(
      "TARGET_PLATFORM_MISMATCH",
      "macOS .app packages must be built on macOS. Re-run on macOS or pass --skip-build when packaging an existing build output.",
      2,
    );
  }
}

function buildCommandsForTarget({ target, platform }) {
  const npm = npmExecutable(platform);
  const buildArgs = target === "windows" ? ["--no-bundle"] : ["--bundles", "app"];

  return [
    [npm, "run", "check", "-w", "@pixelaid/desktop"],
    [npm, "run", "desktop:build", "-w", "@pixelaid/desktop", "--", ...buildArgs],
  ];
}

function archiveCommandForTarget({ target, stageDir, archivePath }) {
  if (target === "windows") {
    return [
      "powershell.exe",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Compress-Archive -Path '${escapePowerShellSingleQuoted(path.join(stageDir, "*"))}' -DestinationPath '${escapePowerShellSingleQuoted(
        archivePath,
      )}' -Force`,
    ];
  }

  return ["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", stageDir, archivePath];
}

async function runCommand(command, { cwd = repoRoot, env = process.env } = {}) {
  const subprocess = resolveSubprocessCommand(command);
  await new Promise((resolve, reject) => {
    const child = spawn(subprocess.executable, subprocess.args, {
      cwd,
      env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new DesktopPackageError("COMMAND_SIGNAL", `Command "${command.join(" ")}" exited with ${signal}.`));
        return;
      }

      if (code !== 0) {
        reject(new DesktopPackageError("COMMAND_FAILED", `Command "${command.join(" ")}" failed with exit code ${code}.`));
        return;
      }

      resolve();
    });
  });
}

export function resolveSubprocessCommand(command, platform = process.platform) {
  const [executable, ...args] = command;
  if (platform === "win32" && /\.(?:cmd|bat)$/iu.test(executable)) {
    return {
      executable: "cmd.exe",
      args: ["/d", "/c", executable, ...args],
    };
  }

  return { executable, args };
}

async function resolvePackageMetadata(root) {
  const rootPackage = await readJson(path.join(root, "package.json"));
  const tauriConfig = await readJson(path.join(root, "apps", "desktop", "src-tauri", "tauri.conf.json"));
  const cargoToml = await readFile(path.join(root, "apps", "desktop", "src-tauri", "Cargo.toml"), "utf8");

  return {
    version: rootPackage.version,
    productName: tauriConfig.productName ?? "PixelAid",
    cargoPackageName: parseCargoPackageName(cargoToml),
  };
}

function packagePlan({ root, artifactRoot, target, arch, metadata }) {
  const productName = metadata.productName;
  const safeProductName = sanitizeName(productName);
  const suffix = target === "windows" ? "windows" : "macos";
  const kind = target === "windows" ? "portable" : "app";
  const packageName = `${safeProductName}-${metadata.version}-${suffix}-${arch}-${kind}`;
  const stageDir = path.join(artifactRoot, "staging", packageName);
  const archivePath = path.join(artifactRoot, `${packageName}.zip`);

  if (target === "windows") {
    return {
      archivePath,
      packageName,
      sourcePath: path.join(root, "apps", "desktop", "src-tauri", "target", "release", `${metadata.cargoPackageName}.exe`),
      stageDir,
      stagedAppPath: path.join(stageDir, `${productName}.exe`),
    };
  }

  return {
    archivePath,
    packageName,
    sourcePath: path.join(root, "apps", "desktop", "src-tauri", "target", "release", "bundle", "macos", `${productName}.app`),
    stageDir,
    stagedAppPath: path.join(stageDir, `${productName}.app`),
  };
}

async function copyNoticeFiles(root, stageDir) {
  for (const noticeFile of noticeFiles) {
    const sourcePath = path.join(root, noticeFile);
    if (await pathExists(sourcePath)) {
      await cp(sourcePath, path.join(stageDir, noticeFile));
    }
  }
}

async function writePackageReadme({ stageDir, target, productName, version }) {
  const platformLabel = target === "windows" ? "Windows portable app" : "macOS .app bundle";
  const launchLine =
    target === "windows"
      ? `Run ${productName}.exe to launch the app.`
      : `Open ${productName}.app to launch the app.`;
  const readme = [
    `${productName} ${version}`,
    "",
    platformLabel,
    "",
    launchLine,
    "This package is unsigned and intended for local smoke testing or CI artifact review.",
    "",
  ].join("\n");

  await writeFile(path.join(stageDir, "README.txt"), readme, "utf8");
}

async function prepareStageDirectory({ plan, root, target, metadata }) {
  if (!(await pathExists(plan.sourcePath))) {
    throw new DesktopPackageError(
      "SOURCE_ARTIFACT_NOT_FOUND",
      `Expected desktop build output was not found: ${plan.sourcePath}`,
      3,
    );
  }

  await rm(plan.stageDir, { recursive: true, force: true });
  await mkdir(plan.stageDir, { recursive: true });
  await cp(plan.sourcePath, plan.stagedAppPath, { recursive: true });
  await copyNoticeFiles(root, plan.stageDir);
  await writePackageReadme({
    stageDir: plan.stageDir,
    target,
    productName: metadata.productName,
    version: metadata.version,
  });
}

export async function packageDesktopArtifact({
  repoRoot: root = repoRoot,
  artifactRoot = path.join(root, "artifacts", "desktop"),
  target: requestedTarget,
  arch = normalizeArch(process.arch),
  platform = process.platform,
  skipBuild = false,
  runCommand: run = runCommand,
} = {}) {
  const target = resolveDesktopPackageTarget(requestedTarget, platform);
  assertBuildPlatform({ target, platform, skipBuild });
  const metadata = await resolvePackageMetadata(root);
  const normalizedArch = normalizeArch(arch);

  if (!skipBuild) {
    for (const command of buildCommandsForTarget({ target, platform })) {
      await run(command, { cwd: root });
    }
  }

  const plan = packagePlan({
    root,
    artifactRoot,
    target,
    arch: normalizedArch,
    metadata,
  });

  await rm(plan.archivePath, { force: true });
  await prepareStageDirectory({ plan, root, target, metadata });

  const archiveCommand = archiveCommandForTarget({
    target,
    stageDir: plan.stageDir,
    archivePath: plan.archivePath,
  });
  await run(archiveCommand, { cwd: root, archivePath: plan.archivePath });

  return {
    archivePath: plan.archivePath,
    packageName: plan.packageName,
    sourcePath: plan.sourcePath,
    stageDir: plan.stageDir,
    target,
  };
}

function parseArgs(argv) {
  const options = {
    target: undefined,
    skipBuild: false,
    arch: normalizeArch(process.arch),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--skip-build") {
      options.skipBuild = true;
      continue;
    }

    if (arg === "--arch") {
      const value = argv[index + 1];
      if (!value) {
        throw new DesktopPackageError("INVALID_ARGUMENTS", "--arch requires a value.", 2);
      }

      options.arch = normalizeArch(value);
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (!options.target) {
      options.target = arg;
      continue;
    }

    throw new DesktopPackageError("INVALID_ARGUMENTS", `Unexpected argument "${arg}".`, 2);
  }

  return options;
}

function printUsage() {
  console.log("Usage: npm run desktop:package -- [windows|macos] [--skip-build] [--arch x64|arm64]");
  console.log("Examples:");
  console.log("  npm run desktop:package");
  console.log("  npm run desktop:package:windows");
  console.log("  npm run desktop:package:macos");
}

async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      printUsage();
      return;
    }

    const result = await packageDesktopArtifact(options);
    console.log(`Created ${result.target} desktop package:`);
    console.log(result.archivePath);
  } catch (error) {
    if (error instanceof DesktopPackageError) {
      console.error(error.message);
      process.exitCode = error.exitCode;
      return;
    }

    throw error;
  }
}

function isMainModule() {
  const entry = process.argv[1];
  return !!entry && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  await main();
}
