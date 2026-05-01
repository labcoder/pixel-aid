import type { PixelAssetManifest, Rect, SpriteFrame } from "@pixelaid/shared";
import type { EngineExportBundle, EngineExportWarning } from "./engineTypes";
import { collectCommonEngineWarnings } from "./engineWarnings";

export type TexturePackerFrame = {
  frame: Rect;
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: Rect;
  sourceSize: { w: number; h: number };
  pivot: { x: number; y: number };
  duration: number;
};

export type TexturePackerAtlas = {
  frames: Record<string, TexturePackerFrame>;
  meta: {
    app: string;
    version: string;
    image: string;
    format: "RGBA8888";
    size: { w: number; h: number };
    scale: "1";
    pixelAid: {
      margin: number;
      spacing: number;
      extrude: number;
      animations: string[];
      palette: string[];
      notes: string[];
    };
  };
};

export type TexturePackerAtlasOptions = {
  imageFile?: string;
  atlasName?: string;
  trimSourceRects?: boolean;
};

export function createTexturePackerAtlasExport(
  manifest: PixelAssetManifest,
  options: TexturePackerAtlasOptions = {}
): EngineExportBundle {
  const imageFile = options.imageFile ?? manifest.meta.image;
  const atlasName = options.atlasName ?? stripImageExtension(baseFileName(imageFile));
  const atlas = createTexturePackerAtlas(manifest, {
    imageFile,
    ...(options.trimSourceRects !== undefined ? { trimSourceRects: options.trimSourceRects } : {})
  });

  return {
    files: [
      {
        path: `texturepacker/${atlasName}.json`,
        kind: "json",
        contents: atlas
      },
      {
        path: "texturepacker/README.md",
        kind: "text",
        contents: createTexturePackerReadme(imageFile, atlasName)
      }
    ],
    warnings: createTexturePackerWarnings(manifest, options)
  };
}

export function createTexturePackerAtlas(
  manifest: PixelAssetManifest,
  options: TexturePackerAtlasOptions = {}
): TexturePackerAtlas {
  const imageFile = options.imageFile ?? manifest.meta.image;

  return {
    frames: Object.fromEntries(manifest.frames.map((frame) => [frame.name, createTexturePackerFrame(frame, options)])),
    meta: {
      app: manifest.meta.app,
      version: manifest.meta.version,
      image: imageFile,
      format: "RGBA8888",
      size: { w: manifest.sheet.width, h: manifest.sheet.height },
      scale: "1",
      pixelAid: {
        margin: manifest.sheet.margin,
        spacing: manifest.sheet.spacing,
        extrude: manifest.sheet.extrude,
        animations: Object.keys(manifest.animations),
        palette: [...manifest.meta.palette],
        notes: [
          "TexturePacker JSON Hash companion generated from the PixelAid manifest.",
          "PixelAid manifest remains authoritative for anchors, hitboxes, provenance, and cleanup diagnostics."
        ]
      }
    }
  };
}

function createTexturePackerFrame(frame: SpriteFrame, options: TexturePackerAtlasOptions): TexturePackerFrame {
  const trim = options.trimSourceRects && isFrameLocalSourceRect(frame.sourceRect, frame.rect);
  const sourceSize = { w: frame.rect.w, h: frame.rect.h };
  const spriteSourceSize = trim ? { ...frame.sourceRect! } : { x: 0, y: 0, w: frame.rect.w, h: frame.rect.h };
  const atlasFrame = trim
    ? {
        x: frame.rect.x + spriteSourceSize.x,
        y: frame.rect.y + spriteSourceSize.y,
        w: spriteSourceSize.w,
        h: spriteSourceSize.h
      }
    : { ...frame.rect };

  return {
    frame: atlasFrame,
    rotated: false,
    trimmed: trim === true,
    spriteSourceSize,
    sourceSize,
    pivot: {
      x: roundRatio(frame.pivot.x, frame.rect.w),
      y: roundRatio(frame.pivot.y, frame.rect.h)
    },
    duration: frame.durationMs
  };
}

function createTexturePackerWarnings(
  manifest: PixelAssetManifest,
  options: TexturePackerAtlasOptions
): EngineExportWarning[] {
  const warnings = [...collectCommonEngineWarnings(manifest, "texturepacker")];

  if (manifest.frames.some((frame) => frame.sourceRect !== undefined) && options.trimSourceRects !== true) {
    warnings.push({
      target: "texturepacker",
      code: "engine-texturepacker-source-rect-trim-disabled",
      severity: "info",
      message:
        "Frame source rectangles are retained in the PixelAid manifest; TexturePacker trim metadata is disabled for this export."
    });
  }

  if (manifest.frames.some((frame) => (frame.anchors?.length ?? 0) > 0)) {
    warnings.push({
      target: "texturepacker",
      code: "engine-texturepacker-anchors-generic-only",
      severity: "info",
      message: "TexturePacker JSON Hash has one pivot field; named PixelAid anchors remain in the generic manifest."
    });
  }

  if (manifest.frames.some((frame) => (frame.boxes?.length ?? 0) > 0)) {
    warnings.push({
      target: "texturepacker",
      code: "engine-texturepacker-hitboxes-generic-only",
      severity: "info",
      message: "TexturePacker JSON Hash does not define collision, hurtbox, or hitbox rectangles; keep the PixelAid manifest."
    });
  }

  return warnings;
}

function createTexturePackerReadme(imageFile: string, atlasName: string): string {
  return [
    "# TexturePacker-Compatible Atlas",
    "",
    `Image: \`${imageFile}\``,
    `JSON Hash atlas: \`texturepacker/${atlasName}.json\``,
    "",
    "- Use nearest/point filtering for pixel-art textures.",
    "- Frame rectangles, source sizes, pivots, and frame durations are exported in TexturePacker JSON Hash style.",
    "- PixelAid-specific anchors, hitboxes, cleanup diagnostics, palette provenance, and engine warnings remain in the generic manifest.",
    "- `meta.pixelAid.extrude` records the requested extrusion setting; logical frame rects do not include duplicated edge pixels.",
    ""
  ].join("\n");
}

function isFrameLocalSourceRect(sourceRect: Rect | undefined, frameRect: Rect): sourceRect is Rect {
  if (!sourceRect) {
    return false;
  }

  return (
    sourceRect.x >= 0 &&
    sourceRect.y >= 0 &&
    sourceRect.w >= 1 &&
    sourceRect.h >= 1 &&
    sourceRect.x + sourceRect.w <= frameRect.w &&
    sourceRect.y + sourceRect.h <= frameRect.h
  );
}

function baseFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").filter(Boolean).at(-1);
  return fileName && fileName.length > 0 ? fileName : "atlas";
}

function stripImageExtension(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension.length > 0 ? withoutExtension : "atlas";
}

function roundRatio(value: number, size: number): number {
  return Number((value / Math.max(1, size)).toFixed(6));
}
