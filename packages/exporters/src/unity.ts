import type { Pivot, PixelAssetManifest, Rect } from "@pixelaid/shared";
import type { EngineExportBundle, EngineExportWarning } from "./engineTypes";
import { collectCommonEngineWarnings } from "./engineWarnings";

export type UnityImportExportOptions = {
  pixelsPerUnit?: number;
};

export type UnityExportOptions = UnityImportExportOptions;

export function createUnityImportExport(
  manifest: PixelAssetManifest,
  options: UnityImportExportOptions = {}
): EngineExportBundle {
  return {
    files: [
      { path: "unity/README.md", kind: "text", contents: createUnityImportReadme(manifest, options) },
      {
        path: "unity/Editor/PixelAidUnityImporter.cs",
        kind: "text",
        contents: createUnityImporterScript(manifest, options)
      },
      {
        path: "unity/import.recipe.json",
        kind: "json",
        contents: createUnityImportRecipe(manifest, options)
      }
    ],
    warnings: [...collectCommonEngineWarnings(manifest, "unity"), ...collectUnityWarnings(manifest)]
  };
}

export function createUnityExport(
  manifest: PixelAssetManifest,
  options: UnityImportExportOptions = {}
): EngineExportBundle {
  return createUnityImportExport(manifest, options);
}

export function createUnityImportReadme(
  manifest: PixelAssetManifest,
  options: UnityImportExportOptions = {}
): string {
  const pixelsPerUnit = resolvePixelsPerUnit(manifest, options);

  return [
    "# Unity Import",
    "",
    `Image: \`${manifest.meta.image}\``,
    `Sheet: ${manifest.sheet.width}x${manifest.sheet.height}px`,
    `Frames: ${manifest.frames.length}`,
    "",
    "## Files",
    "",
    "- `unity/Editor/PixelAidUnityImporter.cs`: Unity Editor helper generated from the PixelAid manifest.",
    "- The generic PixelAid manifest remains the source of truth for pivots, frame rects, palette, and provenance.",
    "",
    "## Import Steps",
    "",
    "- Copy the PNG, generic manifest, and `unity/Editor/PixelAidUnityImporter.cs` into your Unity project.",
    "- Select the PNG sheet asset in Unity.",
    "- Run `Tools > PixelAid > Import Selected Sprite Sheet`.",
    "- Texture Type: Sprite (2D and UI).",
    "- Sprite Mode: Multiple.",
    "- Filter Mode: Point.",
    "- Compression: None.",
    "- Mip Maps: Off.",
    `- Pixels Per Unit: ${pixelsPerUnit}. The helper sets this value; adjust it if your project uses a different world scale.`,
    "",
    "## Animation Guidance",
    "",
    "- The helper slices sprites and applies custom pivots, but it does not generate AnimationClip assets.",
    "- Use the embedded animation log and the generic manifest `durationMs`, `fps`, `loop`, and `direction` fields when creating clips.",
    "- Reverse and ping-pong playback should be set up in project animation controllers or scripts.",
    "",
    "## Unity Metadata",
    "",
    "- Do not generate or commit Unity `.meta` files from PixelAid; let your Unity editor version create them.",
    ""
  ].join("\n");
}

export function createUnityImporterScript(
  manifest: PixelAssetManifest,
  options: UnityImportExportOptions = {}
): string {
  const pixelsPerUnit = resolvePixelsPerUnit(manifest, options);
  const frameLines = manifest.frames.map((frame) => `        ${createFrameDataLine(manifest, frame)},`);
  const animationLines = Object.entries(manifest.animations)
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .map(([name, animation]) => `        ${createAnimationDataLine(name, animation)},`);

  return [
    "using System;",
    "using UnityEditor;",
    "using UnityEngine;",
    "",
    "public static class PixelAidUnityImporter",
    "{",
    `    private const string SourceImageName = ${toCSharpString(manifest.meta.image)};`,
    `    private const int SheetWidth = ${manifest.sheet.width};`,
    `    private const int SheetHeight = ${manifest.sheet.height};`,
    `    private const float PixelsPerUnit = ${toCSharpFloat(pixelsPerUnit)};`,
    "",
    "    private static readonly PixelAidFrameData[] Frames =",
    "    {",
    ...frameLines,
    "    };",
    "",
    "    private static readonly PixelAidAnimationData[] Animations =",
    "    {",
    ...animationLines,
    "    };",
    "",
    "    [MenuItem(\"Tools/PixelAid/Import Selected Sprite Sheet\")]",
    "    public static void ImportSelectedSpriteSheet()",
    "    {",
    "        var texture = Selection.activeObject as Texture2D;",
    "        if (texture == null)",
    "        {",
    "            Debug.LogError(\"Select the PixelAid sheet PNG before running the importer.\");",
    "            return;",
    "        }",
    "",
    "        var texturePath = AssetDatabase.GetAssetPath(texture);",
    "        var importer = AssetImporter.GetAtPath(texturePath) as TextureImporter;",
    "        if (importer == null)",
    "        {",
    "            Debug.LogError(\"Selected asset is not a texture importer target.\");",
    "            return;",
    "        }",
    "",
    "        importer.textureType = TextureImporterType.Sprite;",
    "        importer.spriteImportMode = SpriteImportMode.Multiple;",
    "        importer.filterMode = FilterMode.Point;",
    "        importer.mipmapEnabled = false;",
    "        importer.textureCompression = TextureImporterCompression.Uncompressed;",
    "        importer.spritePixelsPerUnit = PixelsPerUnit;",
    "",
    "        var metadata = new SpriteMetaData[Frames.Length];",
    "        for (var i = 0; i < Frames.Length; i++)",
    "        {",
    "            var frame = Frames[i];",
    "            metadata[i] = new SpriteMetaData",
    "            {",
    "                name = frame.Name,",
    "                rect = frame.Rect,",
    "                alignment = (int)SpriteAlignment.Custom,",
    "                pivot = frame.Pivot",
    "            };",
    "        }",
    "",
    "        importer.spritesheet = metadata;",
    "        EditorUtility.SetDirty(importer);",
    "        importer.SaveAndReimport();",
    "        Debug.Log($\"PixelAid imported {Frames.Length} sprite(s) from {SourceImageName} ({SheetWidth}x{SheetHeight}) at {PixelsPerUnit} pixels per unit.\");",
    "        LogAnimationGuidance();",
    "    }",
    "",
    "    [MenuItem(\"Tools/PixelAid/Log Animation Guidance\")]",
    "    public static void LogAnimationGuidance()",
    "    {",
    "        if (Animations.Length == 0)",
    "        {",
    "            Debug.Log(\"PixelAid manifest has no animation tags. Create clips manually from imported sprites if needed.\");",
    "            return;",
    "        }",
    "",
    "        foreach (var animation in Animations)",
    "        {",
    "            Debug.Log($\"PixelAid animation '{animation.Name}': {animation.FrameNames.Length} frame(s), fps {animation.Fps}, loop {animation.Loop}, direction {animation.Direction}. Use frame durationMs values when creating AnimationClip assets.\");",
    "        }",
    "    }",
    "",
    "    private readonly struct PixelAidFrameData",
    "    {",
    "        public readonly string Name;",
    "        public readonly Rect Rect;",
    "        public readonly Vector2 Pivot;",
    "        public readonly int DurationMs;",
    "",
    "        public PixelAidFrameData(string name, Rect rect, Vector2 pivot, int durationMs)",
    "        {",
    "            Name = name;",
    "            Rect = rect;",
    "            Pivot = pivot;",
    "            DurationMs = durationMs;",
    "        }",
    "    }",
    "",
    "    private readonly struct PixelAidAnimationData",
    "    {",
    "        public readonly string Name;",
    "        public readonly string[] FrameNames;",
    "        public readonly float Fps;",
    "        public readonly bool Loop;",
    "        public readonly string Direction;",
    "",
    "        public PixelAidAnimationData(string name, string[] frameNames, float fps, bool loop, string direction)",
    "        {",
    "            Name = name;",
    "            FrameNames = frameNames;",
    "            Fps = fps;",
    "            Loop = loop;",
    "            Direction = direction;",
    "        }",
    "    }",
    "}",
    ""
  ].join("\n");
}

export function createUnityImportRecipe(
  manifest: PixelAssetManifest,
  options: UnityImportExportOptions = {}
): Record<string, unknown> {
  const pixelsPerUnit = resolvePixelsPerUnit(manifest, options);

  return {
    app: manifest.meta.app,
    version: manifest.meta.version,
    engine: "unity",
    image: manifest.meta.image,
    helper: "unity/Editor/PixelAidUnityImporter.cs",
    textureSettings: {
      textureType: "Sprite (2D and UI)",
      spriteMode: "Multiple",
      filterMode: "Point",
      compression: "None",
      mipMaps: false,
      pixelsPerUnit
    },
    sheet: {
      width: manifest.sheet.width,
      height: manifest.sheet.height,
      frameWidth: manifest.sheet.frameWidth,
      frameHeight: manifest.sheet.frameHeight,
      margin: manifest.sheet.margin,
      spacing: manifest.sheet.spacing,
      extrude: manifest.sheet.extrude
    },
    frames: manifest.frames.map((frame) => ({
      name: frame.name,
      rect: { ...frame.rect },
      unityRect: toUnityRect(frame.rect, manifest.sheet.height),
      pivot: { ...frame.pivot },
      pivotNormalized: toUnityPivot(frame.pivot, frame.rect),
      durationMs: frame.durationMs
    })),
    animations: Object.entries(manifest.animations)
      .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
      .map(([name, animation]) => ({
        name,
        frames: [...animation.frames],
        ...(animation.fps !== undefined ? { fps: animation.fps } : {}),
        ...(animation.durationMs !== undefined ? { durationMs: animation.durationMs } : {}),
        loop: animation.loop,
        direction: animation.direction ?? "forward"
      })),
    unsupportedMetadata: [
      "AnimationClip assets are not generated by PixelAid yet",
      "reverse or ping-pong playback must be configured in Unity animation controllers or scripts"
    ]
  };
}

export function toUnityPivot(pivot: Pivot, rect: Pick<Rect, "w" | "h">): { x: number; y: number } {
  return {
    x: roundFloat(pivot.x / Math.max(1, rect.w)),
    y: roundFloat(1 - pivot.y / Math.max(1, rect.h))
  };
}

function collectUnityWarnings(manifest: PixelAssetManifest): EngineExportWarning[] {
  const warnings: EngineExportWarning[] = [];

  if (Object.values(manifest.animations).some((animation) => animation.direction && animation.direction !== "forward")) {
    warnings.push({
      target: "unity",
      code: "engine-unity-animation-direction",
      severity: "warning",
      message:
        "Unity helper imports frame slices and pivots; reverse or ping-pong playback still needs AnimationClip setup."
    });
  }

  return warnings;
}

function createFrameDataLine(manifest: PixelAssetManifest, frame: PixelAssetManifest["frames"][number]): string {
  const unityRect = toUnityRect(frame.rect, manifest.sheet.height);
  const pivot = toUnityPivot(frame.pivot, frame.rect);

  return [
    "new PixelAidFrameData(",
    toCSharpString(frame.name),
    `, new Rect(${toCSharpFloat(unityRect.x)}, ${toCSharpFloat(unityRect.y)}, ${toCSharpFloat(unityRect.w)}, ${toCSharpFloat(unityRect.h)})`,
    `, new Vector2(${toCSharpFloat(pivot.x)}, ${toCSharpFloat(pivot.y)})`,
    `, ${Math.round(frame.durationMs)}`,
    ")"
  ].join("");
}

function createAnimationDataLine(
  name: string,
  animation: PixelAssetManifest["animations"][string]
): string {
  const fps = animation.fps ?? (animation.durationMs ? 1000 / animation.durationMs : 0);
  const direction = animation.direction ?? "forward";
  const frameNames =
    animation.frames.length === 0 ? "Array.Empty<string>()" : `new[] { ${animation.frames.map(toCSharpString).join(", ")} }`;

  return [
    "new PixelAidAnimationData(",
    toCSharpString(name),
    `, ${frameNames}`,
    `, ${toCSharpFloat(fps)}`,
    `, ${animation.loop ? "true" : "false"}`,
    `, ${toCSharpString(direction)}`,
    ")"
  ].join("");
}

function toUnityRect(rect: Rect, sheetHeight: number): Rect {
  return {
    x: rect.x,
    y: sheetHeight - rect.y - rect.h,
    w: rect.w,
    h: rect.h
  };
}

function resolvePixelsPerUnit(manifest: PixelAssetManifest, options: UnityImportExportOptions): number {
  const requested = options.pixelsPerUnit;
  if (requested !== undefined && Number.isFinite(requested) && requested > 0) {
    return requested;
  }

  return Math.max(1, manifest.sheet.frameHeight);
}

function toCSharpString(value: string): string {
  return JSON.stringify(value);
}

function toCSharpFloat(value: number): string {
  return `${roundFloat(value)}f`;
}

function roundFloat(value: number): number {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}
