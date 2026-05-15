import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepoEnv } from "./desktop-env.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..");

const platformLabels = {
  win32: "Windows",
  darwin: "macOS",
  linux: "Linux",
};

export function evaluateDesktopReleaseEnv({ platform, env = process.env, allowUnsigned = false }) {
  const missing = [];
  const warnings = [];

  if (allowUnsigned) {
    warnings.push("unsigned desktop release checks are allowed for local dry runs only.");
    return { ok: true, platform, missing, warnings };
  }

  if (platform === "win32") {
    const hasSigningCommand = hasValue(env.WINDOWS_SIGNING_COMMAND);
    const hasCertificate = hasValue(env.WINDOWS_SIGNING_CERT_PATH);
    if (!hasSigningCommand && !hasCertificate) {
      missing.push("WINDOWS_SIGNING_CERT_PATH or WINDOWS_SIGNING_COMMAND");
    }
    if (hasCertificate && !hasValue(env.WINDOWS_SIGNING_CERT_PASSWORD)) {
      missing.push("WINDOWS_SIGNING_CERT_PASSWORD");
    }
  } else if (platform === "darwin") {
    if (!hasValue(env.APPLE_SIGNING_IDENTITY)) {
      missing.push("APPLE_SIGNING_IDENTITY");
    }
    const hasApiNotarization = hasValue(env.APPLE_API_KEY) && hasValue(env.APPLE_API_ISSUER) && hasValue(env.APPLE_API_KEY_PATH);
    const hasAppleIdNotarization = hasValue(env.APPLE_ID) && hasValue(env.APPLE_PASSWORD) && hasValue(env.APPLE_TEAM_ID);
    if (!hasApiNotarization && !hasAppleIdNotarization) {
      missing.push("APPLE_API_KEY + APPLE_API_ISSUER + APPLE_API_KEY_PATH or APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID");
    }
    if (hasApiNotarization && !isUuid(env.APPLE_API_ISSUER.trim())) {
      missing.push("APPLE_API_ISSUER must be a UUID-only App Store Connect issuer ID");
    }
  } else if (platform === "linux") {
    warnings.push("Linux desktop artifacts are unsigned; publish checksums and package-manager metadata with each release.");
  } else {
    missing.push(`Unsupported release platform "${platform}"`);
  }

  return {
    ok: missing.length === 0,
    platform,
    missing,
    warnings,
  };
}

export function parseDesktopReleaseCheckArgs(argv) {
  const args = [...argv];
  const platform = takeValue(args, "--platform") ?? process.platform;
  const allowUnsigned = takeBoolean(args, "--allow-unsigned");
  const envFile = takeValue(args, "--env-file");
  const noEnvFile = takeBoolean(args, "--no-env-file");
  if (args.length > 0) {
    throw new Error(`Unknown release check argument "${args[0]}".`);
  }
  if (envFile && noEnvFile) {
    throw new Error("Use either --env-file or --no-env-file, not both.");
  }
  return { platform, allowUnsigned, envFile, noEnvFile };
}

function platformList(platform) {
  return platform === "all" ? ["win32", "darwin", "linux"] : [platform];
}

function printResult(result) {
  const label = platformLabels[result.platform] ?? result.platform;
  if (result.ok) {
    console.log(`ok ${label} release signing configuration`);
  } else {
    console.error(`missing ${label} release signing configuration: ${result.missing.join(", ")}`);
  }
  for (const warning of result.warnings) {
    console.warn(`warning ${label}: ${warning}`);
  }
}

function takeValue(args, flag) {
  let value;
  while (true) {
    const index = args.indexOf(flag);
    if (index === -1) {
      return value;
    }

    value = args[index + 1];
    if (!value) {
      throw new Error(`${flag} requires a value.`);
    }
    args.splice(index, 2);
  }
}

function takeBoolean(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function isMainModule() {
  const entry = process.argv[1];
  return !!entry && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  try {
    const options = parseDesktopReleaseCheckArgs(process.argv.slice(2));
    const envResult = options.noEnvFile
      ? { env: process.env }
      : await loadRepoEnv({
          repoRoot,
          env: process.env,
          envFile: options.envFile ? path.resolve(options.envFile) : undefined,
        });
    const results = platformList(options.platform).map((platform) =>
      evaluateDesktopReleaseEnv({ platform, env: envResult.env, allowUnsigned: options.allowUnsigned })
    );
    for (const result of results) {
      printResult(result);
    }
    if (results.some((result) => !result.ok)) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
