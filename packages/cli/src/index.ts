import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { strToU8, zipSync } from "fflate";
import {
  automationError,
  createRobustEvidenceDryRun,
  createDiagnosticReport,
  createQualityReport,
  exportEngineBundle,
  extractPaletteFile,
  fixSprite,
  fixSpriteSheet,
  inspectImage,
  planOutputFile,
  relativeToDirectory,
  suggestFixSettings,
  writeJsonOutput,
  type AutomationFileRecord,
  type AutomationProgressEvent,
  type AutomationResult,
  type AutomationRuntimeOptions,
  type ExportEngineBundleRequest,
  type FixSpriteSheetRequest,
  type AutomationFixOptionsInput,
} from "@pixelaid/automation";
import type { AnimationTag, LineCleanupStrength, OutlineMode, PixelFixResult, RobustEvidenceSharingPermission, SheetSliceOptions, SpriteFrame } from "@pixelaid/shared";

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
  diagnostics?: CliDiagnosticMetadata;
};

type CliContext = {
  io: CliIo;
  progressJson: boolean;
};

type BatchItemStatus = "succeeded" | "failed" | "skipped";

type BatchItemResult = {
  inputPath: string;
  outputPath: string;
  manifestPath: string;
  status: BatchItemStatus;
  files: AutomationFileRecord[];
  warnings: string[];
  durationMs: number;
  error?: {
    code: string;
    message: string;
    exitCode: number;
  };
};

type BatchResult = {
  items: BatchItemResult[];
  summary: {
    inputCount: number;
    successCount: number;
    failureCount: number;
    skippedCount: number;
    dryRun: boolean;
    continueOnError: boolean;
    outDir: string;
  };
};

type EngineExportTarget = ExportEngineBundleRequest["targets"][number];

type CliDiagnosticMetadata = {
  operation?: string;
  options?: unknown;
  paths?: unknown;
  metadata?: Record<string, unknown>;
  warnings?: string[];
};

const engineTargets = new Set<EngineExportTarget>(["godot", "unity", "phaser", "texturepacker", "tiled", "ldtk"]);
const cliApp = { name: "PixelAid", version: "0.1.0", packageName: "pixelaid" };
const supportedBatchImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const evidenceSharingPermissions = new Set<RobustEvidenceSharingPermission>(["public", "private-debug", "metrics-only", "none"]);

export async function runCli(argv: readonly string[], io: CliIo = defaultIo()): Promise<number> {
  const args = [...argv];
  let json = false;
  let diagnosticsPath: string | undefined;
  let diagnosticArgv = [...args];
  let attemptedCommand: string | undefined;
  try {
    diagnosticsPath = takeValue(args, "--diagnostics");
    diagnosticArgv = [...args];
    json = takeBooleanFlag(args, "--json");
    const progressJson = takeBooleanFlag(args, "--progress-json");
    attemptedCommand = commandFromArgv(args);
    const context: CliContext = { io, progressJson };
    const result = await runParsedCommand(args, context);
    await writeCliDiagnostics(diagnosticsPath, result, diagnosticArgv, io);
    emit(io.stdout, json ? `${JSON.stringify(result.payload, null, 2)}\n` : result.human);
    return result.code;
  } catch (error) {
    const failure = error instanceof CliUsageError
      ? automationError("invalid_options", error.message, 2)
      : automationError("unexpected_error", "Unexpected CLI failure.", 1, {
          cause: error instanceof Error ? error.message : String(error),
        });
    const command = attemptedCommand ?? commandFromArgv(diagnosticArgv) ?? "unknown";
    const payload = { ok: false, command, error: failure.error };
    await writeCliDiagnostics(diagnosticsPath, {
      code: failure.error.exitCode,
      payload,
      human: `${failure.error.message}\n`,
      diagnostics: { metadata: { argv: diagnosticArgv } },
    }, diagnosticArgv, io);
    emit(json ? io.stdout : io.stderr, json ? `${JSON.stringify(payload, null, 2)}\n` : `${failure.error.message}\n`);
    return failure.error.exitCode;
  }
}

async function runParsedCommand(args: string[], context: CliContext): Promise<CliCommandResult> {
  const command = args.shift();
  if (!command || command === "--help" || command === "-h") {
    return {
      code: command ? 0 : 2,
      payload: { ok: command ? true : false, command: command ?? "help", usage: usageText() },
      human: usageText(),
      diagnostics: { operation: "help" },
    };
  }

  switch (command) {
    case "inspect":
      return runInspectCommand(command, args, context);
    case "suggest":
      return runSuggestCommand(command, args, context);
    case "report":
      return runReportCommand(command, args, context);
    case "compare-robust":
      return runCompareRobustCommand(command, args, context);
    case "fix":
      return runFixCommand(command, args, context);
    case "fix-sheet":
      return runFixSheetCommand(command, args, context);
    case "palette":
      return runPaletteCommand(command, args, context);
    case "export":
      return runExportCommand(command, args, context);
    case "batch":
      return runBatchCommand(command, args, context);
    default:
      throw new CliUsageError(`Unknown command "${command}".`);
  }
}

async function runInspectCommand(command: string, args: string[], context: CliContext): Promise<CliCommandResult> {
  const inputPath = readInput(args);
  const options = parseFixOptions(args);
  assertNoExtraArgs(args);
  return emitAutomation(
    command,
    await inspectImage({ inputPath, options }, createCliRuntime(command, context, { inputPath })),
    { operation: "inspect_image", options, paths: { inputPath } },
  );
}

async function runSuggestCommand(command: string, args: string[], context: CliContext): Promise<CliCommandResult> {
  const inputPath = readInput(args);
  const options = parseFixOptions(args);
  assertNoExtraArgs(args);
  return emitAutomation(
    command,
    await suggestFixSettings({ inputPath, options }, createCliRuntime(command, context, { inputPath })),
    { operation: "suggest_fix_settings", options, paths: { inputPath } },
  );
}

async function runReportCommand(command: string, args: string[], context: CliContext): Promise<CliCommandResult> {
  const options = parseFixOptions(args);
  const inputPaths = readInputs(args);
  assertNoExtraArgs(args);
  return emitAutomation(
    command,
    await createQualityReport({ inputPaths, options }, createCliRuntime(command, context)),
    { operation: "quality_report", options, paths: { inputPaths } },
  );
}

async function runFixCommand(command: string, args: string[], context: CliContext): Promise<CliCommandResult> {
  const inputPath = readInput(args);
  const outputPath = takeRequiredValue(args, "--out");
  const manifestPath = takeValue(args, "--manifest");
  takeBooleanFlag(args, "--auto");
  takeBooleanFlag(args, "--auto-suggest");
  const autoSuggest = !takeBooleanFlag(args, "--no-auto");
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
      autoSuggest,
      overwrite,
    }, createCliRuntime(command, context, { inputPath, outputPath })),
    { operation: "fix_sprite", options: { ...options, autoSuggest, overwrite }, paths: { inputPath, outputPath, ...(manifestPath ? { manifestPath } : {}) } },
  );
}

async function runFixSheetCommand(command: string, args: string[], context: CliContext): Promise<CliCommandResult> {
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
  return emitAutomation(
    command,
    await fixSpriteSheet(request, createCliRuntime(command, context, { inputPath, outputPath: outputPath ?? outDir })),
    {
      operation: "fix_sprite_sheet",
      options: { ...options, detectSheet: request.detectSheet, overwrite },
      paths: { inputPath, outDir, ...(outputPath ? { outputPath } : {}), ...(manifestPath ? { manifestPath } : {}), ...(framesPath ? { framesPath } : {}) },
    },
  );
}

async function runPaletteCommand(command: string, args: string[], context: CliContext): Promise<CliCommandResult> {
  const inputPath = readInput(args);
  const outputPath = takeRequiredValue(args, "--out");
  const maxColors = readOptionalMaxColorsFlag(args, "--max-colors") ?? readOptionalMaxColorsFlag(args, "--colors") ?? 24;
  const colorSpace = takeValue(args, "--color-space");
  const quantizer = takeValue(args, "--quantizer");
  const paletteStrategy = takeValue(args, "--palette-strategy");
  const seed = readOptionalNumberFlag(args, "--seed");
  const paletteWeighting = takeValue(args, "--palette-weighting");
  const minRegion = readOptionalNumberFlag(args, "--min-region");
  const protectColors = takeValue(args, "--protect-colors");
  const overwrite = takeBooleanFlag(args, "--overwrite");
  assertNoExtraArgs(args);
  const request = {
    inputPath,
    outputPath,
    maxColors,
    ...(paletteStrategy ? { paletteStrategy: paletteStrategy as NonNullable<AutomationFixOptionsInput["paletteStrategy"]> } : {}),
    ...(quantizer ? { quantizer: normalizeQuantizerFlag(quantizer) as NonNullable<AutomationFixOptionsInput["quantizer"]> } : {}),
    ...(colorSpace ? { colorSpace: colorSpace as NonNullable<AutomationFixOptionsInput["colorSpace"]> } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(paletteWeighting ? { paletteWeighting: paletteWeighting as NonNullable<AutomationFixOptionsInput["paletteWeighting"]> } : {}),
    ...(minRegion !== undefined ? { minRegion } : {}),
    ...(protectColors ? { protectColors } : {}),
    overwrite,
  };
  return emitAutomation(
    command,
    await extractPaletteFile(request, createCliRuntime(command, context, { inputPath, outputPath })),
    { operation: "extract_palette", options: request, paths: { inputPath, outputPath } },
  );
}

async function runExportCommand(command: string, args: string[], context: CliContext): Promise<CliCommandResult> {
  const inputPath = readInput(args);
  const outDir = takeRequiredValue(args, "--out-dir");
  const overwrite = takeBooleanFlag(args, "--overwrite");
  const targets = parseEngineTargets(takeValue(args, "--engine") ?? "godot,unity,phaser");
  const bundle = takeValue(args, "--bundle");
  const options = parseFixOptions(args);
  assertNoExtraArgs(args);
  const request: ExportEngineBundleRequest = { inputPath, outDir, targets, options, overwrite };
  const result = await exportEngineBundle(request, createCliRuntime(command, context, { inputPath, outputPath: outDir }));
  if (!result.ok || bundle !== "zip") {
    return emitAutomation(
      command,
      result,
      { operation: "export_engine_bundle", options: { ...options, targets, overwrite, ...(bundle ? { bundle } : {}) }, paths: { inputPath, outDir } },
    );
  }

  const zipResult = await writeZipBundle(outDir, result.value.files, { overwrite });
  if (!zipResult.ok) {
    return emitAutomation(
      command,
      zipResult,
      { operation: "export_engine_bundle", options: { ...options, targets, overwrite, bundle }, paths: { inputPath, outDir } },
    );
  }

  result.value.files.push(zipResult.value);
  return emitAutomation(
    command,
    result,
    { operation: "export_engine_bundle", options: { ...options, targets, overwrite, bundle }, paths: { inputPath, outDir } },
  );
}

async function runBatchCommand(command: string, args: string[], context: CliContext): Promise<CliCommandResult> {
  const outDir = takeRequiredValue(args, "--out-dir");
  const dryRun = takeBooleanFlag(args, "--dry-run");
  const continueOnError = takeBooleanFlag(args, "--continue-on-error");
  const overwrite = takeBooleanFlag(args, "--overwrite");
  const recursive = takeBooleanFlag(args, "--recursive");
  takeBooleanFlag(args, "--auto");
  takeBooleanFlag(args, "--auto-suggest");
  const autoSuggest = !takeBooleanFlag(args, "--no-auto");
  const options = parseFixOptions(args);
  const inputPatterns = readInputs(args);
  assertNoExtraArgs(args);

  const inputPaths = await expandBatchInputs(inputPatterns, { recursive });
  const usedOutputs = new Set<string>();
  const items: BatchItemResult[] = [];

  for (let index = 0; index < inputPaths.length; index += 1) {
    const inputPath = inputPaths[index]!;
    const { outputPath, manifestPath } = createBatchOutputPaths(outDir, inputPath, usedOutputs);
    const startedAt = performance.now();

    if (dryRun) {
      items.push({
        inputPath,
        outputPath,
        manifestPath,
        status: "skipped",
        files: [],
        warnings: [],
        durationMs: 0,
      });
      continue;
    }

    const result = await fixSprite({
      inputPath,
      outputPath,
      manifestPath,
      options,
      autoSuggest,
      overwrite,
    }, createCliRuntime(command, context, {
      inputPath,
      outputPath,
      jobId: `batch-${index + 1}`,
    }));
    const durationMs = Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100);

    if (result.ok) {
      items.push({
        inputPath,
        outputPath,
        manifestPath,
        status: "succeeded",
        files: result.value.files,
        warnings: result.warnings,
        durationMs,
      });
      continue;
    }

    items.push({
      inputPath,
      outputPath,
      manifestPath,
      status: "failed",
      files: [],
      warnings: [],
      durationMs,
      error: result.error,
    });

    if (!continueOnError) {
      break;
    }
  }

  const batch = createBatchResult(items, inputPaths.length, outDir, dryRun, continueOnError);
  const failed = batch.summary.failureCount > 0;
  return {
    code: failed ? 1 : 0,
    payload: {
      ok: !failed,
      command,
      result: batch,
      ...(failed ? { error: { code: "processing_failed", message: "One or more batch items failed.", exitCode: 1 } } : {}),
    },
    human: [
      `batch ${failed ? "completed with failures" : "complete"}`,
      `${batch.summary.successCount} succeeded, ${batch.summary.failureCount} failed, ${batch.summary.skippedCount} skipped`,
      "",
    ].join("\n"),
    diagnostics: {
      operation: "batch_fix_sprite",
      options: { ...options, autoSuggest, dryRun, continueOnError, overwrite, recursive },
      paths: { inputPatterns, inputPaths, outDir },
      warnings: items.flatMap((item) => item.warnings),
    },
  };
}

function emitAutomation<T>(
  command: string,
  result: AutomationResult<T>,
  diagnostics: CliDiagnosticMetadata = {},
): CliCommandResult {
  if (!result.ok) {
    return {
      code: result.error.exitCode,
      payload: { ok: false, command, error: result.error },
      human: `${result.error.message}\n`,
      diagnostics,
    };
  }

  return {
    code: 0,
    payload: { ok: true, command, result: sanitizeAutomationValue(result.value), warnings: result.warnings },
    human: formatAutomationHuman(command, result.warnings),
    diagnostics: { ...diagnostics, warnings: result.warnings },
  };
}

async function runCompareRobustCommand(command: string, args: string[], context: CliContext): Promise<CliCommandResult> {
  const inputPath = readInput(args);
  const outDir = takeRequiredValue(args, "--out-dir");
  const collectionId = takeRequiredValue(args, "--collection-id");
  const participantId = takeValue(args, "--participant-id");
  const assignmentIndex = readOptionalNumberFlag(args, "--assignment-index");
  const sharingValue = takeValue(args, "--sharing") ?? "none";
  if (!evidenceSharingPermissions.has(sharingValue as RobustEvidenceSharingPermission)) {
    throw new CliUsageError("--sharing must be public, private-debug, metrics-only, or none.");
  }
  if (assignmentIndex !== undefined && (!Number.isSafeInteger(assignmentIndex) || assignmentIndex < 0)) {
    throw new CliUsageError("--assignment-index must be a non-negative integer.");
  }
  const overwrite = takeBooleanFlag(args, "--overwrite");
  const options = parseFixOptions(args);
  assertNoExtraArgs(args);
  return emitAutomation(
    command,
    await createRobustEvidenceDryRun({
      inputPath,
      outDir,
      collectionId,
      ...(participantId ? { participantId } : {}),
      ...(assignmentIndex !== undefined ? { assignmentIndex } : {}),
      sharingPermission: sharingValue as RobustEvidenceSharingPermission,
      surface: "cli",
      options,
      overwrite
    }, createCliRuntime(command, context, { inputPath, outputPath: outDir })),
    {
      operation: "robust_evidence_dry_run",
      options: { ...options, collectionId, sharingPermission: sharingValue, assignmentIndex, overwrite },
      paths: { inputPath, outDir }
    }
  );
}

function formatAutomationHuman(command: string, warnings: readonly string[]): string {
  const warningLines = warnings.map((warning) => `Warning: ${warning}\n`).join("");
  return `${command} complete\n${warningLines}`;
}

function sanitizeAutomationValue(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const fixResult = value.result;
  if (isPixelFixResult(fixResult)) {
    return {
      ...value,
      result: summarizePixelFixResult(fixResult),
    };
  }

  return value;
}

function summarizePixelFixResult(result: PixelFixResult): Omit<PixelFixResult, "image"> & {
  image: { width: number; height: number; dataByteLength: number };
} {
  return {
    ...result,
    image: {
      width: result.image.width,
      height: result.image.height,
      dataByteLength: result.image.data.byteLength,
    },
  };
}

function isPixelFixResult(value: unknown): value is PixelFixResult {
  if (!isRecord(value) || !isRecord(value.image)) {
    return false;
  }
  const image = value.image;
  return typeof image.width === "number" && typeof image.height === "number" && "data" in image;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

async function writeCliDiagnostics(
  diagnosticsPath: string | undefined,
  result: CliCommandResult,
  argv: readonly string[],
  io: CliIo,
): Promise<void> {
  if (!diagnosticsPath) {
    return;
  }

  const payload = result.payload as { error?: unknown };
  const error = isAutomationError(payload.error) ? payload.error : undefined;
  const report = createDiagnosticReport({
    app: cliApp,
    command: commandFromPayload(result.payload) ?? commandFromArgv(argv) ?? "unknown",
    ...(result.diagnostics?.operation ? { operation: result.diagnostics.operation } : {}),
    status: result.code === 0 ? "success" : "failure",
    exitCode: result.code as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8,
    ...(error ? { error } : {}),
    ...(result.diagnostics?.options !== undefined ? { options: result.diagnostics.options } : {}),
    ...(result.diagnostics?.paths !== undefined ? { paths: result.diagnostics.paths } : {}),
    metadata: {
      argv,
      ...(result.diagnostics?.metadata ?? {}),
    },
    warnings: result.diagnostics?.warnings ?? [],
  });

  const write = await writeJsonOutput(diagnosticsPath, report, { overwrite: true });
  if (!write.ok) {
    emit(io.stderr, `Could not write diagnostics: ${write.error.message}\n`);
  }
}

function commandFromPayload(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "command" in payload) {
    const command = (payload as { command?: unknown }).command;
    return typeof command === "string" ? command : undefined;
  }
  return undefined;
}

function commandFromArgv(argv: readonly string[]): string | undefined {
  return argv.find((arg) => !arg.startsWith("-"));
}

function isAutomationError(value: unknown): value is NonNullable<ReturnType<typeof automationError>["error"]> {
  return Boolean(
    value &&
    typeof value === "object" &&
    "code" in value &&
    "message" in value &&
    "exitCode" in value,
  );
}

function createCliRuntime(
  command: string,
  context: CliContext,
  paths: { inputPath?: string; outputPath?: string; jobId?: string } = {},
): AutomationRuntimeOptions | undefined {
  if (!context.progressJson) {
    return undefined;
  }

  return {
    jobId: paths.jobId ?? command,
    ...(paths.inputPath ? { inputPath: paths.inputPath } : {}),
    ...(paths.outputPath ? { outputPath: paths.outputPath } : {}),
    onProgress: (event) => emitProgressEvent(context.io, command, event),
  };
}

function emitProgressEvent(io: CliIo, command: string, event: AutomationProgressEvent): void {
  emit(io.stderr, `${JSON.stringify({
    type: "progress",
    command,
    operation: event.operation,
    stage: event.stage,
    percent: event.percent,
    ...(event.message ? { message: event.message } : {}),
    ...(event.jobId ? { jobId: event.jobId } : {}),
    ...(event.inputPath ? { inputPath: event.inputPath } : {}),
    ...(event.outputPath ? { outputPath: event.outputPath } : {}),
    ...(event.item ? { item: event.item } : {}),
  })}\n`);
}

async function expandBatchInputs(patterns: readonly string[], options: { recursive: boolean }): Promise<string[]> {
  const inputPaths: string[] = [];

  for (const pattern of patterns) {
    if (hasGlob(pattern)) {
      inputPaths.push(...await expandGlob(pattern, options));
      continue;
    }

    const resolved = path.resolve(pattern);
    const info = await stat(resolved).catch(() => undefined);
    if (info?.isDirectory()) {
      inputPaths.push(...await listSupportedImageFiles(resolved, options.recursive));
      continue;
    }

    inputPaths.push(resolved);
  }

  return [...new Set(inputPaths)].sort((a, b) => a.localeCompare(b));
}

async function expandGlob(pattern: string, options: { recursive: boolean }): Promise<string[]> {
  const normalized = pattern.replaceAll("\\", "/");
  const slash = normalized.lastIndexOf("/");
  const directory = slash >= 0 ? normalized.slice(0, slash) : ".";
  const filePattern = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const baseDir = path.resolve(directory);
  const matcher = globFileMatcher(filePattern);
  const files = await listSupportedImageFiles(baseDir, options.recursive || filePattern.includes("**"));
  return files.filter((filePath) => matcher(path.basename(filePath)));
}

async function listSupportedImageFiles(directory: string, recursive: boolean): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...await listSupportedImageFiles(filePath, recursive));
      }
      continue;
    }

    if (entry.isFile() && supportedBatchImageExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(filePath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function createBatchOutputPaths(
  outDir: string,
  inputPath: string,
  usedOutputs: Set<string>,
): { outputPath: string; manifestPath: string } {
  const parsed = path.parse(inputPath);
  let baseName = parsed.name;
  let outputPath = path.join(outDir, `${baseName}.fixed.png`);
  let suffix = 2;

  while (usedOutputs.has(outputPath)) {
    baseName = `${parsed.name}-${suffix}`;
    outputPath = path.join(outDir, `${baseName}.fixed.png`);
    suffix += 1;
  }

  usedOutputs.add(outputPath);
  return {
    outputPath,
    manifestPath: path.join(outDir, `${baseName}.manifest.json`),
  };
}

function createBatchResult(
  items: BatchItemResult[],
  inputCount: number,
  outDir: string,
  dryRun: boolean,
  continueOnError: boolean,
): BatchResult {
  return {
    items,
    summary: {
      inputCount,
      successCount: items.filter((item) => item.status === "succeeded").length,
      failureCount: items.filter((item) => item.status === "failed").length,
      skippedCount: items.filter((item) => item.status === "skipped").length,
      dryRun,
      continueOnError,
      outDir: path.resolve(outDir),
    },
  };
}

function hasGlob(input: string): boolean {
  return /[*?[\]]/.test(input);
}

function globFileMatcher(pattern: string): (fileName: string) => boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "*")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  const regex = new RegExp(`^${escaped}$`, "i");
  return (fileName) => regex.test(fileName);
}

function parseFixOptions(args: string[]): AutomationFixOptionsInput {
  const options: AutomationFixOptionsInput = {};
  const assetType = takeValue(args, "--asset-type");
  if (assetType) options.assetType = assetType as NonNullable<AutomationFixOptionsInput["assetType"]>;
  const outputSizeMode = takeValue(args, "--output-size");
  if (outputSizeMode) {
    options.outputSizeMode = outputSizeMode as NonNullable<
      AutomationFixOptionsInput["outputSizeMode"]
    >;
  }
  const target = takeValue(args, "--target");
  if (target) options.target = target;
  const nativeSize = takeValue(args, "--native-size");
  if (nativeSize) {
    options.reconstruction = nativeSize.toLowerCase() === "auto"
      ? { sizeMode: "auto" }
      : { sizeMode: "manual", ...parseSize(nativeSize, "--native-size") };
  }
  const canvas = takeValue(args, "--canvas");
  const framing = takeValue(args, "--framing");
  const canvasScale = takeValue(args, "--canvas-scale");
  const anchor = takeValue(args, "--anchor");
  if (canvas || framing || canvasScale || anchor) {
    const packaging: NonNullable<AutomationFixOptionsInput["packaging"]> = {};
    if (canvas) {
      const normalizedCanvas = canvas.toLowerCase();
      if (normalizedCanvas === "content" || normalizedCanvas === "native") {
        packaging.canvasMode = normalizedCanvas;
      } else {
        packaging.canvasMode = "exact";
        Object.assign(packaging, parseSize(canvas, "--canvas"));
      }
    }
    if (framing) packaging.framing = parseCanvasFraming(framing);
    if (canvasScale) packaging.scale = parseCanvasScale(canvasScale);
    if (anchor) Object.assign(packaging, parseCanvasAnchor(anchor));
    options.packaging = packaging;
  }
  const colors = readOptionalMaxColorsFlag(args, "--colors") ?? readOptionalMaxColorsFlag(args, "--max-colors");
  if (colors !== undefined) options.maxColors = colors;
  const colorSpace = takeValue(args, "--color-space");
  if (colorSpace) options.colorSpace = colorSpace as NonNullable<AutomationFixOptionsInput["colorSpace"]>;
  const quantizer = takeValue(args, "--quantizer");
  if (quantizer) options.quantizer = normalizeQuantizerFlag(quantizer) as NonNullable<AutomationFixOptionsInput["quantizer"]>;
  const palette = takeValue(args, "--palette");
  if (palette) options.palette = palette;
  const paletteWeighting = takeValue(args, "--palette-weighting");
  if (paletteWeighting) options.paletteWeighting = paletteWeighting as NonNullable<AutomationFixOptionsInput["paletteWeighting"]>;
  const minRegion = readOptionalNumberFlag(args, "--min-region");
  if (minRegion !== undefined) options.minRegion = minRegion;
  const protectColors = takeValue(args, "--protect-colors");
  if (protectColors) options.protectColors = protectColors;
  const protectSalientColors = takeBooleanChoice(args, "--protect-salient-colors", "--no-protect-salient-colors");
  if (protectSalientColors !== undefined) options.protectSalientColors = protectSalientColors;
  const seed = readOptionalNumberFlag(args, "--seed");
  if (seed !== undefined) options.seed = seed;
  const emitPalette = takeValue(args, "--emit-palette");
  if (emitPalette) options.emitPalette = emitPalette;
  const emitPaletteConditioning = takeValue(args, "--emit-palette-conditioning");
  if (emitPaletteConditioning) options.emitPaletteConditioning = emitPaletteConditioning;
  const paletteStrategy = takeValue(args, "--palette-strategy");
  if (paletteStrategy) options.paletteStrategy = paletteStrategy as NonNullable<AutomationFixOptionsInput["paletteStrategy"]>;
  const dither = takeValue(args, "--dither") ?? takeValue(args, "--dithering");
  if (dither) options.dither = dither as NonNullable<AutomationFixOptionsInput["dither"]>;
  const downscale = takeValue(args, "--downscale") ?? takeValue(args, "--downscale-method");
  if (downscale) options.downscaleMethod = downscale as NonNullable<AutomationFixOptionsInput["downscaleMethod"]>;
  const alpha = takeValue(args, "--alpha");
  if (alpha) options.alpha = alpha as NonNullable<AutomationFixOptionsInput["alpha"]>;
  const alphaThreshold = readOptionalNumberFlag(args, "--alpha-threshold");
  if (alphaThreshold !== undefined) options.alphaThreshold = alphaThreshold;
  const alphaTolerance = readOptionalNumberFlag(args, "--alpha-tolerance");
  if (alphaTolerance !== undefined) options.alphaTolerance = alphaTolerance;
  const alphaColorKey = takeValue(args, "--alpha-color-key");
  if (alphaColorKey) options.alphaColorKey = alphaColorKey;
  const backgroundDetection = takeValue(args, "--background-detection");
  if (backgroundDetection) options.backgroundDetection = backgroundDetection as NonNullable<AutomationFixOptionsInput["backgroundDetection"]>;
  const transparentRgb = takeValue(args, "--transparent-rgb");
  if (transparentRgb) options.transparentRgb = transparentRgb;
  const decontaminateRgb = takeBooleanChoice(args, "--decontaminate-rgb", "--keep-transparent-rgb");
  if (decontaminateRgb !== undefined) options.decontaminateRgb = decontaminateRgb;
  takeBooleanFlag(args, "--detect-scale");
  const lineCleanup = takeValue(args, "--line-cleanup");
  if (lineCleanup) options.lineCleanup = lineCleanup as LineCleanupStrength;
  const outlineMode = takeValue(args, "--outline-mode");
  const outlineSourceColors = takeValue(args, "--outline-source-colors");
  const outlineColor = takeValue(args, "--outline-color");
  const outlineSize = readOptionalNumberFlag(args, "--outline-size");
  const outlineAlpha = readOptionalNumberFlag(args, "--outline-alpha");
  const removeOrphans = takeBooleanChoice(args, "--remove-orphans", "--no-remove-orphans");
  const jaggyCleanup = takeBooleanChoice(args, "--jaggy-cleanup", "--no-jaggy-cleanup");
  const preserveSinglePixelDetails = takeBooleanChoice(args, "--preserve-single-pixel-details", "--no-preserve-single-pixel-details");
  const removeHalos = takeBooleanChoice(args, "--remove-halos", "--keep-halos");
  const denoiseStrength = readOptionalNumberFlag(args, "--denoise-strength");
  const contrastExpansion = takeBooleanChoice(args, "--contrast-expansion", "--no-contrast-expansion");
  const matteCleanup = takeBooleanChoice(args, "--matte-cleanup", "--no-matte-cleanup");
  if (
    outlineMode ||
    outlineSourceColors ||
    outlineColor ||
    outlineSize !== undefined ||
    outlineAlpha !== undefined ||
    removeOrphans !== undefined ||
    jaggyCleanup !== undefined ||
    preserveSinglePixelDetails !== undefined ||
    removeHalos !== undefined ||
    denoiseStrength !== undefined ||
    contrastExpansion !== undefined ||
    matteCleanup !== undefined ||
    lineCleanup !== undefined
  ) {
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
    if (outlineSize !== undefined) {
      cleanup.outlineSize = outlineSize;
    }
    if (outlineAlpha !== undefined) {
      cleanup.outlineAlpha = outlineAlpha;
    }
    if (removeOrphans !== undefined) {
      cleanup.removeOrphans = removeOrphans;
    }
    if (jaggyCleanup !== undefined) {
      cleanup.jaggyCleanup = jaggyCleanup;
    }
    if (preserveSinglePixelDetails !== undefined) {
      cleanup.preserveSinglePixelDetails = preserveSinglePixelDetails;
    }
    if (removeHalos !== undefined) {
      cleanup.removeHalos = removeHalos;
    }
    if (denoiseStrength !== undefined) {
      cleanup.denoiseStrength = denoiseStrength;
    }
    if (contrastExpansion !== undefined) {
      cleanup.contrastExpansion = { enabled: contrastExpansion };
    }
    if (matteCleanup !== undefined) {
      cleanup.morphology = {
        enabled: matteCleanup,
        matteCleanup,
        alphaThreshold: alphaThreshold ?? 128
      };
    }
    if (lineCleanup) {
      cleanup.lineCleanup = lineCleanup as LineCleanupStrength;
    }
    options.cleanup = cleanup;
  }

  const gridMode = takeValue(args, "--grid");
  const reconstructionStrategy = takeValue(args, "--reconstruction-strategy");
  const legacyGridStrategy = takeValue(args, "--grid-strategy");
  if (reconstructionStrategy && legacyGridStrategy) {
    throw new CliUsageError(
      "Use either --reconstruction-strategy or --grid-strategy, not both."
    );
  }
  const gridStrategy = reconstructionStrategy ?? legacyGridStrategy;
  const robustSafety = takeValue(args, "--robust-safety");
  const cropToBounds = takeBooleanChoice(
    args,
    "--crop-to-bounds",
    "--full-canvas"
  );
  const fixMixels = takeBooleanFlag(args, "--fix-mixels");
  const snap = takeBooleanFlag(args, "--snap");
  const scale = readOptionalNumberFlag(args, "--scale");
  const scaleX = readOptionalNumberFlag(args, "--scale-x");
  const scaleY = readOptionalNumberFlag(args, "--scale-y");
  const phaseX = readOptionalNumberFlag(args, "--phase-x");
  const phaseY = readOptionalNumberFlag(args, "--phase-y");
  if (gridMode || gridStrategy || robustSafety || cropToBounds !== undefined || fixMixels || snap || scale !== undefined || scaleX !== undefined || scaleY !== undefined || phaseX !== undefined || phaseY !== undefined) {
    options.grid = {
      ...(gridMode ? { detect: gridMode as "auto" | "manual" } : {}),
      ...(gridStrategy
        ? {
            autoStrategy:
              gridStrategy as NonNullable<
                NonNullable<AutomationFixOptionsInput["grid"]>["autoStrategy"]
              >
          }
        : {}),
      ...(robustSafety
        ? {
            robustSafety:
              robustSafety as NonNullable<
                NonNullable<AutomationFixOptionsInput["grid"]>["robustSafety"]
              >
          }
        : {}),
      ...(cropToBounds !== undefined ? { cropToBounds } : {}),
      ...(fixMixels ? { fixMixels: true } : {}),
      ...(scale !== undefined ? { scale } : {}),
      ...(scaleX !== undefined ? { scaleX } : {}),
      ...(scaleY !== undefined ? { scaleY } : {}),
      ...(phaseX !== undefined ? { phaseX } : {}),
      ...(phaseY !== undefined ? { phaseY } : {}),
    };
  }
  if (fixMixels) options.fixMixels = true;
  if (snap) options.snap = true;

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

function readInputs(args: string[]): string[] {
  const inputs: string[] = [];
  while (args.length > 0 && !args[0]!.startsWith("--")) {
    inputs.push(args.shift()!);
  }
  if (inputs.length === 0) {
    throw new CliUsageError("Missing input path.");
  }
  return inputs;
}

function takeBooleanFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function takeBooleanChoice(args: string[], truthyName: string, falsyName: string): boolean | undefined {
  const truthy = takeBooleanFlag(args, truthyName);
  const falsy = takeBooleanFlag(args, falsyName);
  if (truthy && falsy) {
    throw new CliUsageError(`Use either ${truthyName} or ${falsyName}, not both.`);
  }
  if (truthy) return true;
  if (falsy) return false;
  return undefined;
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

function readOptionalMaxColorsFlag(args: string[], name: string): number | "auto" | undefined {
  const value = takeValue(args, name);
  if (value === undefined) return undefined;
  if (value === "auto") return "auto";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new CliUsageError(`${name} must be a number or auto.`);
  }
  return parsed;
}

function normalizeQuantizerFlag(value: string): string {
  return value === "median-cut" ? "medianCut" : value;
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

function parseCanvasFraming(value: string): NonNullable<NonNullable<AutomationFixOptionsInput["packaging"]>["framing"]> {
  switch (value.toLowerCase()) {
    case "preserve":
    case "preserve-composition":
      return "preserveComposition";
    case "pack":
    case "pack-subject":
      return "packSubject";
    case "fit":
    case "fit-subject":
      return "fitSubject";
    default:
      throw new CliUsageError("--framing must be preserve, pack, or fit.");
  }
}

function parseCanvasScale(value: string): NonNullable<NonNullable<AutomationFixOptionsInput["packaging"]>["scale"]> {
  switch (value.toLowerCase()) {
    case "native":
      return "native";
    case "integer":
    case "integer-fit":
      return "integerFit";
    case "resample":
      return "resample";
    default:
      throw new CliUsageError("--canvas-scale must be native, integer, or resample.");
  }
}

function parseCanvasAnchor(
  value: string,
): Pick<NonNullable<AutomationFixOptionsInput["packaging"]>, "anchor" | "offsetX" | "offsetY"> {
  switch (value.toLowerCase()) {
    case "center":
      return { anchor: "center" };
    case "bottom-center":
      return { anchor: "bottomCenter" };
    case "top-left":
      return { anchor: "topLeft" };
  }
  const custom = /^(-?\d+),(-?\d+)$/.exec(value.trim());
  if (!custom) {
    throw new CliUsageError("--anchor must be center, bottom-center, top-left, or X,Y.");
  }
  return {
    anchor: "custom",
    offsetX: Number(custom[1]),
    offsetY: Number(custom[2]),
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
    "  pixelaid inspect <input.png|input.jpg|input.webp> --json",
    "  pixelaid report <input.png|input.jpg|input.webp> [more.png|more.jpg|more.webp] --json",
    "  pixelaid compare-robust <input.png|input.jpg|input.webp> --out-dir <dir> --collection-id <opaque-id>",
    "  pixelaid suggest <input.png|input.jpg|input.webp> --json",
    "  pixelaid fix <input.png|input.jpg|input.webp> --out <fixed.png> --manifest <manifest.json> [--no-auto]",
    "  pixelaid fix-sheet <input.png|input.jpg|input.webp> --out-dir <dir> [--detect-sheet | --frames <frames.json>]",
    "  pixelaid palette <input.png|input.jpg|input.webp> --max-colors <n> --out <palette.hex|palette.json>",
    "  pixelaid export <input.png|input.jpg|input.webp> --out-dir <dir> --engine godot,unity,phaser,texturepacker,tiled,ldtk --bundle zip",
    "",
    "Robust evidence dry run:",
    "  compare-robust writes Classic/Robust PNGs plus a procedural evidence.json record.",
    "  Procedural records contain no human verdict and are excluded from promotion decisions.",
    "  --collection-id <opaque-id> --sharing public|private-debug|metrics-only|none",
    "  --participant-id <opaque-id> --assignment-index <n> --overwrite",
    "",
    "Palette options:",
    "  --max-colors <n|auto> (alias: --colors)",
    "  --palette <name|path> (named palettes include pico-8, db16, gameboy, cga16)",
    "  --palette-strategy medianCut|perceptual|frequency|wu|kmeans|familyFirst",
    "  --quantizer median-cut|medianCut|wu|kmeans|perceptual|frequency|familyFirst",
    "  --color-space oklab|cielab|srgb",
    "  --palette-weighting area|frequency",
    "  --min-region <px>",
    "  --protect-colors auto|none|<hex,...>",
    "  --protect-salient-colors / --no-protect-salient-colors  Keep small vivid regions (eyes/nose) at low color budgets (default: on for single sprites)",
    "  --seed <n>",
    "  --dither none|ordered|bayer2|bayer4|floyd|errorDiffusion",
    "  --downscale-method perceptual|nearest|bilinear|dominant|median|adaptive|averageThenPalette|detailPreserving|contrast|kCentroid",
    "  --auto / --auto-suggest         Guided suggestion path (default; accepted for back-compat)",
    "  --no-auto                      Manual legacy fix path; use only explicit/default algorithm options",
    "  --emit-palette <palette.aco|palette.gpl|palette.pal|palette.hex|palette.json|palette.png>",
    "  --emit-palette-conditioning <artifact.json>",
    "",
    "Native reconstruction (stage 1):",
    "  --native-size auto|WIDTHxHEIGHT  Detect or manually set the true reconstructed pixel-art size",
    "  --reconstruction-strategy classic|robust  Choose Classic or opt-in Robust Preview reconstruction",
    "  --grid-strategy classic|robust  Back-compatible alias for --reconstruction-strategy",
    "  --robust-safety guarded|warn|off  Fall back, warn, or use the raw Robust proposal (default: guarded)",
    "  --grid auto|manual --scale <n> --scale-x <n> --scale-y <n> --phase-x <n> --phase-y <n>",
    "  --fix-mixels                   Normalize uneven pixel block sizes (mixels) before downscaling",
    "  --snap                         Force square pixels using one uniform integer reconstruction scale",
    "  --crop-to-bounds / --full-canvas  Reconstruct the subject bounds or the complete native composition",
    "",
    "Output packaging (stage 2; single images):",
    "  --canvas content|native|WIDTHxHEIGHT  Package tight content, native composition, or an exact canvas",
    "  --framing preserve|pack|fit    Preserve source composition, pack the subject, or fit it to the canvas",
    "  --canvas-scale native|integer|resample  Keep reconstructed pixels, integer-scale, or explicitly resample",
    "  --anchor center|bottom-center|top-left|X,Y  Place the reconstructed result on the output canvas",
    "",
    "Legacy sizing compatibility:",
    "  --output-size detected|source|exact  Legacy combined detector/output policy",
    "  --target WIDTHxHEIGHT           Legacy combined target; prefer --native-size plus --canvas",
    "  --detect-scale                 Print detected pixel scale on inspect JSON (accepted on fix)",
    "  --line-cleanup off|low|high    Pixel-perfect line cleanup strength (supersedes the legacy 1px-gap cleanup)",
    "",
    "Alpha options:",
    "  --alpha preserve|binary|backgroundFloodFill|colorKey",
    "  --alpha-threshold <0-255> --alpha-tolerance <0-255> --alpha-color-key <#rrggbb>",
    "  --background-detection classic|adaptive",
    "  --decontaminate-rgb / --keep-transparent-rgb --transparent-rgb <#rrggbb>",
    "",
  ].join("\n");
}

class CliUsageError extends Error {}
