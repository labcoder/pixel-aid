import { PIXELAID_APP_NAME, PIXELAID_VERSION } from "@pixelaid/shared";
import type { PixelAssetManifest, PixelFixResult, SheetSliceOptions, SpriteAnimation, SpriteFrame } from "@pixelaid/shared";

export type CreateManifestOptions = {
  result: PixelFixResult;
  imageName: string;
  originalFilename?: string;
  generatedAt?: string;
  sheet?: SheetSliceOptions;
  frames?: SpriteFrame[];
  animations?: Record<string, SpriteAnimation>;
};

export const GODOT_IMPORT_GUIDANCE = [
  "Import the PNG as a lossless 2D texture.",
  "Use nearest texture filtering for pixel art.",
  "Read the generic JSON manifest for frame rects, pivots, and animation timing."
] as const;

export const UNITY_IMPORT_GUIDANCE = [
  "Set Texture Type to Sprite (2D and UI).",
  "Use Sprite Mode Multiple for sheets and Filter Mode Point.",
  "Use the generic JSON manifest for slicing, pivots, and animation timing."
] as const;

export function createPixelAssetManifest(options: CreateManifestOptions): PixelAssetManifest {
  const sheetOptions = options.sheet ?? options.result.settings.sheet;
  const frames = options.frames ?? createFrames(options.result, sheetOptions);
  const operationSettings = options.sheet ? { ...options.result.settings, sheet: options.sheet } : options.result.settings;
  const sheet = {
    width: options.result.image.width,
    height: options.result.image.height,
    frameWidth: sheetOptions?.frameWidth ?? options.result.image.width,
    frameHeight: sheetOptions?.frameHeight ?? options.result.image.height,
    margin: sheetOptions?.margin ?? 0,
    spacing: sheetOptions?.spacing ?? 0,
    extrude: sheetOptions?.extrude ?? 0
  };
  const source: PixelAssetManifest["meta"]["source"] = {
    width: options.result.metrics.sourceWidth,
    height: options.result.metrics.sourceHeight
  };

  if (options.originalFilename) {
    source.originalFilename = options.originalFilename;
  }

  return {
    meta: {
      app: PIXELAID_APP_NAME,
      version: PIXELAID_VERSION,
      image: options.imageName,
      assetType: options.result.settings.assetType,
      ...(options.generatedAt ? { generatedAt: options.generatedAt } : {}),
      palette: options.result.palette,
      source,
      operation: {
        settings: operationSettings,
        grid: options.result.grid,
        durationMs: options.result.metrics.durationMs,
        ...(options.result.diagnostics ? { diagnostics: options.result.diagnostics } : {})
      }
    },
    sheet,
    frames,
    animations: options.animations ?? {}
  };
}

export function validateManifest(manifest: PixelAssetManifest): string[] {
  const problems: string[] = [];
  const frameNames = new Set<string>();

  for (const frame of manifest.frames) {
    if (frameNames.has(frame.name)) {
      problems.push(`Duplicate frame name ${frame.name}`);
    }
    frameNames.add(frame.name);

    const exceedsX = frame.rect.x < 0 || frame.rect.x + frame.rect.w > manifest.sheet.width;
    const exceedsY = frame.rect.y < 0 || frame.rect.y + frame.rect.h > manifest.sheet.height;
    if (exceedsX || exceedsY) {
      problems.push(`Frame ${frame.name} exceeds sheet bounds`);
    }
  }

  for (const [animationName, animation] of Object.entries(manifest.animations)) {
    for (const frameName of animation.frames) {
      if (!frameNames.has(frameName)) {
        problems.push(`Animation ${animationName} references missing frame ${frameName}`);
      }
    }
  }

  if (manifest.meta.palette.length === 0) {
    problems.push("Manifest palette is empty");
  }

  return problems;
}

function createFrames(result: PixelFixResult, sheetOptions: SheetSliceOptions | undefined): SpriteFrame[] {
  if (!sheetOptions) {
    return [
      {
        name: "frame_000",
        rect: { x: 0, y: 0, w: result.image.width, h: result.image.height },
        pivot: { x: Math.floor(result.image.width / 2), y: result.image.height },
        durationMs: 120
      }
    ];
  }

  const frames: SpriteFrame[] = [];
  const pivot = sheetOptions.pivot ?? { x: Math.floor(sheetOptions.frameWidth / 2), y: sheetOptions.frameHeight };
  for (let row = 0; row < sheetOptions.rows; row += 1) {
    for (let column = 0; column < sheetOptions.columns; column += 1) {
      const index = row * sheetOptions.columns + column;
      frames.push({
        name: `frame_${index.toString().padStart(3, "0")}`,
        rect: {
          x: sheetOptions.margin + column * (sheetOptions.frameWidth + sheetOptions.spacing),
          y: sheetOptions.margin + row * (sheetOptions.frameHeight + sheetOptions.spacing),
          w: sheetOptions.frameWidth,
          h: sheetOptions.frameHeight
        },
        pivot: { ...pivot },
        durationMs: 120
      });
    }
  }

  return frames;
}
