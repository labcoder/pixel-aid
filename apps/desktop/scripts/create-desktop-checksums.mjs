/* global console, process */

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultArtifactDir = path.resolve(scriptDir, "..", "src-tauri", "target", "release", "bundle");
const defaultOutputFile = "SHA256SUMS.txt";

export async function createDesktopChecksums({ artifactDir = defaultArtifactDir, outputPath } = {}) {
  const resolvedArtifactDir = path.resolve(artifactDir);
  const resolvedOutputPath = path.resolve(outputPath ?? path.join(resolvedArtifactDir, defaultOutputFile));
  const files = await listArtifactFiles(resolvedArtifactDir);
  const entries = [];

  for (const filePath of files) {
    const bytes = await readFile(filePath);
    entries.push({
      relativePath: normalizePath(path.relative(resolvedArtifactDir, filePath)),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const contents = entries.map((entry) => `${entry.sha256}  ${entry.relativePath}`).join("\n");
  await writeFile(resolvedOutputPath, entries.length > 0 ? `${contents}\n` : "", "utf8");
  return {
    artifactDir: resolvedArtifactDir,
    outputPath: resolvedOutputPath,
    entries,
  };
}

async function listArtifactFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listArtifactFiles(filePath));
      continue;
    }
    if (entry.isFile() && !entry.name.endsWith(".sha256") && entry.name !== defaultOutputFile) {
      files.push(filePath);
    }
  }

  return files;
}

function parseArgs(argv) {
  const args = [...argv];
  const artifactDir = takeValue(args, "--dir") ?? defaultArtifactDir;
  const outputPath = takeValue(args, "--out");
  if (args.length > 0) {
    throw new Error(`Unknown checksum argument "${args[0]}".`);
  }
  return { artifactDir, outputPath };
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

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function isMainModule() {
  const entry = process.argv[1];
  return !!entry && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  try {
    const result = await createDesktopChecksums(parseArgs(process.argv.slice(2)));
    console.log(`wrote ${result.entries.length} checksum(s) to ${result.outputPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
