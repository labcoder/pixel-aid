import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { zipSync } from "fflate";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

class Phase8PackageError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = "Phase8PackageError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function parsePhase8PackageArgs(argv = process.argv.slice(2)) {
  const args = [...argv];
  let skipBuild = false;
  for (const arg of args) {
    if (arg === "--skip-build") {
      skipBuild = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new Phase8PackageError("HELP", "Usage: npm run phase8:package -- [--skip-build]", 0);
    }
    throw new Phase8PackageError("INVALID_ARGUMENT", `Invalid argument "${arg}".`, 2);
  }
  return { skipBuild };
}

export function getPhase8BetaKitName(version) {
  return `PixelAid-${version}-phase8-beta-kit`;
}

export async function packagePhase8BetaKit({
  packageRepoRoot = repoRoot,
  skipBuild = false,
  platform = process.platform,
  arch = process.arch,
  runCommand: commandRunner = runCommand
} = {}) {
  const packageJson = JSON.parse(await readFile(path.join(packageRepoRoot, "package.json"), "utf8"));
  const version = packageJson.version;
  const kitName = getPhase8BetaKitName(version);
  const stageDir = path.join(packageRepoRoot, "artifacts/phase8/staging", kitName);
  const archivePath = path.join(packageRepoRoot, "artifacts/phase8", `${kitName}.zip`);

  if (!skipBuild) {
    await commandRunner(["npm", "run", "web:package:standalone"], { cwd: packageRepoRoot, label: "standalone web package" });
    await commandRunner(["npm", "pack", "-w", "pixelaid", "--pack-destination", "artifacts/cli"], { cwd: packageRepoRoot, label: "CLI package" });
    if (platform === "win32") {
      await commandRunner(["npm", "run", "desktop:package:windows"], { cwd: packageRepoRoot, label: "unsigned Windows desktop package" });
    } else if (platform === "darwin") {
      await commandRunner(["npm", "run", "desktop:package:macos"], { cwd: packageRepoRoot, label: "unsigned macOS desktop package" });
    }
  }

  const artifactSources = [
    {
      kind: "web",
      source: path.join(packageRepoRoot, `artifacts/web/PixelAid-${version}-web-standalone.zip`)
    },
    {
      kind: "cli",
      source: path.join(packageRepoRoot, `artifacts/cli/pixelaid-${version}.tgz`)
    },
    ...(platform === "win32"
      ? [{ kind: "desktop-windows-unsigned", source: path.join(packageRepoRoot, `artifacts/desktop/PixelAid-${version}-windows-x64-portable.zip`) }]
      : platform === "darwin"
        ? [{ kind: "desktop-macos-unsigned", source: path.join(packageRepoRoot, `artifacts/desktop/PixelAid-${version}-macos-${normalizeArch(arch)}-app.zip`) }]
        : [])
  ];
  for (const artifact of artifactSources) {
    if (!(await pathExists(artifact.source))) {
      throw new Phase8PackageError("ARTIFACT_NOT_FOUND", `Expected ${artifact.kind} artifact: ${artifact.source}`);
    }
  }

  await rm(stageDir, { recursive: true, force: true });
  await rm(archivePath, { force: true });
  await mkdir(path.join(stageDir, "packages"), { recursive: true });
  for (const artifact of artifactSources) {
    await cp(artifact.source, path.join(stageDir, "packages", path.basename(artifact.source)));
  }

  const documentation = [
    ["docs/phase8-beta.md", "REVIEWER_GUIDE.md"],
    ["docs/research/robust-preview-phase-8-protocol.md", "PROTOCOL.md"],
    ["docs/robust-preview.md", "ROBUST_PREVIEW.md"],
    ["RELEASE_NOTES.md", "RELEASE_NOTES.md"],
    ["LICENSE", "LICENSE"],
    ["NOTICE", "NOTICE"],
    ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"]
  ];
  for (const [source, destination] of documentation) {
    const sourcePath = path.join(packageRepoRoot, source);
    if (await pathExists(sourcePath)) await cp(sourcePath, path.join(stageDir, destination));
  }
  await writeFile(path.join(stageDir, "README.txt"), betaReadme(version, artifactSources), "utf8");

  const contentFiles = await collectFiles(stageDir, new Set(["manifest.json", "SHA256SUMS.txt"]));
  const entries = await Promise.all(contentFiles.map(async (filePath) => fileMetadata(stageDir, filePath)));
  const manifest = {
    kind: "pixelaid-phase8-beta-kit",
    version,
    channel: "internal-opt-in-preview",
    classicDefault: true,
    robustPreviewOptIn: true,
    publicationAuthorized: false,
    desktopSigned: false,
    createdAt: new Date().toISOString(),
    files: entries
  };
  await writeFile(path.join(stageDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const checksumFiles = await collectFiles(stageDir, new Set(["SHA256SUMS.txt"]));
  const checksums = await Promise.all(checksumFiles.map(async (filePath) => fileMetadata(stageDir, filePath)));
  await writeFile(
    path.join(stageDir, "SHA256SUMS.txt"),
    `${checksums.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n")}\n`,
    "utf8"
  );

  const zipEntries = await collectZipEntries(stageDir);
  await mkdir(path.dirname(archivePath), { recursive: true });
  await writeFile(archivePath, zipSync(zipEntries, { level: 9 }));
  return { archivePath, stageDir, manifest };
}

function betaReadme(version, artifacts) {
  return [
    `PixelAid ${version} / Phase 8 internal beta kit`,
    "",
    "Classic remains the default. Robust Preview is opt-in and must not be represented as the stable default.",
    "This kit is for private evaluation only; packaging it does not authorize public publication.",
    "Desktop packages in this kit are unsigned and may trigger operating-system warnings.",
    "",
    "Included packages:",
    ...artifacts.map((artifact) => `- ${artifact.kind}: packages/${path.basename(artifact.source)}`),
    "",
    "Start with REVIEWER_GUIDE.md. The frozen campaign rules are in PROTOCOL.md.",
    "Evidence stays local unless the reviewer explicitly downloads and shares a sanitized JSON record.",
    ""
  ].join("\n");
}

async function fileMetadata(baseDir, filePath) {
  const bytes = await readFile(filePath);
  return {
    path: path.relative(baseDir, filePath).replaceAll("\\", "/"),
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

async function collectFiles(directory, excludedNames = new Set()) {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(fullPath, excludedNames));
    else if (!excludedNames.has(entry.name) && (await stat(fullPath)).isFile()) files.push(fullPath);
  }
  return files;
}

async function collectZipEntries(directory, baseDir = directory) {
  const files = {};
  for (const filePath of await collectFiles(directory)) {
    files[path.relative(baseDir, filePath).replaceAll("\\", "/")] = new Uint8Array(await readFile(filePath));
  }
  return files;
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeArch(value) {
  return value === "x64" || value === "arm64" ? value : value.replace(/[^a-z0-9._-]+/giu, "-");
}

function resolveSubprocessCommand(command, platform = process.platform) {
  return platform === "win32" && command[0] === "npm"
    ? { executable: "cmd.exe", args: ["/d", "/c", ...command] }
    : { executable: command[0], args: command.slice(1) };
}

async function runCommand(command, { cwd = repoRoot, label } = {}) {
  const subprocess = resolveSubprocessCommand(command);
  await new Promise((resolve, reject) => {
    const child = spawn(subprocess.executable, subprocess.args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0
      ? resolve()
      : reject(new Phase8PackageError("COMMAND_FAILED", `${label ?? command.join(" ")} failed with exit code ${code}.`)));
  });
}

async function main() {
  try {
    const result = await packagePhase8BetaKit(parsePhase8PackageArgs());
    console.log(`Created local Phase 8 beta kit: ${result.archivePath}`);
  } catch (error) {
    if (error instanceof Phase8PackageError) {
      if (error.code !== "HELP") console.error(error.message);
      else console.error("Usage: npm run phase8:package -- [--skip-build]");
      process.exitCode = error.exitCode;
      return;
    }
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
