import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadRepoEnv, resolveUserPath } from "./desktop-env.mjs";

const macosSigningEnvKeys = [
  "APPLE_SIGNING_IDENTITY",
  "APPLE_API_KEY",
  "APPLE_API_ISSUER",
  "APPLE_API_KEY_PATH",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const noticeFiles = ["LICENSE", "NOTICE", "LICENSES.md", "THIRD_PARTY_NOTICES.md"];
const windowsArtifactSigningEndpoints = {
  brs: "https://brs.codesigning.azure.net",
  brazilsouth: "https://brs.codesigning.azure.net",
  centralus: "https://cus.codesigning.azure.net",
  cus: "https://cus.codesigning.azure.net",
  eastus: "https://eus.codesigning.azure.net",
  eus: "https://eus.codesigning.azure.net",
  japaneast: "https://jpe.codesigning.azure.net",
  jpe: "https://jpe.codesigning.azure.net",
  koreacentral: "https://krc.codesigning.azure.net",
  krc: "https://krc.codesigning.azure.net",
  ncus: "https://ncus.codesigning.azure.net",
  northcentralus: "https://ncus.codesigning.azure.net",
  northeurope: "https://neu.codesigning.azure.net",
  neu: "https://neu.codesigning.azure.net",
  plc: "https://plc.codesigning.azure.net",
  polandcentral: "https://plc.codesigning.azure.net",
  scus: "https://scus.codesigning.azure.net",
  southcentralus: "https://scus.codesigning.azure.net",
  switzerlandnorth: "https://swn.codesigning.azure.net",
  swn: "https://swn.codesigning.azure.net",
  usc2: "https://wus2.codesigning.azure.net",
  usw2: "https://wus2.codesigning.azure.net",
  wcus: "https://wcus.codesigning.azure.net",
  westcentralus: "https://wcus.codesigning.azure.net",
  westeurope: "https://weu.codesigning.azure.net",
  westus: "https://wus.codesigning.azure.net",
  westus2: "https://wus2.codesigning.azure.net",
  westus3: "https://wus3.codesigning.azure.net",
  weu: "https://weu.codesigning.azure.net",
  wus: "https://wus.codesigning.azure.net",
  wus2: "https://wus2.codesigning.azure.net",
  wus3: "https://wus3.codesigning.azure.net",
};

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

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeWindowsSigningEndpoint(value) {
  const trimmed = value.trim();
  const normalizedKey = trimmed.toLowerCase().replace(/[^a-z0-9]+/gu, "");
  if (windowsArtifactSigningEndpoints[normalizedKey]) {
    return windowsArtifactSigningEndpoints[normalizedKey];
  }

  return trimmed.replace(/\/+$/u, "");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

export function stripMacosSigningEnv(env = process.env) {
  const stripped = { ...env };
  for (const key of macosSigningEnvKeys) {
    delete stripped[key];
  }
  return stripped;
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

async function runCommand(command, { cwd = repoRoot, env = process.env, label, timeoutMs } = {}) {
  const subprocess = resolveSubprocessCommand(command);
  const displayCommand = label ?? command.join(" ");
  await new Promise((resolve, reject) => {
    const child = spawn(subprocess.executable, subprocess.args, {
      cwd,
      env,
      stdio: "inherit",
    });
    let timedOut = false;
    const timeout = Number.isFinite(timeoutMs)
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, timeoutMs)
      : undefined;

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (timedOut) {
        reject(new DesktopPackageError("COMMAND_TIMEOUT", `Command "${displayCommand}" timed out after ${timeoutMs}ms.`));
        return;
      }
      if (signal) {
        reject(new DesktopPackageError("COMMAND_SIGNAL", `Command "${displayCommand}" exited with ${signal}.`));
        return;
      }

      if (code !== 0) {
        reject(new DesktopPackageError("COMMAND_FAILED", `Command "${displayCommand}" failed with exit code ${code}.`));
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

function packagePlan({ root, artifactRoot, target, arch, metadata, signed }) {
  const productName = metadata.productName;
  const safeProductName = sanitizeName(productName);
  const suffix = target === "windows" ? "windows" : "macos";
  const kind = target === "windows" ? (signed ? "signed-portable" : "portable") : signed ? "signed-app" : "app";
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

async function writePackageReadme({ stageDir, target, productName, version, signed }) {
  const platformLabel = target === "windows" ? "Windows portable app" : "macOS .app bundle";
  const launchLine =
    target === "windows"
      ? `Run ${productName}.exe to launch the app.`
      : `Open ${productName}.app to launch the app.`;
  const signingLine =
    signed && target === "macos"
      ? "This package is Developer ID signed, notarized, and intended for public macOS distribution."
      : signed && target === "windows"
        ? "This package is Authenticode signed and intended for public Windows distribution."
        : "This package is unsigned and intended for local smoke testing or CI artifact review.";
  const readme = [
    `${productName} ${version}`,
    "",
    platformLabel,
    "",
    launchLine,
    signingLine,
    "",
  ].join("\n");

  await writeFile(path.join(stageDir, "README.txt"), readme, "utf8");
}

async function prepareStageDirectory({ plan, root, target, metadata, signed }) {
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
    signed,
  });
}

export function resolveMacosSigningConfig({ env = process.env, homeDir } = {}) {
  const missing = [];
  if (!hasValue(env.APPLE_SIGNING_IDENTITY)) {
    missing.push("APPLE_SIGNING_IDENTITY");
  }

  const hasApiNotarization =
    hasValue(env.APPLE_API_KEY) && hasValue(env.APPLE_API_ISSUER) && hasValue(env.APPLE_API_KEY_PATH);
  if (!hasApiNotarization) {
    missing.push("APPLE_API_KEY + APPLE_API_ISSUER + APPLE_API_KEY_PATH");
  }

  if (missing.length > 0) {
    throw new DesktopPackageError(
      "MACOS_SIGNING_ENV_MISSING",
      `Missing macOS signing configuration: ${missing.join(", ")}. Add the values to .env or export them before running signed packaging.`,
      2,
    );
  }

  if (!isUuid(env.APPLE_API_ISSUER.trim())) {
    throw new DesktopPackageError(
      "MACOS_SIGNING_ENV_INVALID",
      "APPLE_API_ISSUER must be the App Store Connect issuer UUID only. Do not include labels, prefixes, or surrounding text.",
      2,
    );
  }

  return {
    identity: env.APPLE_SIGNING_IDENTITY.trim(),
    notarization: {
      issuer: env.APPLE_API_ISSUER.trim(),
      keyId: env.APPLE_API_KEY.trim(),
      keyPath: resolveUserPath(env.APPLE_API_KEY_PATH.trim(), { homeDir }),
    },
  };
}

export function resolveWindowsSigningConfig({ env = process.env, homeDir } = {}) {
  const missing = [];
  if (!hasValue(env.WINDOWS_SIGNING_ENDPOINT)) {
    missing.push("WINDOWS_SIGNING_ENDPOINT");
  }
  if (!hasValue(env.WINDOWS_SIGNING_ACCOUNT_NAME)) {
    missing.push("WINDOWS_SIGNING_ACCOUNT_NAME");
  }
  if (!hasValue(env.WINDOWS_SIGNING_CERTIFICATE_PROFILE_NAME)) {
    missing.push("WINDOWS_SIGNING_CERTIFICATE_PROFILE_NAME");
  }

  if (missing.length > 0) {
    throw new DesktopPackageError(
      "WINDOWS_SIGNING_ENV_MISSING",
      `Missing Windows signing configuration: ${missing.join(", ")}. Add the values to .env or export them before running signed packaging.`,
      2,
    );
  }

  return {
    accountName: env.WINDOWS_SIGNING_ACCOUNT_NAME.trim(),
    certificateProfileName: env.WINDOWS_SIGNING_CERTIFICATE_PROFILE_NAME.trim(),
    dlibPath: hasValue(env.WINDOWS_SIGNING_DLIB_PATH)
      ? resolveUserPath(env.WINDOWS_SIGNING_DLIB_PATH.trim(), { homeDir })
      : undefined,
    endpoint: normalizeWindowsSigningEndpoint(env.WINDOWS_SIGNING_ENDPOINT),
    excludeCredentials: resolveWindowsSigningExcludedCredentials(env),
    signtoolPath: hasValue(env.WINDOWS_SIGNING_SIGNTOOL_PATH)
      ? resolveUserPath(env.WINDOWS_SIGNING_SIGNTOOL_PATH.trim(), { homeDir })
      : undefined,
  };
}

function resolveWindowsSigningExcludedCredentials(env) {
  if (hasValue(env.WINDOWS_SIGNING_EXCLUDE_CREDENTIALS)) {
    return env.WINDOWS_SIGNING_EXCLUDE_CREDENTIALS.split(",")
      .map((credential) => credential.trim())
      .filter(Boolean);
  }

  if (/^(1|true|yes)$/iu.test(env.WINDOWS_SIGNING_ALLOW_INTERACTIVE_BROWSER ?? "")) {
    return undefined;
  }

  return ["InteractiveBrowserCredential"];
}

function macosNotarizationAuthArgs(config) {
  return [
    "--key",
    config.notarization.keyPath,
    "--key-id",
    config.notarization.keyId,
    "--issuer",
    config.notarization.issuer,
  ];
}

async function collectExistingFiles(candidates) {
  const existing = [];
  for (const candidate of candidates.filter(Boolean)) {
    if (await pathExists(candidate)) {
      existing.push(candidate);
    }
  }
  return existing;
}

async function listDirectories(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

async function findNewestWindowsSignTool(env) {
  const windowsKitsRoot = path.join(env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
  const versionDirs = await listDirectories(windowsKitsRoot);
  const candidates = versionDirs
    .map((dir) => path.join(dir, "x64", "signtool.exe"))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const [candidate] = await collectExistingFiles(candidates);
  return candidate;
}

async function findNewestArtifactSigningDlib({ root, env }) {
  const packageRoots = [
    path.join(root, "artifacts", "tools"),
    path.join(env.USERPROFILE ?? "", ".nuget", "packages"),
  ];
  const candidates = [];

  for (const packageRoot of packageRoots) {
    const vendorDirs = [
      path.join(packageRoot, "microsoft.artifactsigning.client"),
      path.join(packageRoot, "microsoft.trusted.signing.client"),
    ];
    for (const vendorDir of vendorDirs) {
      const versionDirs = await listDirectories(vendorDir);
      candidates.push(
        ...versionDirs
          .map((dir) => path.join(dir, "bin", "x64", "Azure.CodeSigning.Dlib.dll"))
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
      );
    }
  }

  const [candidate] = await collectExistingFiles(candidates);
  return candidate;
}

async function resolveWindowsSigningTools({ config, env, root }) {
  const signtoolPath = config.signtoolPath ?? (await findNewestWindowsSignTool(env));
  const dlibPath = config.dlibPath ?? (await findNewestArtifactSigningDlib({ root, env }));
  const missing = [];

  if (!signtoolPath || !(await pathExists(signtoolPath))) {
    missing.push("signtool.exe");
  }
  if (!dlibPath || !(await pathExists(dlibPath))) {
    missing.push("Azure.CodeSigning.Dlib.dll");
  }
  if (missing.length > 0) {
    throw new DesktopPackageError(
      "WINDOWS_SIGNING_TOOLS_MISSING",
      [
        `Missing Windows signing tool(s): ${missing.join(", ")}.`,
        "Install Windows SDK SignTool 10.0.2261.755 or newer and the Microsoft.ArtifactSigning.Client NuGet package, or set WINDOWS_SIGNING_SIGNTOOL_PATH and WINDOWS_SIGNING_DLIB_PATH.",
      ].join(" "),
      2,
    );
  }

  return { dlibPath, signtoolPath };
}

async function writeWindowsSigningMetadata({ config, metadataPath }) {
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        Endpoint: config.endpoint,
        CodeSigningAccountName: config.accountName,
        CertificateProfileName: config.certificateProfileName,
        ...(config.excludeCredentials?.length ? { ExcludeCredentials: config.excludeCredentials } : {}),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function signWindowsExecutable({ exePath, artifactRoot, env, packageName, productName, root, run }) {
  const signingConfig = resolveWindowsSigningConfig({ env });
  const signingTools = await resolveWindowsSigningTools({ config: signingConfig, env, root });
  const timeoutMs = resolveWindowsSigningTimeoutMs(env);
  const signingDir = path.join(artifactRoot, "signing", packageName);
  const metadataPath = path.join(signingDir, "metadata.json");

  await rm(signingDir, { recursive: true, force: true });
  await writeWindowsSigningMetadata({ config: signingConfig, metadataPath });

  const commands = [
    {
      command: [
        signingTools.signtoolPath,
        "sign",
        "/fd",
        "SHA256",
        "/tr",
        "http://timestamp.acs.microsoft.com",
        "/td",
        "SHA256",
        "/d",
        productName,
        "/dlib",
        signingTools.dlibPath,
        "/dmdf",
        metadataPath,
        exePath,
      ],
      label: "SignTool sign PixelAid.exe",
    },
    {
      command: [signingTools.signtoolPath, "verify", "/pa", exePath],
      label: "SignTool verify PixelAid.exe",
    },
  ];

  for (const { command, label } of commands) {
    await run(command, { cwd: root, env, label, timeoutMs });
  }
}

function resolveWindowsSigningTimeoutMs(env) {
  if (!hasValue(env.WINDOWS_SIGNING_TIMEOUT_MS)) {
    return 300000;
  }

  const timeoutMs = Number.parseInt(env.WINDOWS_SIGNING_TIMEOUT_MS, 10);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300000;
}

async function signAndNotarizeMacosApp({ appPath, artifactRoot, env, packageName, root, run }) {
  const signingConfig = resolveMacosSigningConfig({ env });
  const notarizationDir = path.join(artifactRoot, "notarization", packageName);
  const notarizationArchive = path.join(notarizationDir, `${packageName}-notary.zip`);

  await rm(notarizationDir, { recursive: true, force: true });
  await mkdir(notarizationDir, { recursive: true });

  try {
    const commands = [
      {
        command: [
          "codesign",
          "--force",
          "--deep",
          "--options",
          "runtime",
          "--timestamp",
          "--sign",
          signingConfig.identity,
          appPath,
        ],
        label: "codesign PixelAid.app",
      },
      {
        command: ["codesign", "--verify", "--deep", "--strict", "--verbose=2", appPath],
        label: "codesign verify PixelAid.app",
      },
      {
        command: ["ditto", "-c", "-k", "--keepParent", appPath, notarizationArchive],
        label: "create notarization zip",
      },
      {
        command: [
          "xcrun",
          "notarytool",
          "submit",
          notarizationArchive,
          ...macosNotarizationAuthArgs(signingConfig),
          "--wait",
        ],
        label: "xcrun notarytool submit PixelAid.app",
      },
      {
        command: ["xcrun", "stapler", "staple", appPath],
        label: "xcrun stapler staple PixelAid.app",
      },
      {
        command: ["xcrun", "stapler", "validate", appPath],
        label: "xcrun stapler validate PixelAid.app",
      },
      {
        command: ["spctl", "-a", "--type", "execute", appPath],
        label: "spctl assess PixelAid.app",
      },
    ];

    for (const { command, label } of commands) {
      await run(command, { cwd: root, env, label });
    }
  } finally {
    await rm(notarizationDir, { recursive: true, force: true });
  }
}

export async function packageDesktopArtifact({
  repoRoot: root = repoRoot,
  artifactRoot = path.join(root, "artifacts", "desktop"),
  target: requestedTarget,
  arch = normalizeArch(process.arch),
  platform = process.platform,
  skipBuild = false,
  signed = false,
  env = process.env,
  runCommand: run = runCommand,
} = {}) {
  const target = resolveDesktopPackageTarget(requestedTarget, platform);
  assertBuildPlatform({ target, platform, skipBuild });
  const metadata = await resolvePackageMetadata(root);
  const normalizedArch = normalizeArch(arch);
  const buildEnv = target === "macos" ? stripMacosSigningEnv(env) : env;
  const signingEnv = signed ? (await loadRepoEnv({ repoRoot: root, env })).env : undefined;

  if (!skipBuild) {
    for (const command of buildCommandsForTarget({ target, platform })) {
      await run(command, { cwd: root, env: buildEnv });
    }
  }

  const plan = packagePlan({
    root,
    artifactRoot,
    target,
    arch: normalizedArch,
    metadata,
    signed,
  });

  await rm(plan.archivePath, { force: true });
  await prepareStageDirectory({ plan, root, target, metadata, signed });

  if (signed) {
    if (target === "macos") {
      await signAndNotarizeMacosApp({
        appPath: plan.stagedAppPath,
        artifactRoot,
        env: signingEnv,
        packageName: plan.packageName,
        root,
        run,
      });
    } else if (target === "windows") {
      await signWindowsExecutable({
        exePath: plan.stagedAppPath,
        artifactRoot,
        env: signingEnv,
        packageName: plan.packageName,
        productName: metadata.productName,
        root,
        run,
      });
    }
  }

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
    signed,
    target,
  };
}

export function parseDesktopPackageArgs(argv) {
  const options = {
    target: undefined,
    skipBuild: false,
    arch: normalizeArch(process.arch),
    signed: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--skip-build") {
      options.skipBuild = true;
      continue;
    }

    if (arg === "--signed") {
      options.signed = true;
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
  console.log("Usage: npm run desktop:package -- [windows|macos] [--skip-build] [--signed] [--arch x64|arm64]");
  console.log("Examples:");
  console.log("  npm run desktop:package");
  console.log("  npm run desktop:package:windows");
  console.log("  npm run desktop:package:windows:signed");
  console.log("  npm run desktop:package:macos");
  console.log("  npm run desktop:package:macos:signed");
}

async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseDesktopPackageArgs(argv);
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
