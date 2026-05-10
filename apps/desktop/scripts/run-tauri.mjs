import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildVsDevCommand, resolveWindowsMsvcToolchain } from "./windows-msvc-toolchain.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");

export function resolveLocalTauriCommand({ platform = process.platform, existsSyncImpl = existsSync } = {}) {
  const executable = platform === "win32" ? "tauri.cmd" : "tauri";
  const candidates = [
    path.join(desktopRoot, "node_modules", ".bin", executable),
    path.join(repoRoot, "node_modules", ".bin", executable),
  ];
  return candidates.find((candidate) => existsSyncImpl(candidate)) ?? "tauri";
}

export function runTauri(args, { platform = process.platform, env = process.env, cwd = process.cwd() } = {}) {
  if (args.length === 0) {
    console.error("Usage: node scripts/run-tauri.mjs <dev|build|info> [tauri args...]");
    return 2;
  }

  const tauriCommand = resolveLocalTauriCommand({ platform });
  if (platform !== "win32") {
    const child = spawn(tauriCommand, args, { cwd, env, stdio: "inherit" });
    child.on("exit", (code, signal) => {
      process.exitCode = signal ? 1 : code ?? 1;
    });
    child.on("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    return undefined;
  }

  const toolchain = resolveWindowsMsvcToolchain({ env });
  for (const warning of toolchain.warnings) {
    console.warn(`warning: ${warning}`);
  }
  if (!toolchain.ok) {
    console.error(`missing Windows desktop build prerequisite: ${toolchain.missing.join(", ")}`);
    console.error("Install the Visual Studio C++ build tools, then rerun `npm run desktop:check`.");
    return 1;
  }

  const command = buildVsDevCommand({
    vsDevCmdPath: toolchain.vsDevCmdPath,
    msvcBinPath: toolchain.msvcBinPath,
    tauriCommand,
    tauriArgs: args,
  });
  const child = spawn("cmd.exe", ["/d", "/c", command], {
    cwd,
    env,
    stdio: "inherit",
    windowsVerbatimArguments: true,
  });
  child.on("exit", (code, signal) => {
    process.exitCode = signal ? 1 : code ?? 1;
  });
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

  return undefined;
}

function isMainModule() {
  const entry = process.argv[1];
  return !!entry && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  const exitCode = runTauri(process.argv.slice(2));
  if (typeof exitCode === "number") {
    process.exitCode = exitCode;
  }
}
