import { PIXELAID_APP_NAME, PIXELAID_VERSION } from "@pixelaid/shared";
import type {
  AssetProvenance,
  AssetProvenanceSettingValue,
  PixelAssetManifest,
  PixelFixResult,
  SheetSliceOptions,
  SpriteAnimation,
  SpriteFrame
} from "@pixelaid/shared";

export type CreateManifestOptions = {
  result: PixelFixResult;
  imageName: string;
  originalFilename?: string;
  generatedAt?: string;
  provenance?: AssetProvenance;
  sheet?: SheetSliceOptions;
  frames?: SpriteFrame[];
  animations?: Record<string, SpriteAnimation>;
};

const secretKeyPattern = /(api[_-]?key|token|secret|password|credential|authorization|bearer)/i;
const secretValuePatterns = [/^bearer\s+/i, /^sk-[a-z0-9_-]{8,}/i];

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

  const provenance = sanitizeAssetProvenance(options.provenance);

  return {
    meta: {
      app: PIXELAID_APP_NAME,
      version: PIXELAID_VERSION,
      image: options.imageName,
      assetType: options.result.settings.assetType,
      ...(options.generatedAt ? { generatedAt: options.generatedAt } : {}),
      palette: options.result.palette,
      ...(provenance ? { provenance } : {}),
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

export function sanitizeAssetProvenance(provenance: AssetProvenance | undefined): AssetProvenance | undefined {
  if (!provenance) {
    return undefined;
  }

  const sanitized: AssetProvenance = {
    origin: provenance.origin
  };

  assignString(sanitized, "provider", provenance.provider);
  assignString(sanitized, "model", provenance.model);
  assignString(sanitized, "prompt", provenance.prompt);
  assignString(sanitized, "negativePrompt", provenance.negativePrompt);
  assignSeed(sanitized, provenance.seed);
  assignString(sanitized, "sourceImage", provenance.sourceImage);
  assignString(sanitized, "generatedAt", provenance.generatedAt);

  const settings = sanitizeSettings(provenance.settings);
  if (settings) {
    sanitized.settings = settings;
  }

  const postProcessing = provenance.postProcessing?.map((item) => item.trim()).filter((item) => item.length > 0 && !isSecretLikeValue(item));
  if (postProcessing && postProcessing.length > 0) {
    sanitized.postProcessing = postProcessing;
  }

  return hasProvenanceDetails(sanitized) ? sanitized : undefined;
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

    for (const box of frame.boxes ?? []) {
      const boxExceedsFrame =
        box.rect.x < 0 ||
        box.rect.y < 0 ||
        box.rect.w < 1 ||
        box.rect.h < 1 ||
        box.rect.x + box.rect.w > frame.rect.w ||
        box.rect.y + box.rect.h > frame.rect.h;
      if (boxExceedsFrame) {
        problems.push(`Box ${box.name} on frame ${frame.name} exceeds frame bounds`);
      }
    }

    for (const anchor of frame.anchors ?? []) {
      if (anchor.point.x < 0 || anchor.point.y < 0 || anchor.point.x > frame.rect.w || anchor.point.y > frame.rect.h) {
        problems.push(`Anchor ${anchor.name} on frame ${frame.name} exceeds frame bounds`);
      }
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

function assignString<T extends keyof AssetProvenance>(target: AssetProvenance, key: T, value: AssetProvenance[T]): void {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();
  if (trimmed.length > 0 && !isSecretLikeValue(trimmed)) {
    target[key] = trimmed as AssetProvenance[T];
  }
}

function assignSeed(target: AssetProvenance, value: AssetProvenance["seed"]): void {
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      target.seed = value;
    }
    return;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0 && !isSecretLikeValue(trimmed)) {
      target.seed = trimmed;
    }
  }
}

function sanitizeSettings(settings: AssetProvenance["settings"]): AssetProvenance["settings"] | undefined {
  if (!settings) {
    return undefined;
  }

  const sanitized: Record<string, AssetProvenanceSettingValue> = {};
  for (const [rawKey, rawValue] of Object.entries(settings)) {
    const key = rawKey.trim();
    if (key.length === 0 || isSecretLikeKey(key) || isSecretLikeSettingValue(rawValue)) {
      continue;
    }

    if (typeof rawValue === "string") {
      const value = rawValue.trim();
      if (value.length > 0) {
        sanitized[key] = value;
      }
    } else if (typeof rawValue === "number") {
      if (Number.isFinite(rawValue)) {
        sanitized[key] = rawValue;
      }
    } else if (typeof rawValue === "boolean") {
      sanitized[key] = rawValue;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function isSecretLikeKey(value: string): boolean {
  return secretKeyPattern.test(value);
}

function isSecretLikeSettingValue(value: AssetProvenanceSettingValue): boolean {
  return typeof value === "string" && isSecretLikeValue(value);
}

function isSecretLikeValue(value: string): boolean {
  return secretValuePatterns.some((pattern) => pattern.test(value.trim()));
}

function hasProvenanceDetails(provenance: AssetProvenance): boolean {
  return (
    provenance.origin !== "unknown" ||
    provenance.provider !== undefined ||
    provenance.model !== undefined ||
    provenance.prompt !== undefined ||
    provenance.negativePrompt !== undefined ||
    provenance.seed !== undefined ||
    provenance.sourceImage !== undefined ||
    provenance.generatedAt !== undefined ||
    provenance.settings !== undefined ||
    provenance.postProcessing !== undefined
  );
}
