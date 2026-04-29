import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  analyzeSceneAssetDiagnostics,
  analyzeSheetConditioning,
  analyzeTilesetSeams,
  detectGridCandidates,
  detectSheetLayout,
  extractPalette,
  fixImage,
} from "@pixelaid/core";
import {
  createEngineExportBundle as createExporterEngineBundle,
  createHexPaletteFile,
  createPaletteJsonFile,
  createPixelAssetManifest,
  type EngineExportTarget,
} from "@pixelaid/exporters";
import {
  assetTypeToMode,
  getAssetTypeDefinition,
  type AnimationTag,
  type AssetType,
  type FixOptions,
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
  type PlanOutputFileOptions,
} from "./paths";
import {
  automationError,
  automationOk,
  type AutomationResult,
} from "./result";

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

export async function inspectImage(request: InspectImageRequest): Promise<AutomationResult<ImageInspection>> {
  const imageResult = await readRgbaImageFile(request.inputPath);
  if (!imageResult.ok) {
    return imageResult;
  }

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
  return automationOk(inspection, suggestion.warnings);
}

export async function suggestFixSettings(request: SuggestFixSettingsRequest): Promise<AutomationResult<FixSuggestion>> {
  const imageResult = await readRgbaImageFile(request.inputPath);
  if (!imageResult.ok) {
    return imageResult;
  }

  return createFixSuggestion(imageResult.value, request.options);
}

export async function fixSprite(request: FixSpriteRequest): Promise<AutomationResult<FixOperationResult>> {
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

  const imageResult = await readRgbaImageFile(request.inputPath);
  if (!imageResult.ok) {
    return imageResult;
  }

  const options = normalizeFixOptions(request.options ?? {});
  if (!options.ok) {
    return options;
  }

  const fixed = runFix(imageResult.value, options.value);
  const imageWrite = await encodePngFile(fixed.image, output.value.path);
  if (!imageWrite.ok) {
    return imageWrite;
  }

  const pixelManifest = createPixelAssetManifest({
    result: fixed,
    imageName: path.basename(output.value.path),
    originalFilename: path.basename(request.inputPath),
  });

  const files: AutomationFileRecord[] = [
    fileRecord("image", output.value.path, path.dirname(output.value.path)),
  ];

  if (manifest) {
    const manifestWrite = await writeJsonOutput(manifest.value.path, pixelManifest, { overwrite: true });
    if (!manifestWrite.ok) {
      return manifestWrite;
    }
    files.push(fileRecord("manifest", manifest.value.path, path.dirname(output.value.path)));
  }

  return automationOk({
    result: fixed,
    manifest: pixelManifest,
    files,
    warnings: [...options.warnings],
  }, options.warnings);
}

export async function fixSpriteSheet(request: FixSpriteSheetRequest): Promise<AutomationResult<FixOperationResult>> {
  const outDir = path.resolve(request.outDir);
  const baseName = stripPngExtension(path.basename(request.inputPath));
  const outputPath = request.outputPath ?? path.join(outDir, `${baseName}.fixed.png`);
  const manifestPath = request.manifestPath ?? path.join(outDir, `${baseName}.manifest.json`);

  const output = await planOutputFile(outputPath, { overwrite: request.overwrite });
  if (!output.ok) return output;
  const manifestOutput = await planOutputFile(manifestPath, { overwrite: request.overwrite });
  if (!manifestOutput.ok) return manifestOutput;

  const imageResult = await readRgbaImageFile(request.inputPath);
  if (!imageResult.ok) {
    return imageResult;
  }

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

  const fixed = runFix(imageResult.value, options.value);
  const imageWrite = await encodePngFile(fixed.image, output.value.path);
  if (!imageWrite.ok) return imageWrite;

  const animations = animationRecordFromRows(layout.rowAnimations, frames);
  const pixelManifest = createPixelAssetManifest({
    result: fixed,
    imageName: path.basename(output.value.path),
    originalFilename: path.basename(request.inputPath),
    sheet,
    frames,
    animations,
  });
  const manifestWrite = await writeJsonOutput(manifestOutput.value.path, pixelManifest, { overwrite: true });
  if (!manifestWrite.ok) return manifestWrite;

  const files = [
    fileRecord("image", output.value.path, outDir),
    fileRecord("manifest", manifestOutput.value.path, outDir),
  ];
  const warnings = [...options.warnings, ...layout.warnings];
  return automationOk({ result: fixed, manifest: pixelManifest, files, warnings }, warnings);
}

export async function extractPaletteFile(request: ExtractPaletteFileRequest): Promise<AutomationResult<{ palette: string[]; files: AutomationFileRecord[] }>> {
  const output = await planOutputFile(request.outputPath, { overwrite: request.overwrite });
  if (!output.ok) return output;

  const imageResult = await readRgbaImageFile(request.inputPath);
  if (!imageResult.ok) return imageResult;

  const palette = extractPalette(imageResult.value, request.maxColors);
  const extension = path.extname(output.value.path).toLowerCase();
  const contents = extension === ".json"
    ? `${JSON.stringify(createPaletteJsonFile(palette, { image: path.basename(request.inputPath) }), null, 2)}\n`
    : createHexPaletteFile(palette);
  const write = await writeTextOutput(output.value.path, contents, { overwrite: true });
  if (!write.ok) return write;

  return automationOk({
    palette,
    files: [fileRecord("palette", output.value.path, path.dirname(output.value.path))],
  });
}

export async function exportEngineBundle(request: ExportEngineBundleRequest): Promise<AutomationResult<FixOperationResult>> {
  const outDir = path.resolve(request.outDir);
  const baseName = stripPngExtension(path.basename(request.inputPath));
  const imagePath = path.join(outDir, `${baseName}.fixed.png`);
  const manifestPath = path.join(outDir, `${baseName}.manifest.json`);
  const palettePath = path.join(outDir, `${baseName}.palette.hex`);

  const plannedOutputs = await Promise.all([
    planOutputFile(imagePath, { overwrite: request.overwrite }),
    planOutputFile(manifestPath, { overwrite: request.overwrite }),
    planOutputFile(palettePath, { overwrite: request.overwrite }),
  ]);
  for (const planned of plannedOutputs) {
    if (!planned.ok) return planned;
  }

  const imageResult = await readRgbaImageFile(request.inputPath);
  if (!imageResult.ok) return imageResult;

  const options = normalizeFixOptions(request.options ?? {});
  if (!options.ok) return options;

  const fixed = runFix(imageResult.value, options.value);
  const pixelManifest = createPixelAssetManifest({
    result: fixed,
    imageName: path.basename(imagePath),
    originalFilename: path.basename(request.inputPath),
  });
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

  const imageWrite = await encodePngFile(fixed.image, imagePath);
  if (!imageWrite.ok) return imageWrite;
  const manifestWrite = await writeJsonOutput(manifestPath, pixelManifest, { overwrite: true });
  if (!manifestWrite.ok) return manifestWrite;
  const paletteWrite = await writeTextOutput(palettePath, createHexPaletteFile(fixed.palette), { overwrite: true });
  if (!paletteWrite.ok) return paletteWrite;

  const files: AutomationFileRecord[] = [
    fileRecord("image", imagePath, outDir),
    fileRecord("manifest", manifestPath, outDir),
    fileRecord("palette", palettePath, outDir),
  ];

  for (const plan of engineOutputPlans) {
    const write = plan.kind === "json"
      ? await writeJsonOutput(plan.absolutePath, plan.contents, { overwrite: true })
      : await writeTextOutput(plan.absolutePath, String(plan.contents), { overwrite: true });
    if (!write.ok) return write;
    files.push({
      kind: plan.kind === "json" ? "engine" : "engine",
      path: plan.absolutePath,
      relativePath: plan.relativePath,
    });
  }

  const warnings = [...options.warnings, ...engineBundle.warnings.map((warning) => warning.message)];
  return automationOk({ result: fixed, manifest: pixelManifest, files, warnings }, warnings);
}

function createFixSuggestion(image: RGBAImage, overrides: AutomationFixOptionsInput | undefined): AutomationResult<FixSuggestion> {
  const gridCandidates = withFallbackGridCandidates(image);
  const sheetLayout = detectSheetLayout(image);
  const assetType = overrides?.assetType ? parseAutomationAssetType(overrides.assetType) : classifyAssetType(image, sheetLayout);
  if (!assetType.ok) {
    return assetType;
  }

  const bestGrid = gridCandidates[0]!;
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

  const normalized = normalizeFixOptions({
    assetType: assetType.value.assetType,
    targetWidth: defaultTarget.width,
    targetHeight: defaultTarget.height,
    ...overrides,
    grid: gridOverrides,
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

function classifyAssetType(image: RGBAImage, sheetLayout: SheetLayoutDetection): AutomationResult<ReturnType<typeof parseAutomationAssetType> extends AutomationResult<infer T> ? T : never> {
  if (sheetLayout.confidence >= 0.65) {
    return parseAutomationAssetType("animationSheet");
  }

  const ratio = image.width / image.height;
  if (ratio >= 2 || ratio <= 0.5) {
    return parseAutomationAssetType("spriteSheet");
  }

  const isSquare = Math.abs(ratio - 1) <= 0.08;
  if (isSquare && image.width >= 96 && image.height >= 96) {
    return parseAutomationAssetType("tileset");
  }

  return parseAutomationAssetType("sprite");
}

function runFix(image: RGBAImage, options: FixOptions): PixelFixResult {
  const start = performance.now();
  const result = fixImage(image, options);
  return {
    ...result,
    metrics: {
      ...result.metrics,
      durationMs: Math.max(0, Math.round((performance.now() - start) * 100) / 100),
    },
  };
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
