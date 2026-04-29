import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { automationError, automationOk, type AutomationResult } from "./result";

export type PlannedOutputFile = {
  path: string;
};

export type PlanOutputFileOptions = {
  overwrite?: boolean | undefined;
};

export async function planOutputFile(filePath: string, options: PlanOutputFileOptions = {}): Promise<AutomationResult<PlannedOutputFile>> {
  const resolved = path.resolve(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });

  if (!options.overwrite) {
    try {
      const existing = await stat(resolved);
      if (existing.isFile()) {
        return automationError("output_exists", `Output file already exists: ${resolved}`, 5, { path: resolved });
      }
    } catch {
      // Missing output is the desired path.
    }
  }

  return automationOk({ path: resolved });
}

export function assertSafeBundlePath(filePath: string): AutomationResult<{ path: string }> {
  const normalized = filePath.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[a-z]:/i.test(normalized) ||
    parts.some((part) => part === ".." || part.length === 0)
  ) {
    return automationError("unsafe_output", `Unsafe bundle-relative output path: ${filePath}`, 5, { path: filePath });
  }

  return automationOk({ path: normalized });
}

export async function writeTextOutput(
  filePath: string,
  contents: string,
  options: PlanOutputFileOptions = {},
): Promise<AutomationResult<PlannedOutputFile>> {
  const planned = await planOutputFile(filePath, options);
  if (!planned.ok) {
    return planned;
  }

  try {
    await writeFile(planned.value.path, contents, "utf8");
    return planned;
  } catch (error) {
    return automationError("write_failed", `Could not write file: ${planned.value.path}`, 3, {
      path: planned.value.path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function writeJsonOutput(
  filePath: string,
  contents: unknown,
  options: PlanOutputFileOptions = {},
): Promise<AutomationResult<PlannedOutputFile>> {
  return writeTextOutput(filePath, `${JSON.stringify(contents, null, 2)}\n`, options);
}

export function relativeToDirectory(baseDir: string, filePath: string): string {
  return path.relative(path.resolve(baseDir), path.resolve(filePath)).replaceAll(path.sep, "/");
}
