import type { PixelAssetManifest, Pivot, Rect, SpriteAnimation, SpriteFrame } from "@pixelaid/shared";
import { PIXELAID_APP_NAME } from "@pixelaid/shared";
import { normalizePaletteColors } from "./paletteFiles";
import type { EditorWorkflowImport, EditorWorkflowWarning } from "./aseprite";

type PixelAidAnimationDirection = NonNullable<SpriteAnimation["direction"]>;

export type PixeloramaFrameMetadata = {
  name?: string;
  duration?: number;
  durationMs?: number;
  rect?: Rect;
  pivot?: Pivot;
  tags?: string[];
};

export type PixeloramaAnimationTag = {
  name: string;
  from?: number;
  to?: number;
  frames?: number[];
  loop?: boolean;
  direction?: "forward" | "reverse" | "pingpong" | "ping-pong" | "hold" | string;
  frameDurationsMs?: number[];
};

export type PixeloramaPaletteMetadata = {
  name?: string;
  colors: string[];
};

export type PixeloramaProjectMetadata = {
  width?: number;
  height?: number;
  size?: { width?: number; height?: number; w?: number; h?: number };
  frameWidth?: number;
  frameHeight?: number;
  frames?: PixeloramaFrameMetadata[];
  animation_tags?: PixeloramaAnimationTag[];
  tags?: PixeloramaAnimationTag[];
  animations?: Record<string, PixeloramaAnimationTag | number[]>;
  palette?: string[] | PixeloramaPaletteMetadata;
  palettes?: PixeloramaPaletteMetadata[];
};

export type PixeloramaCompanionMetadata = {
  app: string;
  format: "pixelorama-companion";
  image: string;
  size: { width: number; height: number };
  frameWidth: number;
  frameHeight: number;
  frames: Array<{
    name: string;
    rect: Rect;
    pivot: Pivot;
    durationMs: number;
    tags?: string[];
  }>;
  animation_tags: Array<{
    name: string;
    from: number;
    to: number;
    loop: boolean;
    direction: NonNullable<SpriteAnimation["direction"]>;
    frameDurationsMs?: number[];
  }>;
  palettes: PixeloramaPaletteMetadata[];
};

export type PixeloramaCompanionExport = {
  json: PixeloramaCompanionMetadata;
  warnings: EditorWorkflowWarning[];
};

const DEFAULT_FRAME_DURATION_MS = 120;

export function importPixeloramaWorkflow(input: PixeloramaProjectMetadata): EditorWorkflowImport {
  const warnings: EditorWorkflowWarning[] = [];
  const frames = createPixeloramaFrames(input, warnings);
  const tags = createPixeloramaTags(input);

  return {
    frames: applyTagsToFrames(frames, tags),
    animations: createPixeloramaAnimations(frames, tags),
    palette: extractPixeloramaPalette(input),
    warnings
  };
}

export function createPixeloramaCompanionExport(manifest: PixelAssetManifest): PixeloramaCompanionExport {
  const warnings: EditorWorkflowWarning[] = [];
  const frameIndexByName = new Map(manifest.frames.map((frame, index) => [frame.name, index]));

  return {
    json: {
      app: PIXELAID_APP_NAME,
      format: "pixelorama-companion",
      image: manifest.meta.image,
      size: { width: manifest.sheet.width, height: manifest.sheet.height },
      frameWidth: manifest.sheet.frameWidth,
      frameHeight: manifest.sheet.frameHeight,
      frames: manifest.frames.map((frame) => ({
        name: frame.name,
        rect: copyRect(frame.rect),
        pivot: { ...frame.pivot },
        durationMs: frame.durationMs,
        ...(frameTags(frame, manifest.animations).length > 0 ? { tags: frameTags(frame, manifest.animations) } : {})
      })),
      animation_tags: createPixeloramaCompanionTags(manifest, frameIndexByName, warnings),
      palettes: [
        {
          name: "PixelAid Palette",
          colors: normalizePaletteColors(manifest.meta.palette)
        }
      ]
    },
    warnings
  };
}

function createPixeloramaFrames(
  input: PixeloramaProjectMetadata,
  warnings: EditorWorkflowWarning[]
): SpriteFrame[] {
  const sourceFrames = input.frames ?? [];
  const sheetSize = resolveSheetSize(input);
  const frameWidth = input.frameWidth ?? sourceFrames[0]?.rect?.w ?? sheetSize.width;
  const frameHeight = input.frameHeight ?? sourceFrames[0]?.rect?.h ?? sheetSize.height;
  const columns = Math.max(1, Math.floor(sheetSize.width / Math.max(1, frameWidth)));

  if (sourceFrames.length === 0) {
    warnings.push({
      code: "pixelorama-empty-frames",
      severity: "warning",
      message: "Pixelorama metadata did not include frames; PixelAid created no frame metadata."
    });
  }

  return sourceFrames.map((frame, index) => {
    const rect = frame.rect ?? {
      x: (index % columns) * frameWidth,
      y: Math.floor(index / columns) * frameHeight,
      w: frameWidth,
      h: frameHeight
    };

    return {
      name: frame.name ?? `frame_${index.toString().padStart(3, "0")}`,
      rect: copyRect(rect),
      pivot: frame.pivot ? { ...frame.pivot } : { x: Math.floor(rect.w / 2), y: rect.h },
      durationMs: normalizeDurationMs(frame.durationMs ?? frame.duration),
      ...(frame.tags && frame.tags.length > 0 ? { tags: [...frame.tags] } : {})
    };
  });
}

function createPixeloramaTags(input: PixeloramaProjectMetadata): PixeloramaAnimationTag[] {
  const directTags = input.animation_tags ?? input.tags ?? [];
  const animationTags = Object.entries(input.animations ?? {}).map(([name, value]) => {
    if (Array.isArray(value)) {
      return { name, frames: value };
    }
    return { ...value, name: value.name ?? name };
  });

  return [...directTags, ...animationTags];
}

function applyTagsToFrames(frames: SpriteFrame[], tags: readonly PixeloramaAnimationTag[]): SpriteFrame[] {
  return frames.map((frame, index) => {
    const tagNames = tags
      .filter((tag) => resolveTagIndices(tag, frames.length).includes(index))
      .map((tag) => tag.name);
    return tagNames.length > 0 ? { ...frame, tags: mergeTags(frame.tags, tagNames) } : frame;
  });
}

function createPixeloramaAnimations(
  frames: readonly SpriteFrame[],
  tags: readonly PixeloramaAnimationTag[]
): Record<string, SpriteAnimation> {
  const animations: Record<string, SpriteAnimation> = {};

  for (const tag of tags) {
    const indices = resolveTagIndices(tag, frames.length);
    const selectedFrames = indices.map((index) => frames[index]).filter((frame): frame is SpriteFrame => frame !== undefined);
    if (selectedFrames.length === 0) {
      continue;
    }

    animations[tag.name] = {
      frames: selectedFrames.map((frame) => frame.name),
      loop: tag.loop ?? true,
      direction: mapPixeloramaDirection(tag.direction),
      frameDurationsMs: tag.frameDurationsMs ?? selectedFrames.map((frame) => frame.durationMs)
    };
  }

  return animations;
}

function createPixeloramaCompanionTags(
  manifest: PixelAssetManifest,
  frameIndexByName: ReadonlyMap<string, number>,
  warnings: EditorWorkflowWarning[]
): PixeloramaCompanionMetadata["animation_tags"] {
  return Object.entries(manifest.animations).flatMap(([name, animation]) => {
    const indices = animation.frames
      .map((frameName) => frameIndexByName.get(frameName))
      .filter((index): index is number => index !== undefined);

    if (indices.length === 0) {
      warnings.push({
        code: "pixelorama-empty-animation",
        severity: "warning",
        message: `Animation ${name} has no frames that exist in the manifest and was omitted.`
      });
      return [];
    }

    const from = Math.min(...indices);
    const to = Math.max(...indices);
    const expectedLength = to - from + 1;
    if (indices.length !== expectedLength || !indices.every((index, offset) => index === from + offset)) {
      warnings.push({
        code: "pixelorama-non-contiguous-animation",
        severity: "warning",
        message: `Animation ${name} is non-contiguous; Pixelorama companion metadata stores the containing range.`
      });
    }

    return [
      {
        name,
        from,
        to: animation.direction === "hold" ? from : to,
        loop: animation.loop,
        direction: animation.direction ?? "forward",
        ...(animation.frameDurationsMs ? { frameDurationsMs: [...animation.frameDurationsMs] } : {})
      }
    ];
  });
}

function resolveTagIndices(tag: PixeloramaAnimationTag, frameCount: number): number[] {
  if (tag.frames && tag.frames.length > 0) {
    if (tag.frames.length === 2) {
      return range(tag.frames[0] ?? 0, tag.frames[1] ?? 0, frameCount);
    }
    return tag.frames.filter((index) => Number.isInteger(index) && index >= 0 && index < frameCount);
  }

  if (tag.from !== undefined || tag.to !== undefined) {
    return range(tag.from ?? 0, tag.to ?? tag.from ?? 0, frameCount);
  }

  return [];
}

function range(start: number, end: number, frameCount: number): number[] {
  const from = clampIndex(Math.min(start, end), frameCount);
  const to = clampIndex(Math.max(start, end), frameCount);
  const result: number[] = [];
  for (let index = from; index <= to; index += 1) {
    result.push(index);
  }
  return result;
}

function resolveSheetSize(input: PixeloramaProjectMetadata): { width: number; height: number } {
  return {
    width: input.size?.width ?? input.size?.w ?? input.width ?? input.frameWidth ?? 1,
    height: input.size?.height ?? input.size?.h ?? input.height ?? input.frameHeight ?? 1
  };
}

function extractPixeloramaPalette(input: PixeloramaProjectMetadata): string[] {
  if (input.palettes && input.palettes.length > 0) {
    return normalizePaletteColors(input.palettes[0]?.colors ?? []);
  }

  if (Array.isArray(input.palette)) {
    return normalizePaletteColors(input.palette);
  }

  return normalizePaletteColors(input.palette?.colors ?? []);
}

function frameTags(frame: SpriteFrame, animations: PixelAssetManifest["animations"]): string[] {
  const explicit = frame.tags ?? [];
  const derived = Object.entries(animations)
    .filter(([, animation]) => animation.frames.includes(frame.name))
    .map(([name]) => name);
  return mergeTags(explicit, derived);
}

function mergeTags(left: readonly string[] | undefined, right: readonly string[]): string[] {
  return [...new Set([...(left ?? []), ...right])];
}

function mapPixeloramaDirection(direction: PixeloramaAnimationTag["direction"]): PixelAidAnimationDirection {
  if (direction === "reverse") {
    return "reverse";
  }
  if (direction === "pingpong" || direction === "ping-pong") {
    return "ping-pong";
  }
  if (direction === "hold") {
    return "hold";
  }
  return "forward";
}

function normalizeDurationMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_FRAME_DURATION_MS;
  }

  return Math.round(value <= 10 ? value * 1000 : value);
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(Math.max(0, index), length - 1);
}

function copyRect(rect: Rect): Rect {
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
}
