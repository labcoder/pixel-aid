import { rm } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  analyzeSceneAssetDiagnostics,
  analyzeSheetConditioning,
  analyzeQualityReport,
  analyzeTilemapDiagnostics,
  analyzeTilesetSeams,
  applyAlphaMode,
  detectGridCandidates,
  detectSheetLayout,
  extractPalette,
  fixImage,
  type QualityFindingSeverity,
  type QualityReport,
} from "@pixelaid/core";
import {
  createEngineExportBundle as createExporterEngineBundle,
  createHexPaletteFile,
  createPaletteJsonFile,
  createPixelAssetManifest,
  type EngineExportTarget,
} from "@pixelaid/exporters";
import {
  getAssetTypeDefinition,
  type AnimationTag,
  type AssetType,
  type FixOptions,
  type GridCandidate,
  type PixelAssetManifest,
  type PixelFixResult,
  type RGBAImage,
  type SheetLayoutDetection,
  type SheetSliceOptions,
  type SpriteFrame,
} from "@pixelaid/shared";
import { encodePngFile, readRgbaImageFile } from "./imageIo";
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

export type ImageInspection = {
  inputPath: string;
  image: { width: number; height: number };
  palette: {
    exactColorCount: number;
    preview: string[];
  };
  alpha: {
    transparentPixels: number;
    softAlphaPixels: number;
  };
  gridCandidates: ReturnType<typeof detectGridCandidates>;
  sheetLayout?: SheetLayoutDetection;
  suggestion: FixSuggestion;
  diagnostics: {
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
  maxColors: number;
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
    const imageResult = await readRgbaImageFile(request.inputPath);
    if (!imageResult.ok) {
      return imageResult;
    }
    assertAutomationNotCancelled(scopedRuntime);

    reportAutomationProgress(scopedRuntime, operation, "analysis", 30, "Analyzing source structure");
    const image = imageResult.value;
    const suggestion = createFixSuggestion(image, request.options);
    if (!suggestion.ok) {
      return suggestion;
    }

    const sheetConditioning = analyzeSheetConditioning(image);
    const assetType = suggestion.value.options.assetType;
    const diagnostics: ImageInspection["diagnostics"] = {
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
      image: { width: image.width, height: image.height },
      palette: {
        exactColorCount: countVisibleExactColors(image),
        preview: extractPalette(image, Math.min(8, request.options?.maxColors ?? 8)),
      },
      alpha: countAlphaPixels(image),
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
    let fixOptions: FixOptions;
    let optionWarnings: string[];
    if (request.autoSuggest) {
      const suggestion = createFixSuggestion(imageResult.value, request.options);
      if (!suggestion.ok) {
        return suggestion;
      }
      fixOptions = suggestion.value.options;
      optionWarnings = suggestion.warnings;
    } else {
      const options = normalizeFixOptions(request.options ?? {});
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

    const sheet = sheetFromFrames(frames, layout, request.options?.sheet);
    const options = normalizeFixOptions({
      assetType: request.options?.assetType ?? "animationSheet",
      ...request.options,
      sheet,
      sheetFrames: frames,
    });
    if (!options.ok) {
      return options;
    }

    const fixed = runFix(imageResult.value, options.value, scopedRuntime, operation);
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
    const warnings = [...options.warnings, ...layout.warnings];
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
    const palette = extractPalette(imageResult.value, request.maxColors);
    const extension = path.extname(output.value.path).toLowerCase();
    const contents = extension === ".json"
      ? `${JSON.stringify(createPaletteJsonFile(palette, { image: path.basename(request.inputPath) }), null, 2)}\n`
      : createHexPaletteFile(palette);
    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "output-write", 90, "Writing palette file");
    const write = await writeTextOutput(output.value.path, contents, { overwrite: true });
    if (!write.ok) return write;
    writtenPaths.push(output.value.path);

    reportAutomationProgress(scopedRuntime, operation, "complete", 100, "Palette export complete");
    return automationOk({
      palette,
      files: [fileRecord("palette", output.value.path, path.dirname(output.value.path))],
    });
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
    const options = normalizeFixOptions(request.options ?? {});
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
  const gridCandidates = withFallbackGridCandidates(image);
  const sheetLayout = detectSheetLayout(image);
  const tilemapDiagnostics = analyzeTilemapDiagnostics(image);
  const bakedTransparencyDetected = detectBakedTransparencyForSuggestion(image, gridCandidates, sheetLayout, overrides);
  const assetType = overrides?.assetType
    ? parseAutomationAssetType(overrides.assetType)
    : classifyAssetType(image, sheetLayout, tilemapDiagnostics, bakedTransparencyDetected);
  if (!assetType.ok) {
    return assetType;
  }

  const effectiveGridCandidates = resolveSuggestionGridCandidates(image, gridCandidates, assetType.value.assetType, bakedTransparencyDetected, overrides);
  const bestGrid = effectiveGridCandidates[0]!;
  const defaultTarget = sheetLayout.confidence >= 0.65 && assetType.value.mode === "spriteSheet"
    ? packedSheetSize(sheetLayout)
    : { width: bestGrid.outputWidth, height: bestGrid.outputHeight };
  const gridOverrides: NonNullable<AutomationFixOptionsInput["grid"]> = {
    detect: overrides?.grid?.detect ?? "auto",
    scaleX: overrides?.grid?.scaleX ?? bestGrid.scaleX,
    scaleY: overrides?.grid?.scaleY ?? bestGrid.scaleY,
    phaseX: overrides?.grid?.phaseX ?? bestGrid.phaseX,
    phaseY: overrides?.grid?.phaseY ?? bestGrid.phaseY,
  };
  if (overrides?.grid?.cropToBounds !== undefined) {
    gridOverrides.cropToBounds = overrides.grid.cropToBounds;
  }
  if (overrides?.grid?.localCorrection !== undefined) {
    gridOverrides.localCorrection = overrides.grid.localCorrection;
  }

  const suggestedCleanup = suggestAutomationCleanupOverrides(overrides?.cleanup, assetType.value.assetType, bakedTransparencyDetected, bestGrid);
  const suggestedAlpha = shouldCleanBakedBackground(assetType.value.assetType, bakedTransparencyDetected) && overrides?.alpha === undefined
    ? "backgroundFloodFill"
    : overrides?.alpha;
  const suggestedDownscale = shouldCleanBakedBackground(assetType.value.assetType, bakedTransparencyDetected) && overrides?.downscale === undefined
    ? "dominant"
    : overrides?.downscale;

  const normalized = normalizeFixOptions({
    assetType: assetType.value.assetType,
    targetWidth: defaultTarget.width,
    targetHeight: defaultTarget.height,
    ...overrides,
    ...(suggestedAlpha ? { alpha: suggestedAlpha } : {}),
    ...(suggestedDownscale ? { downscale: suggestedDownscale } : {}),
    grid: gridOverrides,
    ...(suggestedCleanup ? { cleanup: suggestedCleanup } : {}),
    ...(sheetLayout.confidence >= 0.65 && assetType.value.mode === "spriteSheet" ? { sheet: sheetFromLayout(sheetLayout) } : {}),
  });
  if (!normalized.ok) {
    return normalized;
  }

  const definition = getAssetTypeDefinition(normalized.value.assetType);
  const warnings = [...normalized.warnings, ...definition.defaultWarnings.map((warning) => warning.message)];
  return automationOk({
    options: normalized.value,
    confidence: Math.max(bestGrid.confidence, sheetLayout.confidence),
    reason: suggestionReason(normalized.value.assetType, bestGrid, sheetLayout),
    warnings,
    support: definition.support,
  }, warnings);
}

function detectBakedTransparencyForSuggestion(
  image: RGBAImage,
  gridCandidates: GridCandidate[],
  sheetLayout: SheetLayoutDetection,
  overrides: AutomationFixOptionsInput | undefined,
): boolean {
  const report = analyzeQualityReport(image, {
    assetType: "sprite",
    maxColors: overrides?.maxColors ?? 24,
    alpha: "backgroundFloodFill",
    gridCandidates,
    sheetLayout,
  });
  return report.findings.some((finding) => finding.id === "baked-transparency-background");
}

function resolveSuggestionGridCandidates(
  image: RGBAImage,
  fallbackCandidates: GridCandidate[],
  assetType: AssetType,
  bakedTransparencyDetected: boolean,
  overrides: AutomationFixOptionsInput | undefined,
): GridCandidate[] {
  if (!shouldCleanBakedBackground(assetType, bakedTransparencyDetected) || overrides?.grid?.detect === "manual") {
    return fallbackCandidates;
  }

  const cleaned = applyAlphaMode(image, "backgroundFloodFill", alphaSettingsFromOverrides(overrides)).image;
  return withFallbackGridCandidates(cleaned);
}

function shouldCleanBakedBackground(assetType: AssetType, bakedTransparencyDetected: boolean): boolean {
  return bakedTransparencyDetected && (assetType === "sprite" || assetType === "icon");
}

function alphaSettingsFromOverrides(overrides: AutomationFixOptionsInput | undefined): NonNullable<FixOptions["alphaSettings"]> {
  return {
    threshold: overrides?.alphaThreshold ?? 128,
    tolerance: overrides?.alphaTolerance ?? 18,
    colorKey: overrides?.alphaColorKey ?? "#ffffff",
    decontaminateRgb: overrides?.decontaminateRgb ?? true,
    transparentRgb: overrides?.transparentRgb ?? "#000000",
  };
}

function suggestAutomationCleanupOverrides(
  overrides: Partial<FixOptions["cleanup"]> | undefined,
  assetType: AssetType,
  bakedTransparencyDetected: boolean,
  grid: GridCandidate,
): Partial<FixOptions["cleanup"]> | undefined {
  const selectedScale = Math.min(grid.scaleX, grid.scaleY);
  const lowScaleBakedSprite = shouldCleanBakedBackground(assetType, bakedTransparencyDetected) && selectedScale < 4;
  if (!lowScaleBakedSprite) {
    return overrides;
  }

  return {
    removeOrphans: false,
    jaggyCleanup: false,
    removeHalos: false,
    denoiseStrength: 0,
    ...overrides,
  };
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

function classifyAssetType(
  image: RGBAImage,
  sheetLayout: SheetLayoutDetection,
  tilemapDiagnostics: ReturnType<typeof analyzeTilemapDiagnostics>,
  bakedTransparencyDetected = false,
): AutomationResult<ReturnType<typeof parseAutomationAssetType> extends AutomationResult<infer T> ? T : never> {
  const tilemapCandidate = tilemapDiagnostics.selected;
  if (
    tilemapCandidate &&
    image.width >= 96 &&
    image.height >= 96 &&
    tilemapCandidate.repeatedTileRatio >= 0.35 &&
    tilemapCandidate.rows >= 4 &&
    tilemapCandidate.columns >= 4
  ) {
    return parseAutomationAssetType("tilemap");
  }

  if (sheetLayout.confidence >= 0.65) {
    return parseAutomationAssetType("animationSheet");
  }

  const ratio = image.width / image.height;
  if (ratio >= 2 || ratio <= 0.5) {
    return parseAutomationAssetType("spriteSheet");
  }

  if (bakedTransparencyDetected) {
    return parseAutomationAssetType("sprite");
  }

  const isSquare = Math.abs(ratio - 1) <= 0.08;
  if (isSquare && image.width >= 96 && image.height >= 96) {
    return parseAutomationAssetType("tileset");
  }

  return parseAutomationAssetType("sprite");
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
  const candidates = detectGridCandidates(image, { maxScale: Math.min(32, image.width, image.height) });
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

function suggestionReason(assetType: AssetType, grid: ReturnType<typeof detectGridCandidates>[number], sheetLayout: SheetLayoutDetection): string {
  if (assetType === "animationSheet" || assetType === "spriteSheet" || assetType === "characterSheet") {
    return sheetLayout.confidence >= 0.65
      ? `Detected sprite-sheet rows with ${(sheetLayout.confidence * 100).toFixed(0)}% confidence.`
      : `Source proportions suggest multiple frames; best grid is ${grid.outputWidth}x${grid.outputHeight}.`;
  }
  if (assetType === "tileset") {
    return `Square source suggests a tileset; best grid is ${grid.outputWidth}x${grid.outputHeight}.`;
  }
  if (assetType === "tilemap") {
    return `Repeated tile signatures suggest a tilemap; best pixel grid is ${grid.outputWidth}x${grid.outputHeight}.`;
  }
  return `Best grid is ${grid.outputWidth}x${grid.outputHeight} with ${(grid.confidence * 100).toFixed(0)}% confidence.`;
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

function sheetFromLayout(layout: SheetLayoutDetection): SheetSliceOptions {
  return {
    frameWidth: layout.frameWidth,
    frameHeight: layout.frameHeight,
    rows: layout.rows,
    columns: layout.columns,
    margin: layout.margin,
    spacing: layout.spacing,
    extrude: 0,
  };
}

function packedSheetSize(layout: SheetLayoutDetection): { width: number; height: number } {
  const widestRow = Math.max(1, ...layout.rowFrameCounts);
  return {
    width: layout.margin * 2 + widestRow * layout.frameWidth + Math.max(0, widestRow - 1) * layout.spacing,
    height: layout.margin * 2 + layout.rows * layout.frameHeight + Math.max(0, layout.rows - 1) * layout.spacing,
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
