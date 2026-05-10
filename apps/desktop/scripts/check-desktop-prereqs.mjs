import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolveWindowsMsvcToolchain } from "./windows-msvc-toolchain.mjs";

const checks = [
  { command: "node", args: ["--version"], label: "Node.js" },
  { command: "npm", args: ["--version"], label: "npm" },
  { command: "rustc", args: ["--version"], label: "Rust compiler" },
  { command: "cargo", args: ["--version"], label: "Cargo" }
];

export function evaluateDesktopPrereqs({
  platform = process.platform,
  env = process.env,
  runCommand = runVersionCheck,
  resolveToolchain = resolveWindowsMsvcToolchain,
} = {}) {
  const commandResults = checks.map((check) => {
    const result = runCommand(check);
    return {
      ...check,
      ok: result.ok,
      version: result.version,
    };
  });
  const missing = commandResults.filter((result) => !result.ok).map((result) => result.label);
  const warnings = [];
  let toolchain;

  if (platform === "win32") {
    toolchain = resolveToolchain({ env });
    if (!toolchain.ok) {
      missing.push(...toolchain.missing);
    }
    warnings.push(...toolchain.warnings);
  }

  return {
    ok: missing.length === 0,
    commandResults,
    missing,
    warnings,
    toolchain,
  };
}

function runVersionCheck(check) {
  const result = spawnSync(check.command, check.args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    version: result.stdout.trim() || result.stderr.trim(),
  };
}

function printResult(result) {
  for (const commandResult of result.commandResults) {
    if (commandResult.ok) {
      console.log(`ok ${commandResult.label}: ${commandResult.version}`);
    } else {
      console.error(`missing ${commandResult.label}`);
    }
  }

  if (result.toolchain?.ok) {
    console.log(`ok Visual Studio C++ toolchain: ${result.toolchain.msvcLinkPath}`);
  }
  for (const warning of result.warnings) {
    console.warn(`warning ${warning}`);
  }

  if (!result.ok) {
    console.error("");
    console.error("Desktop packaging requires Node.js, npm, Rust, Cargo, and the Visual Studio C++ x64 build tools on Windows.");
    console.error("Install Rust with rustup before running `npm run desktop:build`:");
    console.error("https://rustup.rs/");
    console.error("Install or modify Visual Studio Build Tools with the Desktop development with C++ workload:");
    console.error("https://visualstudio.microsoft.com/visual-cpp-build-tools/");
    console.error(`missing: ${result.missing.join(", ")}`);
    return;
  }

  console.log("release signing: run `npm run release:check -w @pixelaid/desktop` before producing public desktop artifacts.");
}

function isMainModule() {
  const entry = process.argv[1];
  return !!entry && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  const result = evaluateDesktopPrereqs();
  printResult(result);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
