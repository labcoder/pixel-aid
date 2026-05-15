import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export class DesktopEnvError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DesktopEnvError";
    this.code = code;
  }
}

export function parseEnvFile(contents) {
  const values = {};
  const lines = contents.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length).trimStart() : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex === -1) {
      throw new DesktopEnvError("INVALID_ENV_LINE", `Invalid .env entry on line ${index + 1}.`);
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      throw new DesktopEnvError("INVALID_ENV_KEY", `Invalid .env key on line ${index + 1}.`);
    }

    values[key] = parseEnvValue(normalizedLine.slice(separatorIndex + 1).trim());
  }

  return values;
}

function parseEnvValue(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\n/gu, "\n")
      .replace(/\\r/gu, "\r")
      .replace(/\\t/gu, "\t")
      .replace(/\\"/gu, '"')
      .replace(/\\\\/gu, "\\");
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  const commentIndex = value.indexOf(" #");
  return (commentIndex === -1 ? value : value.slice(0, commentIndex)).trim();
}

export async function loadEnvFile(filePath, { required = false } = {}) {
  try {
    const contents = await readFile(filePath, "utf8");
    return {
      filePath,
      loaded: true,
      values: parseEnvFile(contents),
    };
  } catch (error) {
    if (error?.code === "ENOENT" && !required) {
      return {
        filePath,
        loaded: false,
        values: {},
      };
    }

    throw error;
  }
}

export async function loadRepoEnv({ repoRoot, env = process.env, envFile = path.join(repoRoot, ".env") }) {
  const loaded = await loadEnvFile(envFile);
  return {
    env: {
      ...loaded.values,
      ...env,
    },
    envFile: loaded.filePath,
    loaded: loaded.loaded,
  };
}

export function resolveUserPath(value, { homeDir = os.homedir() } = {}) {
  if (value.startsWith("~/")) {
    return path.join(homeDir, value.slice(2));
  }

  if (value === "~") {
    return homeDir;
  }

  if (value.startsWith("$HOME/")) {
    return path.join(homeDir, value.slice("$HOME/".length));
  }

  if (value === "$HOME") {
    return homeDir;
  }

  return value;
}
