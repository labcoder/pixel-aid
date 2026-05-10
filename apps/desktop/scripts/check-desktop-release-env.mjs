import { pathToFileURL } from "node:url";

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

function parseArgs(argv) {
  const args = [...argv];
  const platform = takeValue(args, "--platform") ?? process.platform;
  const allowUnsigned = takeBoolean(args, "--allow-unsigned");
  if (args.length > 0) {
    throw new Error(`Unknown release check argument "${args[0]}".`);
  }
  return { platform, allowUnsigned };
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
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  args.splice(index, 2);
  return value;
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

function isMainModule() {
  const entry = process.argv[1];
  return !!entry && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const results = platformList(options.platform).map((platform) =>
      evaluateDesktopReleaseEnv({ platform, env: process.env, allowUnsigned: options.allowUnsigned })
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
