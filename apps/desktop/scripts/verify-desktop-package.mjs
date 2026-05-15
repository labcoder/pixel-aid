import { access, readFile, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

class DesktopPackageVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "DesktopPackageVerificationError";
  }
}

async function findFirstDirectory(root, predicate) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (!entry.isDirectory()) {
      continue;
    }
    if (predicate(entryPath, entry.name)) {
      return entryPath;
    }
    const nested = await findFirstDirectory(entryPath, predicate);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

async function findFirstFile(root, predicate) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isFile() && predicate(entryPath, entry.name)) {
      return entryPath;
    }
    if (entry.isDirectory()) {
      const nested = await findFirstFile(entryPath, predicate);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function parseBundleExecutable(infoPlist) {
  const match = /<key>\s*CFBundleExecutable\s*<\/key>\s*<string>\s*([^<]+?)\s*<\/string>/u.exec(infoPlist);
  if (!match) {
    throw new DesktopPackageVerificationError("CFBundleExecutable was not found in PixelAid.app/Contents/Info.plist.");
  }

  return match[1];
}

function expectedMacosArchitectureToken(expectedArch) {
  if (expectedArch === "arm64") {
    return "arm64";
  }
  if (expectedArch === "x64") {
    return "x86_64";
  }

  throw new DesktopPackageVerificationError(`Unsupported macOS package architecture "${expectedArch}".`);
}

async function assertExecutable(filePath) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("not a file");
    }
    await access(filePath, constants.X_OK);
  } catch {
    throw new DesktopPackageVerificationError(`Expected an executable file: ${filePath}`);
  }
}

function verifyMacosBinaryArchitecture(executablePath, expectedArch, runCommand = spawnSync) {
  if (!expectedArch) {
    return undefined;
  }

  const token = expectedMacosArchitectureToken(expectedArch);
  const result = runCommand("file", [executablePath], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

  if (result.status !== 0) {
    throw new DesktopPackageVerificationError(output || `Could not inspect macOS executable architecture: ${executablePath}`);
  }
  if (!output.includes(token)) {
    throw new DesktopPackageVerificationError(`Expected ${token} macOS executable, got: ${output}`);
  }

  return output;
}

function runQuietVerificationCommand({ command, args, label, runCommand = spawnSync }) {
  const result = runCommand(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new DesktopPackageVerificationError(`${label} failed with exit code ${result.status ?? 1}.`);
  }
}

function verifySignedMacosApp(appPath, runCommand = spawnSync) {
  const checks = [
    {
      command: "codesign",
      args: ["--verify", "--deep", "--strict", "--verbose=2", appPath],
      label: "codesign verification",
    },
    {
      command: "xcrun",
      args: ["stapler", "validate", appPath],
      label: "stapled notarization ticket validation",
    },
    {
      command: "spctl",
      args: ["-a", "-vv", "--type", "execute", appPath],
      label: "Gatekeeper assessment",
    },
  ];

  for (const check of checks) {
    runQuietVerificationCommand({ ...check, runCommand });
  }

  return {
    gatekeeper: true,
    notarized: true,
    signature: true,
  };
}

export async function verifyMacosPackageDirectory({ packageRoot, expectedArch, signed = false, runCommand = spawnSync } = {}) {
  if (!packageRoot) {
    throw new DesktopPackageVerificationError("A macOS package extraction directory is required.");
  }

  const appPath = await findFirstDirectory(packageRoot, (_entryPath, name) => name === "PixelAid.app");
  if (!appPath) {
    throw new DesktopPackageVerificationError(`PixelAid.app was not found in ${packageRoot}.`);
  }

  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
  const executableName = parseBundleExecutable(await readFile(infoPlistPath, "utf8"));
  const executablePath = path.join(appPath, "Contents", "MacOS", executableName);
  await assertExecutable(executablePath);
  const architecture = verifyMacosBinaryArchitecture(executablePath, expectedArch, runCommand);
  const signing = signed ? verifySignedMacosApp(appPath, runCommand) : undefined;

  return {
    appPath,
    architecture,
    executableName,
    executablePath,
    signing,
  };
}

export async function verifyWindowsPackageDirectory({ packageRoot } = {}) {
  if (!packageRoot) {
    throw new DesktopPackageVerificationError("A Windows package extraction directory is required.");
  }

  const executablePath = await findFirstFile(packageRoot, (_entryPath, name) => name === "PixelAid.exe");
  if (!executablePath) {
    throw new DesktopPackageVerificationError(`PixelAid.exe was not found in ${packageRoot}.`);
  }

  const data = await readFile(executablePath);
  const peOffset = data.readUInt32LE(0x3c);
  const subsystem = data.readUInt16LE(peOffset + 0x5c);
  if (subsystem !== 2) {
    throw new DesktopPackageVerificationError(`Expected Windows GUI subsystem 2, got ${subsystem}.`);
  }

  return {
    executablePath,
    subsystem,
  };
}

function parseArgs(argv) {
  const signed = argv.includes("--signed");
  const positional = argv.filter((arg) => arg !== "--signed");
  return {
    expectedArch: positional[2],
    packageRoot: positional[1],
    signed,
    target: positional[0],
  };
}

async function main(argv = process.argv.slice(2)) {
  const { target, packageRoot, expectedArch, signed } = parseArgs(argv);
  if (target === "macos") {
    const result = await verifyMacosPackageDirectory({ packageRoot, expectedArch, signed });
    console.log(`ok macOS app executable: ${result.executablePath}`);
    if (result.architecture) {
      console.log(result.architecture);
    }
    if (result.signing) {
      console.log("ok macOS Developer ID signature, notarization ticket, and Gatekeeper assessment");
    }
    return;
  }

  if (target === "windows") {
    const result = await verifyWindowsPackageDirectory({ packageRoot });
    console.log(`ok Windows app executable: ${result.executablePath}`);
    console.log(`Windows subsystem: ${result.subsystem}`);
    return;
  }

  throw new DesktopPackageVerificationError("Usage: node apps/desktop/scripts/verify-desktop-package.mjs [windows|macos] <extracted-package-dir> [arch] [--signed]");
}

function isMainModule() {
  const entry = process.argv[1];
  return !!entry && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  try {
    await main();
  } catch (error) {
    if (error instanceof DesktopPackageVerificationError) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
