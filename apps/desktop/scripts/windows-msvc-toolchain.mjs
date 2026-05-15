import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function resolveWindowsMsvcToolchain({
  env = process.env,
  existsSyncImpl = existsSync,
  readdirSyncImpl = readdirSync,
  spawnSyncImpl = spawnSync,
} = {}) {
  const vsWherePath = findVsWherePath({ env, existsSyncImpl });
  const installationPath = vsWherePath
    ? findVisualStudioInstallation({ vsWherePath, spawnSyncImpl })
    : undefined;
  const vsDevCmdPath = installationPath ? findVsDevCmdPath(installationPath, { existsSyncImpl }) : undefined;
  const msvcBinPath = installationPath
    ? findLatestMsvcBinPath(installationPath, { existsSyncImpl, readdirSyncImpl })
    : undefined;
  const msvcLinkPath = msvcBinPath ? path.win32.join(msvcBinPath, "link.exe") : undefined;
  const linkPath = findCommandOnPath("link.exe", { env, existsSyncImpl, platform: "win32" });
  const linkCollision = isGitBashLinkPath(linkPath);
  const missing = [];
  const warnings = [];

  if (!vsWherePath) {
    missing.push("Visual Studio Installer vswhere.exe");
  }
  if (vsWherePath && !installationPath) {
    missing.push("Visual Studio C++ x64 build tools");
  }
  if (installationPath && !vsDevCmdPath) {
    missing.push("VsDevCmd.bat");
  }
  if (installationPath && !msvcBinPath) {
    missing.push("MSVC x64 linker bin directory");
  }
  if (linkCollision) {
    warnings.push(
      `Git Bash resolves link.exe to ${linkPath}. PixelAid desktop npm scripts will prepend the MSVC linker path before running Tauri.`
    );
  }

  return {
    ok: missing.length === 0,
    vsWherePath,
    installationPath,
    vsDevCmdPath,
    msvcBinPath,
    msvcLinkPath,
    linkPath,
    linkCollision,
    missing,
    warnings,
  };
}

export function findVsWherePath({ env = process.env, existsSyncImpl = existsSync } = {}) {
  const roots = [env["ProgramFiles(x86)"], env.ProgramFiles].filter(Boolean);
  for (const root of roots) {
    const candidate = path.win32.join(root, "Microsoft Visual Studio", "Installer", "vswhere.exe");
    if (existsSyncImpl(candidate)) {
      return candidate;
    }
  }
  return findCommandOnPath("vswhere.exe", { env, existsSyncImpl, platform: "win32" });
}

export function findVisualStudioInstallation({ vsWherePath, spawnSyncImpl = spawnSync }) {
  const result = spawnSyncImpl(
    vsWherePath,
    [
      "-latest",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property",
      "installationPath",
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    return undefined;
  }

  const installationPath = result.stdout.trim().split(/\r?\n/u)[0]?.trim();
  return installationPath?.length ? installationPath : undefined;
}

export function findVsDevCmdPath(installationPath, { existsSyncImpl = existsSync } = {}) {
  const candidate = path.win32.join(installationPath, "Common7", "Tools", "VsDevCmd.bat");
  return existsSyncImpl(candidate) ? candidate : undefined;
}

export function findLatestMsvcBinPath(
  installationPath,
  { existsSyncImpl = existsSync, readdirSyncImpl = readdirSync } = {}
) {
  const toolsRoot = path.win32.join(installationPath, "VC", "Tools", "MSVC");
  if (!existsSyncImpl(toolsRoot)) {
    return undefined;
  }

  const versions = readdirSyncImpl(toolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareVersionStrings)
    .reverse();

  for (const version of versions) {
    const binPath = path.win32.join(toolsRoot, version, "bin", "Hostx64", "x64");
    if (existsSyncImpl(path.win32.join(binPath, "link.exe"))) {
      return binPath;
    }
  }

  return undefined;
}

export function findCommandOnPath(command, { env = process.env, existsSyncImpl = existsSync, platform = process.platform } = {}) {
  const pathValue = getPathValue(env);
  if (!pathValue) {
    return undefined;
  }

  const pathApi = platform === "win32" ? path.win32 : path;
  const extensions = platform === "win32" && pathApi.extname(command) === ""
    ? getPathExtensions(env)
    : [""];

  for (const directory of splitPathValue(pathValue, platform)) {
    if (!directory) {
      continue;
    }
    for (const extension of extensions) {
      const candidate = pathApi.join(directory, `${command}${extension}`);
      if (existsSyncImpl(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

export function isGitBashLinkPath(filePath) {
  if (!filePath) {
    return false;
  }
  const normalized = filePath.replace(/\\/gu, "/").toLowerCase();
  return normalized.endsWith("/git/usr/bin/link.exe") || normalized.endsWith("/git/bin/link.exe");
}

export function buildVsDevCommand({ vsDevCmdPath, msvcBinPath, tauriCommand, tauriArgs }) {
  const tauriInvocation = isCmdScript(tauriCommand)
    ? `call ${quoteCmdArg(tauriCommand)}`
    : quoteCmdArg(tauriCommand);
  const quotedArgs = tauriArgs.map(quoteCmdArg).join(" ");

  return [
    `call ${quoteCmdArg(vsDevCmdPath)} -arch=x64 -host_arch=x64 -no_logo`,
    `set "PATH=${msvcBinPath};%PATH%"`,
    `${tauriInvocation}${quotedArgs.length ? ` ${quotedArgs}` : ""}`,
  ].join(" && ");
}

export function quoteCmdArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=+-]+$/u.test(text)) {
    return text;
  }
  return `"${text.replace(/(["^&|<>])/gu, "^$1")}"`;
}

function getPathValue(env) {
  return env.Path ?? env.PATH ?? env.path;
}

function getPathExtensions(env) {
  return (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);
}

function splitPathValue(pathValue, platform) {
  if (platform === "win32" || pathValue.includes(";")) {
    return pathValue.split(";");
  }
  return pathValue.split(":");
}

function compareVersionStrings(left, right) {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = Number.isNaN(leftParts[index]) ? 0 : leftParts[index] ?? 0;
    const rightPart = Number.isNaN(rightParts[index]) ? 0 : rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return left.localeCompare(right);
}

function isCmdScript(filePath) {
  return /\.(?:cmd|bat)$/iu.test(filePath);
}
