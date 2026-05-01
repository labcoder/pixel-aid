import type { PixelAssetManifest, Pivot, Rect, SpriteAnimation, SpriteFrame } from "@pixelaid/shared";
import { PIXELAID_APP_NAME, PIXELAID_VERSION } from "@pixelaid/shared";
import { normalizePaletteColors } from "./paletteFiles";

export type EditorWorkflowWarning = {
  code: string;
  severity: "info" | "warning";
  message: string;
};

export type EditorWorkflowImport = {
  frames: SpriteFrame[];
  animations: Record<string, SpriteAnimation>;
  palette: string[];
  warnings: EditorWorkflowWarning[];
};

export type AsepriteRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type AsepriteFrameData = {
  frame: AsepriteRect;
  rotated?: boolean;
  trimmed?: boolean;
  spriteSourceSize?: AsepriteRect;
  sourceSize?: { w: number; h: number };
  duration?: number;
};

export type AsepriteFrameEntry = AsepriteFrameData & {
  filename: string;
};

export type AsepriteFrameTag = {
  name: string;
  from: number;
  to: number;
  direction?: "forward" | "reverse" | "pingpong" | "pingpong_reverse" | string;
  color?: string;
};

export type AsepriteSliceKey = {
  frame: number;
  bounds: AsepriteRect;
  center?: AsepriteRect;
  pivot?: Pivot;
};

export type AsepriteSlice = {
  name: string;
  color?: string;
  keys: AsepriteSliceKey[];
};

export type AsepriteJson = {
  frames: Record<string, AsepriteFrameData> | AsepriteFrameEntry[];
  meta?: {
    app?: string;
    version?: string;
    image?: string;
    format?: string;
    size?: { w: number; h: number };
    scale?: string;
    frameTags?: AsepriteFrameTag[];
    slices?: AsepriteSlice[];
    palette?: unknown;
  };
};

export type AsepriteCompanionExport = {
  json: AsepriteJson;
  warnings: EditorWorkflowWarning[];
};

export type CreateAsepriteCompanionOptions = {
  imageFile?: string;
  pivotSliceColor?: string;
};

type IndexedAsepriteFrame = {
  filename: string;
  data: AsepriteFrameData;
};

type PixelAidAnimationDirection = NonNullable<SpriteAnimation["direction"]>;

const DEFAULT_FRAME_DURATION_MS = 120;

export function importAsepriteWorkflow(input: AsepriteJson): EditorWorkflowImport {
  const warnings: EditorWorkflowWarning[] = [];
  const entries = normalizeAsepriteFrames(input.frames);
  const tags = input.meta?.frameTags ?? [];
  const slices = input.meta?.slices ?? [];

  const frames = entries.map((entry, index) => {
    const name = sanitizeFrameName(entry.filename, index);
    if (entry.data.rotated) {
      warnings.push({
        code: "aseprite-rotated-frame",
        severity: "warning",
        message: `Frame ${name} is rotated in Aseprite JSON; PixelAid preserves the rect but does not rotate pixels.`
      });
    }

    const frameTags = tagNamesForFrame(index, tags);
    return {
      name,
      rect: copyRect(entry.data.frame),
      ...(entry.data.spriteSourceSize ? { sourceRect: copyRect(entry.data.spriteSourceSize) } : {}),
      pivot: resolveAsepritePivot(index, slices, entry.data),
      durationMs: normalizeDurationMs(entry.data.duration),
      ...(frameTags ? { tags: frameTags } : {})
    };
  });

  return {
    frames,
    animations: createAsepriteAnimations(frames, tags),
    palette: extractPalette(input.meta?.palette),
    warnings
  };
}

export function createAsepriteCompanionExport(
  manifest: PixelAssetManifest,
  options: CreateAsepriteCompanionOptions = {}
): AsepriteCompanionExport {
  const imageFile = options.imageFile ?? manifest.meta.image;
  const warnings: EditorWorkflowWarning[] = [];
  const frameIndexByName = new Map(manifest.frames.map((frame, index) => [frame.name, index]));

  return {
    json: {
      frames: Object.fromEntries(
        manifest.frames.map((frame) => [
          `${frame.name}.png`,
          {
            frame: copyRect(frame.rect),
            rotated: false,
            trimmed: false,
            spriteSourceSize: frame.sourceRect ? copyRect(frame.sourceRect) : { x: 0, y: 0, w: frame.rect.w, h: frame.rect.h },
            sourceSize: { w: frame.rect.w, h: frame.rect.h },
            duration: frame.durationMs
          }
        ])
      ),
      meta: {
        app: PIXELAID_APP_NAME,
        version: PIXELAID_VERSION,
        image: imageFile,
        format: "RGBA8888",
        size: { w: manifest.sheet.width, h: manifest.sheet.height },
        scale: "1",
        frameTags: createAsepriteFrameTags(manifest, frameIndexByName, warnings),
        slices: createAsepritePivotSlices(manifest.frames, options.pivotSliceColor ?? "#00ffff"),
        palette: normalizePaletteColors(manifest.meta.palette)
      }
    },
    warnings
  };
}

function normalizeAsepriteFrames(frames: AsepriteJson["frames"]): IndexedAsepriteFrame[] {
  if (Array.isArray(frames)) {
    return frames.map((frame) => ({
      filename: frame.filename,
      data: frame
    }));
  }

  return Object.entries(frames).map(([filename, data]) => ({
    filename,
    data
  }));
}

function createAsepriteAnimations(
  frames: SpriteFrame[],
  tags: readonly AsepriteFrameTag[]
): Record<string, SpriteAnimation> {
  const animations: Record<string, SpriteAnimation> = {};

  for (const tag of tags) {
    const start = clampIndex(Math.min(tag.from, tag.to), frames.length);
    const end = clampIndex(Math.max(tag.from, tag.to), frames.length);
    const selectedFrames = frames.slice(start, end + 1);
    if (selectedFrames.length === 0) {
      continue;
    }

    animations[tag.name] = {
      frames: selectedFrames.map((frame) => frame.name),
      loop: true,
      direction: mapAsepriteDirection(tag.direction),
      frameDurationsMs: selectedFrames.map((frame) => frame.durationMs)
    };
  }

  return animations;
}

function createAsepriteFrameTags(
  manifest: PixelAssetManifest,
  frameIndexByName: ReadonlyMap<string, number>,
  warnings: EditorWorkflowWarning[]
): AsepriteFrameTag[] {
  return Object.entries(manifest.animations).flatMap(([name, animation]) => {
    const indices = animation.frames
      .map((frameName) => frameIndexByName.get(frameName))
      .filter((index): index is number => index !== undefined);

    if (indices.length === 0) {
      warnings.push({
        code: "aseprite-empty-animation",
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
        code: "aseprite-non-contiguous-animation",
        severity: "warning",
        message: `Animation ${name} is non-contiguous; Aseprite frame tags can only store a from/to span.`
      });
    }

    if (animation.direction === "hold" && indices.length > 1) {
      warnings.push({
        code: "aseprite-hold-animation",
        severity: "info",
        message: `Animation ${name} uses hold playback; Aseprite JSON stores the first frame span and PixelAid companion metadata should remain authoritative.`
      });
    }

    return [
      {
        name,
        from,
        to: animation.direction === "hold" ? from : to,
        direction: mapPixelAidDirectionToAseprite(animation.direction)
      }
    ];
  });
}

function createAsepritePivotSlices(frames: readonly SpriteFrame[], color: string): AsepriteSlice[] {
  return frames.map((frame, index) => ({
    name: `${frame.name}_pivot`,
    color,
    keys: [
      {
        frame: index,
        bounds: copyRect(frame.rect),
        pivot: { ...frame.pivot }
      }
    ]
  }));
}

function resolveAsepritePivot(index: number, slices: readonly AsepriteSlice[], frame: AsepriteFrameData): Pivot {
  let candidate: AsepriteSliceKey | undefined;

  for (const slice of slices) {
    for (const key of slice.keys) {
      if (key.pivot && key.frame <= index && (!candidate || key.frame >= candidate.frame)) {
        candidate = key;
      }
    }
  }

  if (candidate?.pivot) {
    return { ...candidate.pivot };
  }

  return {
    x: Math.floor((frame.sourceSize?.w ?? frame.frame.w) / 2),
    y: frame.sourceSize?.h ?? frame.frame.h
  };
}

function tagNamesForFrame(index: number, tags: readonly AsepriteFrameTag[]): string[] | undefined {
  const names = tags
    .filter((tag) => index >= Math.min(tag.from, tag.to) && index <= Math.max(tag.from, tag.to))
    .map((tag) => tag.name);
  return names.length > 0 ? names : undefined;
}

function mapAsepriteDirection(direction: AsepriteFrameTag["direction"]): PixelAidAnimationDirection {
  if (direction === "reverse" || direction === "pingpong_reverse") {
    return "reverse";
  }
  if (direction === "pingpong") {
    return "ping-pong";
  }
  return "forward";
}

function mapPixelAidDirectionToAseprite(direction: SpriteAnimation["direction"]): NonNullable<AsepriteFrameTag["direction"]> {
  if (direction === "reverse") {
    return "reverse";
  }
  if (direction === "ping-pong") {
    return "pingpong";
  }
  return "forward";
}

function sanitizeFrameName(filename: string, index: number): string {
  const withoutPath = filename.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? `frame_${index}`;
  const withoutExtension = withoutPath.replace(/\.[^.]+$/, "");
  const sanitized = withoutExtension.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return sanitized.length > 0 ? sanitized : `frame_${index.toString().padStart(3, "0")}`;
}

function extractPalette(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizePaletteColors(
      value.flatMap((entry) => {
        if (typeof entry === "string") {
          return [entry];
        }
        if (isRecord(entry)) {
          const color = entry.color ?? entry.hex ?? entry.value;
          return typeof color === "string" ? [color] : [];
        }
        return [];
      })
    );
  }

  if (isRecord(value)) {
    const colors = value.colors ?? value.entries;
    return extractPalette(colors);
  }

  return [];
}

function normalizeDurationMs(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : DEFAULT_FRAME_DURATION_MS;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
