import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import {
  automationError,
  exportEngineBundle,
  extractPaletteFile,
  fixSprite,
  fixSpriteSheet,
  inspectImage,
  planOutputFile,
  relativeToDirectory,
  suggestFixSettings,
  type AutomationFileRecord,
  type AutomationResult,
  type ExportEngineBundleRequest,
  type FixSpriteSheetRequest,
  type AutomationFixOptionsInput,
} from "@pixelaid/automation";
import type { AnimationTag, OutlineMode, SheetSliceOptions, SpriteFrame } from "@pixelaid/shared";

export type CliIo = {
  stdout: ((text: string) => void) | string[];
  stderr: ((text: string) => void) | string[];
};

type ParsedFramesFile = {
  frames: SpriteFrame[];
  rowAnimations?: AnimationTag[];
  sheet?: Partial<SheetSliceOptions>;
};

type CliCommandResult = {
  code: number;
  payload: unknown;
  human: string;
};

type EngineExportTarget = ExportEngineBundleRequest["targets"][number];

const engineTargets = new Set<EngineExportTarget>(["godot", "unity", "phaser"]);

export async function runCli(argv: readonly string[], io: CliIo = defaultIo()): Promise<number> {
  const args = [...argv];
  const json = takeBooleanFlag(args, "--json");
  try {
    const result = await runParsedCommand(args);
    emit(io.stdout, json ? `${JSON.stringify(result.payload, null, 2)}\n` : result.human);
    return result.code;
  } catch (error) {
    const failure = error instanceof CliUsageError
      ? automationError("invalid_options", error.message, 2)
      : automationError("unexpected_error", "Unexpected CLI failure.", 1, {
          cause: error instanceof Error ? error.message : String(error),
        });
    const payload = { ok: false, command: args[0] ?? "unknown", error: failure.error };
    emit(json ? io.stdout : io.stderr, json ? `${JSON.stringify(payload, null, 2)}\n` : `${failure.error.message}\n`);
    return failure.error.exitCode;
  }
}

async function runParsedCommand(args: string[]): Promise<CliCommandResult> {
  const command = args.shift();
  if (!command || command === "--help" || command === "-h") {
    return {
      code: command ? 0 : 2,
      payload: { ok: command ? true : false, command: command ?? "help", usage: usageText() },
      human: usageText(),
    };
  }

  switch (command) {
    case "inspect":
      return emitAutomation(command, await inspectImage({ inputPath: readInput(args), options: parseFixOptions(args) }));
    case "suggest":
      return emitAutomation(command, await suggestFixSettings({ inputPath: readInput(args), options: parseFixOptions(args) }));
    case "fix":
      return runFixCommand(command, args);
    case "fix-sheet":
      return runFixSheetCommand(command, args);
    case "palette":
      return runPaletteCommand(command, args);
    case "export":
      return runExportCommand(command, args);
    default:
      throw new CliUsageError(`Unknown command "${command}".`);
  }
}

async function runFixCommand(command: string, args: string[]): Promise<CliCommandResult> {
  const inputPath = readInput(args);
  const outputPath = takeRequiredValue(args, "--out");
  const manifestPath = takeValue(args, "--manifest");
  const overwrite = takeBooleanFlag(args, "--overwrite");
  const options = parseFixOptions(args);
  assertNoExtraArgs(args);
  return emitAutomation(
    command,
    await fixSprite({
      inputPath,
      outputPath,
      ...(manifestPath ? { manifestPath } : {}),
      options,
      overwrite,
    }),
  );
}

async function runFixSheetCommand(command: string, args: string[]): Promise<CliCommandResult> {
  const inputPath = readInput(args);
  const outDir = takeRequiredValue(args, "--out-dir");
  const outputPath = takeValue(args, "--out");
  const manifestPath = takeValue(args, "--manifest");
  const detectSheet = takeBooleanFlag(args, "--detect-sheet");
  const overwrite = takeBooleanFlag(args, "--overwrite");
  const framesPath = takeValue(args, "--frames");
  const parsedFrames = framesPath ? await readFramesFile(framesPath) : undefined;
  const options = {
    ...parseFixOptions(args),
    ...(parsedFrames?.sheet ? { sheet: parsedFrames.sheet } : {}),
  };
  assertNoExtraArgs(args);
  const request: FixSpriteSheetRequest = {
    inputPath,
    outDir,
    ...(outputPath ? { outputPath } : {}),
    ...(manifestPath ? { manifestPath } : {}),
    detectSheet: detectSheet || !parsedFrames,
    ...(parsedFrames ? { frames: parsedFrames.frames } : {}),
    ...(parsedFrames?.rowAnimations ? { rowAnimations: parsedFrames.rowAnimations } : {}),
    options,
    overwrite,
  };
  return emitAutomation(command, await fixSpriteSheet(request));
}

async function runPaletteCommand(command: string, args: string[]): Promise<CliCommandResult> {
  const inputPath = readInput(args);
  const outputPath = takeRequiredValue(args, "--out");
  const maxColors = readNumberFlag(args, "--max-colors", readNumberFlag(args, "--colors", 24));
  const overwrite = takeBooleanFlag(args, "--overwrite");
  assertNoExtraArgs(args);
  return emitAutomation(command, await extractPaletteFile({ inputPath, outputPath, maxColors, overwrite }));
}

async function runExportCommand(command: string, args: string[]): Promise<CliCommandResult> {
  const inputPath = readInput(args);
  const outDir = takeRequiredValue(args, "--out-dir");
  const overwrite = takeBooleanFlag(args, "--overwrite");
  const targets = parseEngineTargets(takeValue(args, "--engine") ?? "godot,unity,phaser");
  const bundle = takeValue(args, "--bundle");
  const options = parseFixOptions(args);
  assertNoExtraArgs(args);
  const request: ExportEngineBundleRequest = { inputPath, outDir, targets, options, overwrite };
  const result = await exportEngineBundle(request);
  if (!result.ok || bundle !== "zip") {
    return emitAutomation(command, result);
  }

  const zipResult = await writeZipBundle(outDir, result.value.files, { overwrite });
  if (!zipResult.ok) {
    return emitAutomation(command, zipResult);
  }

  result.value.files.push(zipResult.value);
  return emitAutomation(command, result);
}

function emitAutomation<T>(command: string, result: AutomationResult<T>): CliCommandResult {
  if (!result.ok) {
    return {
      code: result.error.exitCode,
      payload: { ok: false, command, error: result.error },
      human: `${result.error.message}\n`,
    };
  }

  return {
    code: 0,
    payload: { ok: true, command, result: result.value, warnings: result.warnings },
    human: `${command} complete\n`,
  };
}

function parseFixOptions(args: string[]): AutomationFixOptionsInput {
  const options: AutomationFixOptionsInput = {};
  const assetType = takeValue(args, "--asset-type");
  if (assetType) options.assetType = assetType as NonNullable<AutomationFixOptionsInput["assetType"]>;
  const target = takeValue(args, "--target");
  if (target) options.target = target;
  const colors = readOptionalNumberFlag(args, "--colors") ?? readOptionalNumberFlag(args, "--max-colors");
  if (colors !== undefined) options.maxColors = colors;
  const paletteStrategy = takeValue(args, "--palette-strategy");
  if (paletteStrategy) options.paletteStrategy = paletteStrategy as NonNullable<AutomationFixOptionsInput["paletteStrategy"]>;
  const dither = takeValue(args, "--dither") ?? takeValue(args, "--dithering");
  if (dither) options.paletteDithering = dither as NonNullable<AutomationFixOptionsInput["paletteDithering"]>;
  const downscale = takeValue(args, "--downscale");
  if (downscale) options.downscale = downscale as NonNullable<AutomationFixOptionsInput["downscale"]>;
  const alpha = takeValue(args, "--alpha");
  if (alpha) options.alpha = alpha as NonNullable<AutomationFixOptionsInput["alpha"]>;
  const alphaThreshold = readOptionalNumberFlag(args, "--alpha-threshold");
  if (alphaThreshold !== undefined) options.alphaThreshold = alphaThreshold;
  const outlineMode = takeValue(args, "--outline-mode");
  const outlineSourceColors = takeValue(args, "--outline-source-colors");
  const outlineColor = takeValue(args, "--outline-color");
  if (outlineMode || outlineSourceColors || outlineColor) {
    const cleanup: NonNullable<AutomationFixOptionsInput["cleanup"]> = {};
    if (outlineMode) {
      cleanup.outlineMode = outlineMode as OutlineMode;
    }
    if (outlineSourceColors) {
      cleanup.outlineSourceColors = outlineSourceColors.split(",").map((item) => item.trim());
    }
    if (outlineColor) {
      cleanup.outlineColor = outlineColor;
    }
    options.cleanup = cleanup;
  }

  const gridMode = takeValue(args, "--grid");
  const scale = readOptionalNumberFlag(args, "--scale");
  const scaleX = readOptionalNumberFlag(args, "--scale-x");
  const scaleY = readOptionalNumberFlag(args, "--scale-y");
  const phaseX = readOptionalNumberFlag(args, "--phase-x");
  const phaseY = readOptionalNumberFlag(args, "--phase-y");
  if (gridMode || scale !== undefined || scaleX !== undefined || scaleY !== undefined || phaseX !== undefined || phaseY !== undefined) {
    options.grid = {
      ...(gridMode ? { detect: gridMode as "auto" | "manual" } : {}),
      ...(scale !== undefined ? { scale } : {}),
      ...(scaleX !== undefined ? { scaleX } : {}),
      ...(scaleY !== undefined ? { scaleY } : {}),
      ...(phaseX !== undefined ? { phaseX } : {}),
      ...(phaseY !== undefined ? { phaseY } : {}),
    };
  }

  const frame = takeValue(args, "--frame");
  const rows = readOptionalNumberFlag(args, "--rows");
  const columns = readOptionalNumberFlag(args, "--columns");
  const margin = readOptionalNumberFlag(args, "--margin");
  const spacing = readOptionalNumberFlag(args, "--spacing");
  const extrude = readOptionalNumberFlag(args, "--extrude");
  if (frame || rows !== undefined || columns !== undefined || margin !== undefined || spacing !== undefined || extrude !== undefined) {
    const frameSize = frame ? parseSize(frame, "--frame") : undefined;
    options.sheet = {
      ...(frameSize ? { frameWidth: frameSize.width, frameHeight: frameSize.height } : {}),
      ...(rows !== undefined ? { rows } : {}),
      ...(columns !== undefined ? { columns } : {}),
      ...(margin !== undefined ? { margin } : {}),
      ...(spacing !== undefined ? { spacing } : {}),
      ...(extrude !== undefined ? { extrude } : {}),
    };
  }

  return options;
}

async function writeZipBundle(
  outDir: string,
  files: readonly AutomationFileRecord[],
  options: { overwrite?: boolean | undefined },
): Promise<AutomationResult<AutomationFileRecord>> {
  const zipPath = path.join(outDir, "pixelaid-export.zip");
  const planned = await planOutputFile(zipPath, options);
  if (!planned.ok) return planned;

  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    const relativePath = file.relativePath.replaceAll("\\", "/");
    if (relativePath === "pixelaid-export.zip") {
      continue;
    }
    const bytes = file.kind === "image" ? await readFile(file.path) : strToU8(await readFile(file.path, "utf8"));
    entries[relativePath] = bytes;
  }

  await writeFile(planned.value.path, zipSync(entries, { level: 9 }));
  return {
    ok: true,
    value: {
      kind: "engine",
      path: planned.value.path,
      relativePath: relativeToDirectory(outDir, planned.value.path),
    },
    warnings: [],
  };
}

async function readFramesFile(filePath: string): Promise<ParsedFramesFile> {
  const raw = JSON.parse(await readFile(filePath, "utf8")) as ParsedFramesFile | SpriteFrame[];
  if (Array.isArray(raw)) {
    return { frames: raw };
  }
  if (!Array.isArray(raw.frames)) {
    throw new CliUsageError("--frames file must contain a frame array or { frames } object.");
  }
  return raw;
}

function parseEngineTargets(input: string): EngineExportTarget[] {
  const targets = input.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (targets.length === 0) {
    throw new CliUsageError("--engine must include at least one target.");
  }
  for (const target of targets) {
    if (!engineTargets.has(target as EngineExportTarget)) {
      throw new CliUsageError(`Unsupported engine target "${target}".`);
    }
  }
  return targets as EngineExportTarget[];
}

function readInput(args: string[]): string {
  const input = args.shift();
  if (!input || input.startsWith("--")) {
    throw new CliUsageError("Missing input path.");
  }
  return input;
}

function takeBooleanFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function takeValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new CliUsageError(`Missing value for ${name}.`);
  }
  args.splice(index, 2);
  return value;
}

function takeRequiredValue(args: string[], name: string): string {
  const value = takeValue(args, name);
  if (!value) {
    throw new CliUsageError(`Missing required ${name}.`);
  }
  return value;
}

function readOptionalNumberFlag(args: string[], name: string): number | undefined {
  const value = takeValue(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new CliUsageError(`${name} must be a number.`);
  }
  return parsed;
}

function readNumberFlag(args: string[], name: string, fallback: number): number {
  return readOptionalNumberFlag(args, name) ?? fallback;
}

function parseSize(value: string, flagName: string): { width: number; height: number } {
  const match = /^(\d+)(?:x(\d+))?$/i.exec(value.trim());
  if (!match) {
    throw new CliUsageError(`${flagName} must use WIDTHxHEIGHT.`);
  }
  return {
    width: Number(match[1]),
    height: Number(match[2] ?? match[1]),
  };
}

function assertNoExtraArgs(args: readonly string[]): void {
  if (args.length > 0) {
    throw new CliUsageError(`Unexpected argument "${args[0]}".`);
  }
}

function emit(target: CliIo["stdout"], text: string): void {
  if (Array.isArray(target)) {
    target.push(text);
    return;
  }
  target(text);
}

function defaultIo(): CliIo {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
}

function usageText(): string {
  return [
    "PixelAid automation CLI",
    "",
    "Commands:",
    "  pixelaid inspect <input.png> --json",
    "  pixelaid suggest <input.png> --json",
    "  pixelaid fix <input.png> --out <fixed.png> --manifest <manifest.json>",
    "  pixelaid fix-sheet <input.png> --out-dir <dir> [--detect-sheet | --frames <frames.json>]",
    "  pixelaid palette <input.png> --max-colors <n> --out <palette.hex|palette.json>",
    "  pixelaid export <input.png> --out-dir <dir> --engine godot,unity,phaser --bundle zip",
    "",
    "Palette options:",
    "  --palette-strategy medianCut|perceptual|frequency",
    "  --dither none|ordered|errorDiffusion",
    "",
  ].join("\n");
}

class CliUsageError extends Error {}
