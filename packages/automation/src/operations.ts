import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  analyzeOutlineSemantics,
  analyzeQualityReport,
  analyzeSceneAssetDiagnostics,
  analyzeSheetConditioning,
  analyzeTilemapDiagnostics,
  analyzeTilesetSeams,
  detectGridCandidates,
  detectMixels,
  detectPixelScale,
  detectSheetLayout,
  extractPalette,
  fixImage,
  resolvePalette,
  suggestFixSettings as suggestCoreFixSettings,
  suggestFixSettingsForAssetType as suggestCoreFixSettingsForAssetType,
  type FixSettingSuggestion as CoreFixSettingSuggestion,
  type OutlineColorCandidate,
  type QualityFindingSeverity,
  type QualityReport,
} from "@pixelaid/core";
import {
  createEngineExportBundle as createExporterEngineBundle,
  createHexPaletteFile,
  createPaletteConditioningArtifact,
  createPaletteJsonFile,
  createPixelAssetManifest,
  parsePaletteFile,
  resolveNamedPalette,
  serializePaletteFile,
  type EngineExportTarget,
} from "@pixelaid/exporters";
import {
  getAssetTypeDefinition,
  type AnimationTag,
  type ColorSpace,
  type FixOptions,
  type PaletteProtectColors,
  type PaletteStrategy,
  type PaletteWeighting,
  type PixelAssetManifest,
  type PixelFixResult,
  type PixelScaleReport,
  type RGBAImage,
  type MixelReport,
  type SheetLayoutDetection,
  type SheetSliceOptions,
  type SpriteFrame,
} from "@pixelaid/shared";
import { encodePngFile, readImageFile, readRgbaImageFile, type ImageFileMetadata } from "./imageIo";
import {
  normalizeFixOptions,
  parseAutomationAssetType,
  type AutomationFixOptionsInput,
} from "./options";
import {
  assertSafeBundlePath,
  planOutputFile,
  relativeToDirectory,
  writeJsonOutput,
  writeTextOutput,
} from "./paths";
import {
  automationError,
  automationOk,
  type AutomationResult,
} from "./result";
import {
  assertAutomationNotCancelled,
  cancellationFailure,
  reportAutomationProgress,
  toFixRuntime,
  type AutomationOperation,
  type AutomationRuntimeOptions,
} from "./progress";

export {
  createAutomationCancellationController,
  type AutomationCancellationController,
  type AutomationCancellationSignal,
  type AutomationOperation,
  type AutomationProgressEvent,
  type AutomationProgressStage,
  type AutomationRuntimeOptions,
} from "./progress";

export type AutomationFileRecord = {
  kind: "image" | "manifest" | "palette" | "engine" | "json" | "text";
  path: string;
  relativePath: string;
};

export type OutlineCandidateDiagnostics = {
  candidates: OutlineColorCandidate[];
  fringeCandidates?: OutlineColorCandidate[];
  candidateCount: number;
  fringeCandidateCount?: number;
  repairSafeCount: number;
  suspectFringeCount: number;
};

export type ImageInspection = {
  inputPath: string;
  source: ImageFileMetadata;
  image: { width: number; height: number };
  palette: {
    exactColorCount: number;
    preview: string[];
  };
  alpha: {
    transparentPixels: number;
    softAlphaPixels: number;
  };
  pixelScale: PixelScaleReport;
  mixels: MixelReport;
  gridCandidates: ReturnType<typeof detectGridCandidates>;
  sheetLayout?: SheetLayoutDetection;
  suggestion: FixSuggestion;
  diagnostics: {
    outline: OutlineCandidateDiagnostics;
    sheetConditioning: ReturnType<typeof analyzeSheetConditioning>;
    scene?: ReturnType<typeof analyzeSceneAssetDiagnostics>;
    tilemap?: ReturnType<typeof analyzeTilemapDiagnostics>;
    tileset?: ReturnType<typeof analyzeTilesetSeams>;
  };
};

export type FixSuggestion = {
  options: FixOptions;
  confidence: number;
  reason: string;
  warnings: string[];
  support: ReturnType<typeof getAssetTypeDefinition>["support"];
};

export type FixOperationResult = {
  result: PixelFixResult;
  manifest: PixelAssetManifest;
  files: AutomationFileRecord[];
  warnings: string[];
};

export type QualityReportAssetRequest = {
  inputPath: string;
  options?: AutomationFixOptionsInput;
};

export type CreateQualityReportRequest = {
  assets?: QualityReportAssetRequest[];
  inputPaths?: string[];
  options?: AutomationFixOptionsInput;
};

export type QualityReportAsset = QualityReport & {
  inputPath: string;
  suggestion: FixSuggestion;
};

export type QualityReportBatch = {
  reports: QualityReportAsset[];
  summary: {
    assetCount: number;
    findingCount: number;
    recommendationCount: number;
    highestSeverity: QualityFindingSeverity | "none";
  };
};

export type InspectImageRequest = {
  inputPath: string;
  options?: AutomationFixOptionsInput;
};

export type SuggestFixSettingsRequest = {
  inputPath: string;
  options?: AutomationFixOptionsInput;
};

export type FixSpriteRequest = {
  inputPath: string;
  outputPath: string;
  manifestPath?: string;
  options?: AutomationFixOptionsInput;
  /** Defaults to true. Pass false to bypass guided suggestion defaults and use only explicit/manual options. */
  autoSuggest?: boolean;
  overwrite?: boolean;
};

export type FixSpriteSheetRequest = {
  inputPath: string;
  outDir: string;
  outputPath?: string;
  manifestPath?: string;
  detectSheet?: boolean;
  frames?: SpriteFrame[];
  rowAnimations?: AnimationTag[];
  options?: AutomationFixOptionsInput;
  overwrite?: boolean;
};

export type ExtractPaletteFileRequest = {
  inputPath: string;
  outputPath: string;
  maxColors: number | "auto";
  paletteStrategy?: PaletteStrategy;
  quantizer?: PaletteStrategy;
  colorSpace?: ColorSpace;
  seed?: number;
  paletteWeighting?: PaletteWeighting;
  minRegion?: number;
  protectColors?: PaletteProtectColors | string;
  overwrite?: boolean;
};

export type ExportEngineBundleRequest = {
  inputPath: string;
  outDir: string;
  targets: EngineExportTarget[];
  options?: AutomationFixOptionsInput;
  overwrite?: boolean;
};

export async function inspectImage(
  request: InspectImageRequest,
  runtime?: AutomationRuntimeOptions,
): Promise<AutomationResult<ImageInspection>> {
  const operation: AutomationOperation = "inspect_image";
  const scopedRuntime = withRuntimePaths(runtime, request.inputPath);

  try {
    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "input-read", 5, "Reading source image");
    const imageResult = await readImageFile(request.inputPath);
    if (!imageResult.ok) {
      return imageResult;
    }
    assertAutomationNotCancelled(scopedRuntime);

    reportAutomationProgress(scopedRuntime, operation, "analysis", 30, "Analyzing source structure");
    const image = imageResult.value.image;
    const suggestion = createFixSuggestion(image, request.options);
    if (!suggestion.ok) {
      return suggestion;
    }

    const sheetConditioning = analyzeSheetConditioning(image);
    const outlineSemantics = analyzeOutlineSemantics(image, { maxCandidates: 8 });
    const outline = summarizeOutlineCandidateDiagnostics(
      outlineSemantics.outlineCandidates,
      outlineSemantics.fringeCandidates,
    );
    const assetType = suggestion.value.options.assetType;
    const diagnostics: ImageInspection["diagnostics"] = {
      outline,
      sheetConditioning,
    };
    if (assetType === "background" || assetType === "tilemap") {
      diagnostics.scene = analyzeSceneAssetDiagnostics(image, { assetType });
    }
    if (assetType === "tilemap") {
      diagnostics.tilemap = analyzeTilemapDiagnostics(image);
    }
    if (assetType === "tileset") {
      const frameWidth = suggestion.value.options.sheet?.frameWidth ?? 16;
      const frameHeight = suggestion.value.options.sheet?.frameHeight ?? 16;
      diagnostics.tileset = analyzeTilesetSeams(image, { tileWidth: frameWidth, tileHeight: frameHeight });
    }

    const sheetLayout = detectSheetLayout(image);
    const inspection: ImageInspection = {
      inputPath: request.inputPath,
      source: imageResult.value.metadata,
      image: { width: image.width, height: image.height },
      palette: {
        exactColorCount: countVisibleExactColors(image),
        preview: extractPalette(image, Math.min(8, numericMaxColors(request.options?.maxColors, 8))),
      },
      alpha: countAlphaPixels(image),
      pixelScale: detectPixelScale(image),
      mixels: detectMixels(image),
      gridCandidates: withFallbackGridCandidates(image),
      ...(sheetLayout.confidence > 0 ? { sheetLayout } : {}),
      suggestion: suggestion.value,
      diagnostics,
    };
    reportAutomationProgress(scopedRuntime, operation, "complete", 100, "Inspection complete");
    return automationOk(inspection, suggestion.warnings);
  } catch (error) {
    const cancelled = cancellationFailure(error, scopedRuntime, operation);
    if (cancelled) {
      return cancelled;
    }
    throw error;
  }
}

export async function suggestFixSettings(
  request: SuggestFixSettingsRequest,
  runtime?: AutomationRuntimeOptions,
): Promise<AutomationResult<FixSuggestion>> {
  const operation: AutomationOperation = "suggest_fix_settings";
  const scopedRuntime = withRuntimePaths(runtime, request.inputPath);

  try {
    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "input-read", 5, "Reading source image");
    const imageResult = await readRgbaImageFile(request.inputPath);
    if (!imageResult.ok) {
      return imageResult;
    }
    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "analysis", 45, "Finding recommended fix settings");
    const suggestion = createFixSuggestion(imageResult.value, request.options);
    if (suggestion.ok) {
      reportAutomationProgress(scopedRuntime, operation, "complete", 100, "Suggestion complete");
    }
    return suggestion;
  } catch (error) {
    const cancelled = cancellationFailure(error, scopedRuntime, operation);
    if (cancelled) {
      return cancelled;
    }
    throw error;
  }
}

export async function createQualityReport(
  request: CreateQualityReportRequest,
  runtime?: AutomationRuntimeOptions,
): Promise<AutomationResult<QualityReportBatch>> {
  const operation: AutomationOperation = "quality_report";
  const scopedRuntime = withRuntimePaths(runtime);

  try {
    const assets = normalizeQualityReportAssets(request);
    if (assets.length === 0) {
      return automationError("invalid_options", "quality report requires at least one input path.", 2);
    }

    const reports: QualityReportAsset[] = [];
    const warnings: string[] = [];
    reportAutomationProgress(scopedRuntime, operation, "batch", 1, "Starting quality report", {
      item: { index: 0, total: assets.length },
    });

    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index]!;
      assertAutomationNotCancelled(scopedRuntime);
      reportAutomationProgress(scopedRuntime, operation, "input-read", phaseProgress(5, 35, index, assets.length), "Reading source image", {
        inputPath: asset.inputPath,
        item: { index: index + 1, total: assets.length, inputPath: asset.inputPath },
      });
      const imageResult = await readRgbaImageFile(asset.inputPath);
      if (!imageResult.ok) {
        return imageResult;
      }

      assertAutomationNotCancelled(scopedRuntime);
      reportAutomationProgress(scopedRuntime, operation, "analysis", phaseProgress(35, 90, index, assets.length), "Analyzing asset quality", {
        inputPath: asset.inputPath,
        item: { index: index + 1, total: assets.length, inputPath: asset.inputPath },
      });
      const suggestion = createFixSuggestion(imageResult.value, asset.options);
      if (!suggestion.ok) {
        return suggestion;
      }
      warnings.push(...suggestion.warnings);

      const report = analyzeQualityReport(imageResult.value, {
        assetType: suggestion.value.options.assetType,
        maxColors: suggestion.value.options.maxColors,
        alpha: suggestion.value.options.alpha,
        gridCandidates: withFallbackGridCandidates(imageResult.value),
        sheetLayout: detectSheetLayout(imageResult.value),
      });
      reports.push({
        ...report,
        inputPath: asset.inputPath,
        suggestion: suggestion.value,
      });
    }

    const value = {
      reports,
      summary: summarizeQualityReports(reports),
    };
    reportAutomationProgress(scopedRuntime, operation, "complete", 100, "Quality report complete");
    return automationOk(value, [...new Set(warnings)]);
  } catch (error) {
    const cancelled = cancellationFailure(error, scopedRuntime, operation);
    if (cancelled) {
      return cancelled;
    }
    throw error;
  }
}

export async function fixSprite(
  request: FixSpriteRequest,
  runtime?: AutomationRuntimeOptions,
): Promise<AutomationResult<FixOperationResult>> {
  const operation: AutomationOperation = "fix_sprite";
  const scopedRuntime = withRuntimePaths(runtime, request.inputPath, request.outputPath);
  const writtenPaths: string[] = [];

  try {
    assertAutomationNotCancelled(scopedRuntime);
    const output = await planOutputFile(request.outputPath, { overwrite: request.overwrite });
    if (!output.ok) {
      return output;
    }
    const manifest = request.manifestPath
      ? await planOutputFile(request.manifestPath, { overwrite: request.overwrite })
      : undefined;
    if (manifest && !manifest.ok) {
      return manifest;
    }

    reportAutomationProgress(scopedRuntime, operation, "input-read", 5, "Reading source image");
    const imageResult = await readRgbaImageFile(request.inputPath);
    if (!imageResult.ok) {
      return imageResult;
    }

    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "analysis", 15, "Resolving fix settings");
    const preparedOptions = await resolvePaletteFileOption(request.options);
    if (!preparedOptions.ok) {
      return preparedOptions;
    }
    let fixOptions: FixOptions;
    let optionWarnings: string[];
    if (request.autoSuggest !== false) {
      const suggestion = createFixSuggestion(imageResult.value, preparedOptions.value);
      if (!suggestion.ok) {
        return suggestion;
      }
      fixOptions = suggestion.value.options;
      optionWarnings = suggestion.warnings;
    } else {
      const options = normalizeFixOptions(preparedOptions.value ?? {});
      if (!options.ok) {
        return options;
      }
      fixOptions = options.value;
      optionWarnings = options.warnings;
    }

    const fixed = runFix(imageResult.value, fixOptions, scopedRuntime, operation);
    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "output-write", 92, "Writing fixed PNG");
    const imageWrite = await encodePngFile(fixed.image, output.value.path);
    if (!imageWrite.ok) {
      return imageWrite;
    }
    writtenPaths.push(output.value.path);

    const pixelManifest = createPixelAssetManifest({
      result: fixed,
      imageName: path.basename(output.value.path),
      originalFilename: path.basename(request.inputPath),
    });

    const files: AutomationFileRecord[] = [
      fileRecord("image", output.value.path, path.dirname(output.value.path)),
    ];

    if (manifest) {
      assertAutomationNotCancelled(scopedRuntime);
      reportAutomationProgress(scopedRuntime, operation, "output-write", 96, "Writing asset manifest");
      const manifestWrite = await writeJsonOutput(manifest.value.path, pixelManifest, { overwrite: true });
      if (!manifestWrite.ok) {
        return manifestWrite;
      }
      writtenPaths.push(manifest.value.path);
      files.push(fileRecord("manifest", manifest.value.path, path.dirname(output.value.path)));
    }

    const paletteFiles = await emitPaletteOutputs(fixed.palette, preparedOptions.value, request.inputPath, request.overwrite);
    if (!paletteFiles.ok) {
      return paletteFiles;
    }
    writtenPaths.push(...paletteFiles.value.map((file) => file.path));
    files.push(...paletteFiles.value);

    reportAutomationProgress(scopedRuntime, operation, "complete", 100, "Sprite fix complete");
    return automationOk({
      result: fixed,
      manifest: pixelManifest,
      files,
      warnings: [...optionWarnings],
    }, optionWarnings);
  } catch (error) {
    const cancelled = cancellationFailure(error, scopedRuntime, operation);
    if (cancelled) {
      await cleanupWrittenFiles(writtenPaths);
      return cancelled;
    }
    throw error;
  }
}

export async function fixSpriteSheet(
  request: FixSpriteSheetRequest,
  runtime?: AutomationRuntimeOptions,
): Promise<AutomationResult<FixOperationResult>> {
  const operation: AutomationOperation = "fix_sprite_sheet";
  const outDir = path.resolve(request.outDir);
  const baseName = stripPngExtension(path.basename(request.inputPath));
  const outputPath = request.outputPath ?? path.join(outDir, `${baseName}.fixed.png`);
  const manifestPath = request.manifestPath ?? path.join(outDir, `${baseName}.manifest.json`);
  const scopedRuntime = withRuntimePaths(runtime, request.inputPath, outputPath);
  const writtenPaths: string[] = [];

  try {
    assertAutomationNotCancelled(scopedRuntime);
    const output = await planOutputFile(outputPath, { overwrite: request.overwrite });
    if (!output.ok) return output;
    const manifestOutput = await planOutputFile(manifestPath, { overwrite: request.overwrite });
    if (!manifestOutput.ok) return manifestOutput;

    reportAutomationProgress(scopedRuntime, operation, "input-read", 5, "Reading source sheet");
    const imageResult = await readRgbaImageFile(request.inputPath);
    if (!imageResult.ok) {
      return imageResult;
    }

    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "sheet-detection", 14, "Resolving sheet frames");
    const layout = request.detectSheet === false && request.frames && request.frames.length > 0
      ? layoutFromFrames(request.frames, request.rowAnimations, request.options?.sheet)
      : detectSheetLayout(imageResult.value);
    const frames = request.frames && request.frames.length > 0 ? cloneFrames(request.frames) : layout.frames;
    if (frames.length === 0) {
      return automationError("processing_failed", "No sprite sheet frames were provided or detected.", 4);
    }

    const preparedOptions = await resolvePaletteFileOption(request.options);
    if (!preparedOptions.ok) {
      return preparedOptions;
    }
    const sheet = sheetFromFrames(frames, layout, preparedOptions.value?.sheet);
    const suggestion = createFixSuggestion(imageResult.value, {
      assetType: preparedOptions.value?.assetType ?? "animationSheet",
      ...preparedOptions.value,
      sheet,
      sheetFrames: frames,
    });
    if (!suggestion.ok) {
      return suggestion;
    }

    const fixed = runFix(imageResult.value, suggestion.value.options, scopedRuntime, operation);
    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "output-write", 92, "Writing fixed sheet PNG");
    const imageWrite = await encodePngFile(fixed.image, output.value.path);
    if (!imageWrite.ok) return imageWrite;
    writtenPaths.push(output.value.path);

    const animations = animationRecordFromRows(layout.rowAnimations, frames);
    const pixelManifest = createPixelAssetManifest({
      result: fixed,
      imageName: path.basename(output.value.path),
      originalFilename: path.basename(request.inputPath),
      sheet,
      frames,
      animations,
    });
    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "output-write", 96, "Writing sheet manifest");
    const manifestWrite = await writeJsonOutput(manifestOutput.value.path, pixelManifest, { overwrite: true });
    if (!manifestWrite.ok) return manifestWrite;
    writtenPaths.push(manifestOutput.value.path);

    const files = [
      fileRecord("image", output.value.path, outDir),
      fileRecord("manifest", manifestOutput.value.path, outDir),
    ];
    const paletteFiles = await emitPaletteOutputs(fixed.palette, preparedOptions.value, request.inputPath, request.overwrite);
    if (!paletteFiles.ok) {
      return paletteFiles;
    }
    writtenPaths.push(...paletteFiles.value.map((file) => file.path));
    files.push(...paletteFiles.value);
    const warnings = [...suggestion.warnings, ...layout.warnings];
    reportAutomationProgress(scopedRuntime, operation, "complete", 100, "Sprite sheet fix complete");
    return automationOk({ result: fixed, manifest: pixelManifest, files, warnings }, warnings);
  } catch (error) {
    const cancelled = cancellationFailure(error, scopedRuntime, operation);
    if (cancelled) {
      await cleanupWrittenFiles(writtenPaths);
      return cancelled;
    }
    throw error;
  }
}

export async function extractPaletteFile(
  request: ExtractPaletteFileRequest,
  runtime?: AutomationRuntimeOptions,
): Promise<AutomationResult<{ palette: string[]; files: AutomationFileRecord[] }>> {
  const operation: AutomationOperation = "extract_palette";
  const scopedRuntime = withRuntimePaths(runtime, request.inputPath, request.outputPath);
  const writtenPaths: string[] = [];

  try {
    assertAutomationNotCancelled(scopedRuntime);
    const output = await planOutputFile(request.outputPath, { overwrite: request.overwrite });
    if (!output.ok) return output;

    reportAutomationProgress(scopedRuntime, operation, "input-read", 5, "Reading source image");
    const imageResult = await readRgbaImageFile(request.inputPath);
    if (!imageResult.ok) return imageResult;

    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "palette-extraction", 55, "Extracting palette");
    const normalized = normalizeFixOptions({
      maxColors: request.maxColors,
      ...(request.paletteStrategy ? { paletteStrategy: request.paletteStrategy } : {}),
      ...(request.quantizer ? { quantizer: request.quantizer } : {}),
      ...(request.colorSpace ? { colorSpace: request.colorSpace } : {}),
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
      ...(request.paletteWeighting ? { paletteWeighting: request.paletteWeighting } : {}),
      ...(request.minRegion !== undefined ? { minRegion: request.minRegion } : {}),
      ...(request.protectColors !== undefined ? { protectColors: request.protectColors } : {}),
    });
    if (!normalized.ok) return normalized;
    const resolved = resolvePalette(imageResult.value, {
      ...(normalized.value.paletteSettings ? { requested: normalized.value.paletteSettings } : {}),
      fallbackMaxColors: normalized.value.maxColors,
    });
    const palette = resolved.palette;
    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "output-write", 90, "Writing palette file");
    const write = await writePaletteFile(output.value.path, palette, request.inputPath, true);
    if (!write.ok) return write;
    writtenPaths.push(output.value.path);

    reportAutomationProgress(scopedRuntime, operation, "complete", 100, "Palette export complete");
    return automationOk({
      palette,
      files: [fileRecord("palette", output.value.path, path.dirname(output.value.path))],
    }, resolved.diagnostics.warnings);
  } catch (error) {
    const cancelled = cancellationFailure(error, scopedRuntime, operation);
    if (cancelled) {
      await cleanupWrittenFiles(writtenPaths);
      return cancelled;
    }
    throw error;
  }
}

export async function exportEngineBundle(
  request: ExportEngineBundleRequest,
  runtime?: AutomationRuntimeOptions,
): Promise<AutomationResult<FixOperationResult>> {
  const operation: AutomationOperation = "export_engine_bundle";
  const outDir = path.resolve(request.outDir);
  const baseName = stripPngExtension(path.basename(request.inputPath));
  const imagePath = path.join(outDir, `${baseName}.fixed.png`);
  const manifestPath = path.join(outDir, `${baseName}.manifest.json`);
  const palettePath = path.join(outDir, `${baseName}.palette.hex`);
  const scopedRuntime = withRuntimePaths(runtime, request.inputPath, outDir);
  const writtenPaths: string[] = [];

  try {
    assertAutomationNotCancelled(scopedRuntime);
    const plannedOutputs = await Promise.all([
      planOutputFile(imagePath, { overwrite: request.overwrite }),
      planOutputFile(manifestPath, { overwrite: request.overwrite }),
      planOutputFile(palettePath, { overwrite: request.overwrite }),
    ]);
    for (const planned of plannedOutputs) {
      if (!planned.ok) return planned;
    }

    reportAutomationProgress(scopedRuntime, operation, "input-read", 5, "Reading source image");
    const imageResult = await readRgbaImageFile(request.inputPath);
    if (!imageResult.ok) return imageResult;

    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "analysis", 12, "Resolving export settings");
    const preparedOptions = await resolvePaletteFileOption(request.options);
    if (!preparedOptions.ok) return preparedOptions;
    const options = normalizeFixOptions(preparedOptions.value ?? {});
    if (!options.ok) return options;

    const fixed = runFix(imageResult.value, options.value, scopedRuntime, operation, 15, 65);
    const pixelManifest = createPixelAssetManifest({
      result: fixed,
      imageName: path.basename(imagePath),
      originalFilename: path.basename(request.inputPath),
    });
    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "engine-export", 72, "Building engine export metadata");
    const engineBundle = createExporterEngineBundle({ manifest: pixelManifest, targets: request.targets });
    const engineOutputPlans: { relativePath: string; absolutePath: string; kind: AutomationFileRecord["kind"]; contents: unknown }[] = [];
    for (const file of engineBundle.files) {
      const safePath = assertSafeBundlePath(file.path);
      if (!safePath.ok) return safePath;
      engineOutputPlans.push({
        relativePath: safePath.value.path,
        absolutePath: path.join(outDir, safePath.value.path),
        kind: file.kind === "json" ? "json" : "text",
        contents: file.contents,
      });
    }

    for (const plan of engineOutputPlans) {
      const planned = await planOutputFile(plan.absolutePath, { overwrite: request.overwrite });
      if (!planned.ok) return planned;
    }

    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "output-write", 82, "Writing fixed image and metadata");
    const imageWrite = await encodePngFile(fixed.image, imagePath);
    if (!imageWrite.ok) return imageWrite;
    writtenPaths.push(imagePath);
    const manifestWrite = await writeJsonOutput(manifestPath, pixelManifest, { overwrite: true });
    if (!manifestWrite.ok) return manifestWrite;
    writtenPaths.push(manifestPath);
    const paletteWrite = await writeTextOutput(palettePath, createHexPaletteFile(fixed.palette), { overwrite: true });
    if (!paletteWrite.ok) return paletteWrite;
    writtenPaths.push(palettePath);

    const files: AutomationFileRecord[] = [
      fileRecord("image", imagePath, outDir),
      fileRecord("manifest", manifestPath, outDir),
      fileRecord("palette", palettePath, outDir),
    ];

    for (let index = 0; index < engineOutputPlans.length; index += 1) {
      const plan = engineOutputPlans[index]!;
      assertAutomationNotCancelled(scopedRuntime);
      reportAutomationProgress(scopedRuntime, operation, "engine-export", phaseProgress(88, 98, index, engineOutputPlans.length), "Writing engine export file", {
        outputPath: plan.absolutePath,
        item: { index: index + 1, total: engineOutputPlans.length },
      });
      const write = plan.kind === "json"
        ? await writeJsonOutput(plan.absolutePath, plan.contents, { overwrite: true })
        : await writeTextOutput(plan.absolutePath, String(plan.contents), { overwrite: true });
      if (!write.ok) return write;
      writtenPaths.push(plan.absolutePath);
      files.push({
        kind: plan.kind === "json" ? "engine" : "engine",
        path: plan.absolutePath,
        relativePath: plan.relativePath,
      });
    }

    const warnings = [...options.warnings, ...engineBundle.warnings.map((warning) => warning.message)];
    reportAutomationProgress(scopedRuntime, operation, "complete", 100, "Engine export complete");
    return automationOk({ result: fixed, manifest: pixelManifest, files, warnings }, warnings);
  } catch (error) {
    const cancelled = cancellationFailure(error, scopedRuntime, operation);
    if (cancelled) {
      await cleanupWrittenFiles(writtenPaths);
      return cancelled;
    }
    throw error;
  }
}

function createFixSuggestion(image: RGBAImage, overrides: AutomationFixOptionsInput | undefined): AutomationResult<FixSuggestion> {
  const parsedAssetType = overrides?.assetType ? parseAutomationAssetType(overrides.assetType) : undefined;
  if (parsedAssetType && !parsedAssetType.ok) {
    return parsedAssetType;
  }

  const coreSuggestion = parsedAssetType
    ? suggestCoreFixSettingsForAssetType(image, parsedAssetType.value.assetType)
    : suggestCoreFixSettings(image);
  const merged = deriveGuidedGridScaleFromTargetOverride(
    mergeSuggestedFixOptions(coreSuggestion, overrides),
    image,
    coreSuggestion,
    overrides,
  );
  const normalized = normalizeFixOptions(merged);
  if (!normalized.ok) {
    return normalized;
  }

  const definition = getAssetTypeDefinition(normalized.value.assetType);
  const warnings = uniqueWarnings([
    ...normalized.warnings,
    ...coreSuggestion.categoryWarnings.map((warning) => warning.message),
    ...definition.defaultWarnings.map((warning) => warning.message),
  ]);
  return automationOk({
    options: normalized.value,
    confidence: coreSuggestion.confidence,
    reason: coreSuggestion.reason,
    warnings,
    support: definition.support,
  }, warnings);
}

function deriveGuidedGridScaleFromTargetOverride(
  merged: AutomationFixOptionsInput,
  image: RGBAImage,
  suggestion: CoreFixSettingSuggestion,
  overrides: AutomationFixOptionsInput | undefined,
): AutomationFixOptionsInput {
  const target = explicitTargetSizeOverride(overrides);
  if (!target || suggestion.mode !== "single" || hasExplicitGridScale(overrides?.grid)) {
    return merged;
  }

  return {
    ...merged,
    grid: {
      ...merged.grid,
      scaleX: image.width / target.targetWidth,
      scaleY: image.height / target.targetHeight,
    },
  };
}

function explicitTargetSizeOverride(
  overrides: AutomationFixOptionsInput | undefined,
): { targetWidth: number; targetHeight: number } | undefined {
  if (!overrides) {
    return undefined;
  }

  let targetWidth = overrides.targetWidth;
  let targetHeight = overrides.targetHeight;
  if (typeof overrides.target === "string") {
    const match = /^(\d+)(?:x(\d+))?$/i.exec(overrides.target.trim());
    if (match) {
      targetWidth = Number(match[1]);
      targetHeight = Number(match[2] ?? match[1]);
    }
  } else if (overrides.target) {
    targetWidth = overrides.target.width;
    targetHeight = overrides.target.height;
  }

  return targetWidth !== undefined && targetHeight !== undefined && targetWidth > 0 && targetHeight > 0
    ? { targetWidth, targetHeight }
    : undefined;
}

function hasExplicitGridScale(grid: AutomationFixOptionsInput["grid"] | undefined): boolean {
  return grid?.scale !== undefined || grid?.scaleX !== undefined || grid?.scaleY !== undefined;
}

async function resolvePaletteFileOption(
  options: AutomationFixOptionsInput | undefined,
): Promise<AutomationResult<AutomationFixOptionsInput | undefined>> {
  if (typeof options?.palette !== "string") {
    return automationOk(options);
  }

  const named = resolveNamedPalette(options.palette);
  if (named) {
    return automationOk({ ...options, palette: named, paletteMode: options.paletteMode ?? "fixed" });
  }

  const colors = await readPaletteColorsFromFile(options.palette);
  if (!colors.ok) {
    return colors;
  }
  return automationOk({ ...options, palette: colors.value, paletteMode: "fixed" });
}

async function readPaletteColorsFromFile(filePath: string): Promise<AutomationResult<string[]>> {
  const resolved = path.resolve(filePath);
  try {
    if (path.extname(resolved).toLowerCase() === ".png") {
      const image = await readRgbaImageFile(resolved);
      if (!image.ok) {
        return image;
      }
      return automationOk(parsePaletteFile(resolved, image.value));
    }

    if (path.extname(resolved).toLowerCase() === ".json") {
      const parsed = JSON.parse(await readFile(resolved, "utf8")) as { colors?: unknown };
      const colors = Array.isArray(parsed.colors) ? parsed.colors.filter((color): color is string => typeof color === "string") : [];
      return automationOk(colors);
    }

    return automationOk(parsePaletteFile(resolved, await readFile(resolved)));
  } catch (error) {
    return automationError("invalid_options", `Could not read palette file: ${resolved}`, 2, {
      path: resolved,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

async function emitPaletteOutputs(
  colors: readonly string[],
  options: AutomationFixOptionsInput | undefined,
  sourcePath: string,
  overwrite: boolean | undefined,
): Promise<AutomationResult<AutomationFileRecord[]>> {
  const files: AutomationFileRecord[] = [];
  if (options?.emitPalette) {
    const write = await writePaletteFile(options.emitPalette, colors, sourcePath, overwrite);
    if (!write.ok) {
      return write;
    }
    files.push(fileRecord("palette", write.value.path, path.dirname(write.value.path)));
  }
  if (options?.emitPaletteConditioning) {
    const artifact = createPaletteConditioningArtifact(colors, { source: path.basename(sourcePath) });
    const write = await writeJsonOutput(options.emitPaletteConditioning, artifact, { overwrite });
    if (!write.ok) {
      return write;
    }
    files.push(fileRecord("json", write.value.path, path.dirname(write.value.path)));
  }
  return automationOk(files);
}

async function writePaletteFile(
  filePath: string,
  colors: readonly string[],
  sourcePath: string,
  overwrite: boolean | undefined,
): Promise<AutomationResult<{ path: string }>> {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") {
    return writeJsonOutput(filePath, createPaletteJsonFile(colors, { image: path.basename(sourcePath) }), { overwrite });
  }

  let serialized: ReturnType<typeof serializePaletteFile>;
  try {
    serialized = serializePaletteFile(filePath, colors);
  } catch (error) {
    return automationError("invalid_options", error instanceof Error ? error.message : String(error), 2, { path: filePath });
  }

  if (typeof serialized === "string") {
    return writeTextOutput(filePath, serialized, { overwrite });
  }
  const planned = await planOutputFile(filePath, { overwrite });
  if (!planned.ok) {
    return planned;
  }
  try {
    if (serialized instanceof Uint8Array) {
      await writeFile(planned.value.path, serialized);
      return planned;
    }
    const imageWrite = await encodePngFile(serialized, planned.value.path);
    if (!imageWrite.ok) {
      return imageWrite;
    }
    return planned;
  } catch (error) {
    return automationError("write_failed", `Could not write file: ${planned.value.path}`, 3, {
      path: planned.value.path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function numericMaxColors(value: number | "auto" | undefined, fallback: number): number {
  return value === undefined || value === "auto" ? fallback : value;
}

function mergeSuggestedFixOptions(
  suggestion: CoreFixSettingSuggestion,
  overrides: AutomationFixOptionsInput | undefined,
): AutomationFixOptionsInput {
  const base = automationOptionsFromCoreSuggestion(suggestion);
  const merged: AutomationFixOptionsInput = {
    ...base,
    ...overrides,
    grid: {
      ...base.grid,
      ...overrides?.grid,
    },
    cleanup: {
      ...base.cleanup,
      ...overrides?.cleanup,
      ...(base.cleanup?.morphology || overrides?.cleanup?.morphology
        ? {
            morphology: {
              ...base.cleanup?.morphology,
              ...overrides?.cleanup?.morphology,
            },
          }
        : {}),
      ...(base.cleanup?.contrastExpansion || overrides?.cleanup?.contrastExpansion
        ? {
            contrastExpansion: {
              ...base.cleanup?.contrastExpansion,
              ...overrides?.cleanup?.contrastExpansion,
            },
          }
        : {}),
    },
    ...(overrides?.sheetFrames ? { sheetFrames: overrides.sheetFrames } : base.sheetFrames ? { sheetFrames: base.sheetFrames } : {}),
  };
  if (base.sheet || overrides?.sheet) {
    merged.sheet = {
      ...base.sheet,
      ...overrides?.sheet,
    };
  }

  return merged;
}

function automationOptionsFromCoreSuggestion(suggestion: CoreFixSettingSuggestion): AutomationFixOptionsInput {
  const suggestionAllowsCleanup = (pass: CoreFixSettingSuggestion["cleanupEligibility"][number]["pass"]): boolean =>
    suggestion.cleanupEligibility.some((decision) => decision.pass === pass && decision.enabled);
  const usesSpriteCleanup = suggestion.assetType === "sprite" || suggestion.assetType === "icon";
  const useSuggestedStrictSheetCleanup = suggestion.mode === "spriteSheet" && suggestion.matteCleanup;
  const resolvedPreservesScene = suggestion.assetType === "background" || suggestion.assetType === "tilemap";
  const usesEdgeCleanup = !resolvedPreservesScene && (usesSpriteCleanup || useSuggestedStrictSheetCleanup || suggestionAllowsCleanup("outlineRepair"));
  const options: AutomationFixOptionsInput = {
    assetType: suggestion.assetType,
    targetWidth: suggestion.targetWidth,
    targetHeight: suggestion.targetHeight,
    maxColors: suggestion.maxColors,
    paletteMode: "auto",
    paletteStrategy: suggestion.paletteStrategy,
    paletteLockScope: suggestion.mode === "single" ? "single" : "sheet",
    paletteDithering: "none",
    colorSpace: "oklab",
    paletteWeighting: "area",
    minRegion: 1,
    protectColors: "auto",
    protectSalientColors: suggestion.mode === "single",
    downscale: suggestion.downscale,
    alpha: suggestion.alpha,
    alphaThreshold: suggestion.alphaSettings.threshold ?? 128,
    alphaTolerance: suggestion.alphaSettings.tolerance ?? 18,
    ...(suggestion.alphaSettings.colorKey ? { alphaColorKey: suggestion.alphaSettings.colorKey } : {}),
    ...(suggestion.alphaSettings.backgroundDetection ? { backgroundDetection: suggestion.alphaSettings.backgroundDetection } : {}),
    decontaminateRgb: suggestion.alphaSettings.decontaminateRgb ?? true,
    transparentRgb: suggestion.alphaSettings.transparentRgb ?? "#000000",
    grid: {
      detect: suggestion.gridDetect,
      scaleX: suggestion.gridScaleX,
      scaleY: suggestion.gridScaleY,
      phaseX: suggestion.gridPhaseX,
      phaseY: suggestion.gridPhaseY,
      cropToBounds: suggestion.mode === "single",
      localCorrection: suggestion.mode === "single" && suggestion.localCorrection,
      fixMixels: suggestion.mode === "single" && suggestion.fixMixels,
    },
    cleanup: {
      removeOrphans: suggestion.removeOrphans,
      jaggyCleanup: suggestion.jaggyCleanup,
      preserveSinglePixelDetails: suggestion.preserveSinglePixelDetails,
      removeHalos: suggestion.removeHalos,
      denoiseStrength: suggestion.denoiseStrength,
      dominantThreshold: 0.6,
      inferNativeScale: suggestion.mode !== "single" && suggestion.inferNativeScale && suggestionAllowsCleanup("nativeScaleInference"),
      outlineMode: usesEdgeCleanup ? suggestion.outlineMode : "none",
      outlineSize: suggestion.outlineSize,
      ...(usesEdgeCleanup && suggestion.outlineSourceColors.length > 0 ? { outlineSourceColors: suggestion.outlineSourceColors } : {}),
      ...(suggestion.matteCleanup
        ? {
            morphology: {
              enabled: true,
              close: false,
              fillTinyHoles: false,
              removeTinyComponents: false,
              preserveSinglePixelDetails: suggestion.preserveSinglePixelDetails,
              maxHolePixels: 1,
              maxComponentPixels: 1,
              matteCleanup: true,
              alphaThreshold: suggestion.alphaSettings.threshold ?? 128,
              connectivity: 8,
            },
          }
        : {}),
      ...(usesEdgeCleanup && suggestion.contrastExpansionEnabled ? { contrastExpansion: { enabled: true } } : {}),
    },
  };
  const sheet = sheetFromCoreSuggestion(suggestion);
  if (sheet && suggestion.sheetLayout) {
    options.sheet = sheet;
    options.sheetFrames = suggestion.sheetLayout.frames;
  }

  return options;
}

function sheetFromCoreSuggestion(suggestion: CoreFixSettingSuggestion): SheetSliceOptions | undefined {
  const sheet = suggestion.sheetLayout;
  if (!sheet) {
    return undefined;
  }

  return {
    frameWidth: sheet.frameWidth,
    frameHeight: sheet.frameHeight,
    rows: sheet.rows,
    columns: sheet.columns,
    margin: sheet.margin,
    spacing: sheet.spacing,
    extrude: 0,
  };
}

function uniqueWarnings(warnings: readonly string[]): string[] {
  return [...new Set(warnings)];
}

function normalizeQualityReportAssets(request: CreateQualityReportRequest): QualityReportAssetRequest[] {
  const assets: QualityReportAssetRequest[] = request.assets && request.assets.length > 0
    ? request.assets
    : (request.inputPaths ?? []).map((inputPath) => ({ inputPath }));

  return assets
    .filter((asset) => asset.inputPath.trim().length > 0)
    .map((asset) => ({
      inputPath: asset.inputPath,
      options: {
        ...request.options,
        ...asset.options,
      },
    }));
}

function summarizeQualityReports(reports: readonly QualityReportAsset[]): QualityReportBatch["summary"] {
  let highestSeverity: QualityFindingSeverity | "none" = "none";
  let findingCount = 0;
  let recommendationCount = 0;

  for (const report of reports) {
    findingCount += report.findings.length;
    recommendationCount += report.recommendations.length;
    highestSeverity = mergeSeverity(highestSeverity, report.summary.highestSeverity);
  }

  return {
    assetCount: reports.length,
    findingCount,
    recommendationCount,
    highestSeverity,
  };
}

function mergeSeverity(
  current: QualityFindingSeverity | "none",
  next: QualityFindingSeverity | "none"
): QualityFindingSeverity | "none" {
  if (current === "error" || next === "error") return "error";
  if (current === "warning" || next === "warning") return "warning";
  if (current === "info" || next === "info") return "info";
  return "none";
}

function runFix(
  image: RGBAImage,
  options: FixOptions,
  runtime: AutomationRuntimeOptions | undefined,
  operation: AutomationOperation,
  startPercent = 20,
  endPercent = 90,
): PixelFixResult {
  const start = performance.now();
  const result = fixImage(image, options, toFixRuntime(runtime, operation, startPercent, endPercent));
  return {
    ...result,
    metrics: {
      ...result.metrics,
      durationMs: Math.max(0, Math.round((performance.now() - start) * 100) / 100),
    },
  };
}

function withRuntimePaths(
  runtime: AutomationRuntimeOptions | undefined,
  inputPath?: string,
  outputPath?: string,
): AutomationRuntimeOptions | undefined {
  if (!runtime) {
    return undefined;
  }

  const scoped: AutomationRuntimeOptions = { ...runtime };
  if (!scoped.inputPath && inputPath) {
    scoped.inputPath = inputPath;
  }
  if (!scoped.outputPath && outputPath) {
    scoped.outputPath = outputPath;
  }
  return scoped;
}

function phaseProgress(start: number, end: number, index: number, total: number): number {
  if (total <= 0) {
    return end;
  }

  const progress = Math.min(1, Math.max(0, index / total));
  return start + (end - start) * progress;
}

async function cleanupWrittenFiles(filePaths: readonly string[]): Promise<void> {
  await Promise.all(filePaths.map((filePath) => rm(filePath, { force: true }).catch(() => undefined)));
}

function withFallbackGridCandidates(image: RGBAImage): ReturnType<typeof detectGridCandidates> {
  const candidates = detectGridCandidates(image, { maxScale: Math.min(32, image.width, image.height), sampling: "sampled" });
  if (candidates.length > 0) {
    return candidates;
  }

  return [
    {
      outputWidth: image.width,
      outputHeight: image.height,
      scaleX: 1,
      scaleY: 1,
      phaseX: 0,
      phaseY: 0,
      confidence: 0.25,
      reason: "Fallback one-to-one grid",
    },
  ];
}

function summarizeOutlineCandidateDiagnostics(
  candidates: OutlineColorCandidate[],
  fringeCandidates?: OutlineColorCandidate[],
): OutlineCandidateDiagnostics {
  return {
    candidates,
    ...(fringeCandidates !== undefined
      ? {
          fringeCandidates,
          fringeCandidateCount: fringeCandidates.length,
        }
      : {}),
    candidateCount: candidates.length,
    repairSafeCount: candidates.filter(isRepairSafeOutlineCandidate).length,
    suspectFringeCount:
      fringeCandidates !== undefined
        ? fringeCandidates.length
        : candidates.filter((candidate) => candidate.isFringeSuspect === true).length,
  };
}

function isRepairSafeOutlineCandidate(candidate: OutlineColorCandidate): boolean {
  return candidate.classification === "deliberate" && (candidate.confidence ?? 0) >= 0.8 && candidate.isFringeSuspect !== true;
}

function countVisibleExactColors(image: RGBAImage): number {
  const colors = new Set<number>();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! < 16) {
      continue;
    }
    colors.add((image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!);
  }
  return colors.size;
}

function countAlphaPixels(image: RGBAImage): { transparentPixels: number; softAlphaPixels: number } {
  let transparentPixels = 0;
  let softAlphaPixels = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3]!;
    if (alpha === 0) {
      transparentPixels += 1;
    } else if (alpha < 255) {
      softAlphaPixels += 1;
    }
  }
  return { transparentPixels, softAlphaPixels };
}

function layoutFromFrames(
  frames: readonly SpriteFrame[],
  rowAnimations: readonly AnimationTag[] | undefined,
  sheet: Partial<SheetSliceOptions> | undefined,
): SheetLayoutDetection {
  const resolvedSheet = sheetFromFrames(frames, undefined, sheet);
  return {
    ...sheetFromLayoutParts(resolvedSheet, frames),
    rowAnimations: rowAnimations ? cloneAnimations(rowAnimations) : rowAnimationsFromFrames(frames),
    reason: "Manual sprite sheet frames",
    warnings: [],
  };
}

function sheetFromLayoutParts(sheet: SheetSliceOptions, frames: readonly SpriteFrame[]): Omit<SheetLayoutDetection, "rowAnimations" | "reason" | "warnings"> {
  return {
    frameWidth: sheet.frameWidth,
    frameHeight: sheet.frameHeight,
    rows: sheet.rows,
    columns: sheet.columns,
    margin: sheet.margin,
    spacing: sheet.spacing,
    frames: cloneFrames(frames),
    rowRects: [],
    rowFrameCounts: [frames.length],
    rowLabels: [],
    confidence: 1,
  };
}

function sheetFromFrames(
  frames: readonly SpriteFrame[],
  layout?: Pick<SheetLayoutDetection, "rowFrameCounts">,
  overrides?: Partial<SheetSliceOptions>,
): SheetSliceOptions {
  const frameWidth = overrides?.frameWidth ?? Math.max(1, Math.max(...frames.map((frame) => frame.rect.w)));
  const frameHeight = overrides?.frameHeight ?? Math.max(1, Math.max(...frames.map((frame) => frame.rect.h)));
  const columns = overrides?.columns ?? Math.max(1, ...(layout?.rowFrameCounts ?? [frames.length]));
  const rows = overrides?.rows ?? Math.max(1, layout?.rowFrameCounts?.length ?? Math.ceil(frames.length / columns));
  return {
    frameWidth,
    frameHeight,
    rows,
    columns,
    margin: overrides?.margin ?? 0,
    spacing: overrides?.spacing ?? 0,
    extrude: overrides?.extrude ?? 0,
    ...(overrides?.pivot ? { pivot: { ...overrides.pivot } } : {}),
  };
}

function animationRecordFromRows(rowAnimations: readonly AnimationTag[], frames: readonly SpriteFrame[]): PixelAssetManifest["animations"] {
  const animations = rowAnimations.length > 0 ? cloneAnimations(rowAnimations) : rowAnimationsFromFrames(frames);
  const record: PixelAssetManifest["animations"] = {};
  for (const animation of animations) {
    record[animation.name] = {
      frames: [...animation.frameNames],
      loop: animation.loop,
      ...(animation.fps ? { fps: animation.fps } : {}),
      ...(animation.durationMs ? { durationMs: animation.durationMs } : {}),
      ...(animation.direction ? { direction: animation.direction } : {}),
    };
  }
  return record;
}

function rowAnimationsFromFrames(frames: readonly SpriteFrame[]): AnimationTag[] {
  const tags = new Map<string, string[]>();
  for (const frame of frames) {
    const frameTags = frame.tags && frame.tags.length > 0 ? frame.tags : ["animation"];
    for (const tag of frameTags) {
      const names = tags.get(tag) ?? [];
      names.push(frame.name);
      tags.set(tag, names);
    }
  }
  return [...tags.entries()].map(([name, frameNames]) => ({
    name,
    frameNames,
    fps: 8,
    loop: true,
  }));
}

function cloneFrames(frames: readonly SpriteFrame[]): SpriteFrame[] {
  return frames.map((frame) => ({
    ...frame,
    rect: { ...frame.rect },
    ...(frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
    pivot: { ...frame.pivot },
    ...(frame.tags ? { tags: [...frame.tags] } : {}),
  }));
}

function cloneAnimations(animations: readonly AnimationTag[]): AnimationTag[] {
  return animations.map((animation) => ({
    ...animation,
    frameNames: [...animation.frameNames],
  }));
}

function stripPngExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith(".png") ? fileName.slice(0, -4) : fileName;
}

function fileRecord(kind: AutomationFileRecord["kind"], filePath: string, baseDir: string): AutomationFileRecord {
  return {
    kind,
    path: filePath,
    relativePath: relativeToDirectory(baseDir, filePath),
  };
}
