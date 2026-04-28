import type { PixelAssetManifest, SpriteAnimation } from "@pixelaid/shared";
import type { EngineExportBundle } from "./engineTypes";
import { collectCommonEngineWarnings } from "./engineWarnings";

type PhaserFrame = {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: false;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  pivot: { x: number; y: number };
  duration: number;
};

type PhaserAnimationFrame = {
  key: string;
  frame: string;
  duration: number;
};

type PhaserAnimation = {
  key: string;
  frames: PhaserAnimationFrame[];
  frameRate?: number;
  repeat: number;
  yoyo: boolean;
};

export type PhaserAtlas = {
  frames: Record<string, PhaserFrame>;
  animations: PhaserAnimation[];
  meta: {
    app: string;
    version: string;
    image: string;
    texture: string;
    size: { w: number; h: number };
    scale: "1";
  };
};

export function createPhaserAtlasExport(
  manifest: PixelAssetManifest,
  imageFile = manifest.meta.image
): EngineExportBundle {
  const imageBase = stripImageExtension(baseFileName(imageFile));

  return {
    files: [
      {
        path: `phaser/${imageBase}.json`,
        kind: "json",
        contents: createPhaserAtlas(manifest, imageFile, imageBase)
      },
      {
        path: "phaser/README.md",
        kind: "text",
        contents: createPhaserReadme(imageFile, imageBase)
      }
    ],
    warnings: collectCommonEngineWarnings(manifest, "phaser")
  };
}

function createPhaserAtlas(manifest: PixelAssetManifest, imageFile: string, textureKey: string): PhaserAtlas {
  return {
    frames: Object.fromEntries(
      manifest.frames.map((frame) => [
        frame.name,
        {
          frame: { ...frame.rect },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: frame.rect.w, h: frame.rect.h },
          sourceSize: { w: frame.rect.w, h: frame.rect.h },
          pivot: {
            x: roundRatio(frame.pivot.x, frame.rect.w),
            y: roundRatio(frame.pivot.y, frame.rect.h)
          },
          duration: frame.durationMs
        }
      ])
    ),
    animations: createPhaserAnimations(manifest, textureKey),
    meta: {
      app: manifest.meta.app,
      version: manifest.meta.version,
      image: imageFile,
      texture: textureKey,
      size: { w: manifest.sheet.width, h: manifest.sheet.height },
      scale: "1"
    }
  };
}

function createPhaserAnimations(manifest: PixelAssetManifest, textureKey: string): PhaserAnimation[] {
  const durations = new Map(manifest.frames.map((frame) => [frame.name, frame.durationMs]));

  return Object.entries(manifest.animations).map(([key, animation]) => {
    const result: PhaserAnimation = {
      key,
      frames: orderFrames(animation).map((frameName) => ({
        key: textureKey,
        frame: frameName,
        duration: durations.get(frameName) ?? animation.durationMs ?? 120
      })),
      repeat: animation.loop ? -1 : 0,
      yoyo: animation.direction === "ping-pong"
    };

    if (animation.fps !== undefined) {
      result.frameRate = animation.fps;
    }

    return result;
  });
}

function orderFrames(animation: SpriteAnimation): string[] {
  if (animation.direction === "reverse") {
    return [...animation.frames].reverse();
  }
  return [...animation.frames];
}

function createPhaserReadme(imageFile: string, textureKey: string): string {
  return [
    "# Phaser Import",
    "",
    `Texture key: \`${textureKey}\``,
    `Image: \`${imageFile}\``,
    `Atlas JSON: \`phaser/${textureKey}.json\``,
    "",
    "- Set `pixelArt: true` in the Phaser game config or use nearest-neighbor texture settings.",
    "- Load the PNG and atlas JSON with `this.load.atlas(...)`.",
    "- Use the JSON `animations` array as source data for `this.anims.create(...)`.",
    "- Keep the generic PixelAid manifest for palette, source, operation provenance, and export validation.",
    ""
  ].join("\n");
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
