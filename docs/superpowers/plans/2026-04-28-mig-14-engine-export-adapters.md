# MIG-14 Engine Export Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-pass Godot, Unity, and Phaser export adapters that extend PixelAid's generic bundle without replacing the canonical manifest.

**Architecture:** Keep all engine adaptation pure and deterministic inside `packages/exporters`. The generic `PixelAssetManifest` remains the source of truth; engine adapters emit sidecar JSON, helper scripts, READMEs, and warning records. The web app only lets users select engine targets and adds those generated files to the existing ZIP bundle.

**Tech Stack:** TypeScript, Vitest, Vite/React, existing `fflate` bundle writer. No new dependencies.

---

## Current Baseline

- Worktree: `C:\dev\Mighty\pixel-aid\.worktrees\mig-14-engine-export-adapters`
- Branch: `codex/mig-14-engine-export-adapters`
- Base: `codex/pixelaid-roadmap-foundation` at `bac3db6`
- Baseline setup: `npm install` was required in this fresh worktree.
- Baseline verification after install:
  - `npm run test` passed across workspaces.
  - `npm run build` passed across workspaces.

## Scope Decisions

- Do not create Unity `.meta` files. Use an Editor helper script and import README instead.
- Do not create Godot `.tres` resources in the browser. Emit a GDScript/EditorScript helper and import README.
- Phaser gets deterministic JSON adapter output because frame/animation JSON is stable and dependency-free.
- Engine outputs are selected in the Export inspector. Initial defaults: Godot, Unity, and Phaser all selected so the new phase is visible immediately; the user can uncheck targets.
- Unsupported target limitations become validation warnings. They must not silently disappear.
- Keep generic bundle files unchanged: PNG, generic manifest, palette files, validation report, and frame sequence stay present.
- No new runtime, build, or license burden.

## File Structure

- `packages/exporters/src/engineTypes.ts`: shared engine target, file, warning, and bundle result contracts.
- `packages/exporters/src/engineWarnings.ts`: common unsupported-field warning helpers.
- `packages/exporters/src/exportValidation.ts`: accept extra warning/error issues from engine adapters.
- `packages/exporters/src/exportValidation.test.ts`: validation coverage for engine warnings.
- `packages/exporters/src/phaser.ts`: Phaser atlas and animation adapter.
- `packages/exporters/src/phaser.test.ts`: deterministic Phaser JSON tests.
- `packages/exporters/src/godot.ts`: Godot README and helper script adapter.
- `packages/exporters/src/godot.test.ts`: deterministic Godot output and warning tests.
- `packages/exporters/src/unity.ts`: Unity README and Editor importer script adapter.
- `packages/exporters/src/unity.test.ts`: deterministic Unity output and pivot conversion tests.
- `packages/exporters/src/engineBundle.ts`: selected-target coordinator returning engine files and warnings.
- `packages/exporters/src/engineBundle.test.ts`: selected-target and deterministic-path tests.
- `packages/exporters/src/index.ts`: public exports for adapter APIs and types.
- `apps/web/src/lib/engineExportFiles.ts`: converts exporter engine files to existing ZIP bundle files.
- `apps/web/src/lib/engineExportFiles.test.ts`: web conversion tests.
- `apps/web/src/App.tsx`: Export inspector target checkboxes and ZIP integration.
- `apps/web/src/styles.css`: compact export target checkbox styling if existing classes are insufficient.
- `docs/editor.md`: engine export selection and output files.
- `docs/architecture.md`: exporter boundary update.
- `docs/licensing.md`: explicit note that MIG-14 adds no dependencies.
- `docs/superpowers/plans/2026-04-28-mig-14-engine-export-adapters.md`: track task statuses.

## Subagent Flow

- Main controller owns Task 1, Task 5, Task 6, Task 7, Task 8, and final integration.
- Worker A owns Task 2 only: `packages/exporters/src/phaser.ts` and `packages/exporters/src/phaser.test.ts`.
- Worker B owns Task 3 only: `packages/exporters/src/godot.ts` and `packages/exporters/src/godot.test.ts`.
- Worker C owns Task 4 only: `packages/exporters/src/unity.ts` and `packages/exporters/src/unity.test.ts`.
- Workers are not alone in the codebase. They must not revert others' edits and must only touch their owned files plus `packages/exporters/src/index.ts` if explicitly coordinated.

---

### Task 1: Engine Export Contracts And Validation Warnings

**Parallelizable:** No. This defines shared contracts used by all adapters.

**Files:**
- Create: `packages/exporters/src/engineTypes.ts`
- Create: `packages/exporters/src/engineWarnings.ts`
- Modify: `packages/exporters/src/exportValidation.ts`
- Modify: `packages/exporters/src/exportValidation.test.ts`
- Modify: `packages/exporters/src/index.ts`

- [x] **Step 1: Add failing validation tests**

Add this test to `packages/exporters/src/exportValidation.test.ts`:

```ts
test("includes engine adapter warnings in export validation reports", () => {
  const manifest = createTestManifest();
  const report = createExportValidationReport({
    manifest,
    files: ["images/hero.png", "manifest/hero.json", "unity/PixelAidUnityImporter.cs"],
    extraIssues: [
      {
        code: "engine-unity-animation-direction",
        severity: "warning",
        message: "Unity helper imports frames and pivots; ping-pong playback still needs clip setup."
      }
    ]
  });

  expect(report.summary.warningCount).toBeGreaterThanOrEqual(1);
  expect(report.issues).toContainEqual(
    expect.objectContaining({
      code: "engine-unity-animation-direction",
      severity: "warning"
    })
  );
});
```

If `createTestManifest` does not exist in that file, add this helper near the tests:

```ts
function createTestManifest(): PixelAssetManifest {
  return {
    meta: {
      app: "PixelAid",
      version: "0.1.0",
      image: "hero.png",
      assetType: "animationSheet",
      palette: ["#000000", "#ffffff"],
      source: { width: 64, height: 32 },
      operation: {
        settings: {
          mode: "spriteSheet",
          assetType: "animationSheet",
          maxColors: 16,
          grid: { detect: "manual", scale: 4 },
          downscale: "dominant",
          alpha: "preserve",
          cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true }
        },
        grid: {
          outputWidth: 32,
          outputHeight: 16,
          scaleX: 4,
          scaleY: 4,
          phaseX: 0,
          phaseY: 0,
          confidence: 1,
          reason: "test"
        },
        durationMs: 1
      }
    },
    sheet: { width: 32, height: 16, frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, extrude: 1 },
    frames: [
      { name: "idle_000", rect: { x: 0, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 14 }, durationMs: 120 },
      { name: "idle_001", rect: { x: 16, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 14 }, durationMs: 120 }
    ],
    animations: {
      idle: { frames: ["idle_000", "idle_001"], fps: 8, loop: true, direction: "ping-pong" }
    }
  };
}
```

- [x] **Step 2: Run red validation test**

Run:

```powershell
npm run test -w @pixelaid/exporters -- exportValidation
```

Expected red: `extraIssues` is not accepted by `createExportValidationReport`.

- [x] **Step 3: Add shared engine contracts**

Create `packages/exporters/src/engineTypes.ts`:

```ts
export type EngineExportTarget = "godot" | "unity" | "phaser";

export type EngineExportSeverity = "info" | "warning" | "error";

export type EngineExportWarning = {
  target: EngineExportTarget;
  code: string;
  severity: EngineExportSeverity;
  message: string;
};

export type EngineExportFile =
  | { path: string; kind: "text"; contents: string }
  | { path: string; kind: "json"; contents: unknown };

export type EngineExportBundle = {
  files: EngineExportFile[];
  warnings: EngineExportWarning[];
};
```

Create `packages/exporters/src/engineWarnings.ts`:

```ts
import type { PixelAssetManifest } from "@pixelaid/shared";
import type { EngineExportTarget, EngineExportWarning } from "./engineTypes";

export function collectCommonEngineWarnings(
  manifest: PixelAssetManifest,
  target: EngineExportTarget
): EngineExportWarning[] {
  const warnings: EngineExportWarning[] = [];

  if (manifest.sheet.extrude > 0) {
    warnings.push({
      target,
      code: `engine-${target}-extrude-logical-rects`,
      severity: "info",
      message: "Engine adapters keep manifest frame rects logical; extrusion remains export metadata for atlas-safe workflows."
    });
  }

  if (manifest.frames.some((frame) => frame.sourceRect !== undefined)) {
    warnings.push({
      target,
      code: `engine-${target}-source-rect-generic-only`,
      severity: "info",
      message: "Source rectangles are preserved in the generic manifest but are not emitted as engine-native slice data."
    });
  }

  if (manifest.meta.assetType === "tilemap") {
    warnings.push({
      target,
      code: `engine-${target}-tilemap-inspect-only`,
      severity: "warning",
      message: "Tilemap images are inspect-only; structured map export is not part of this adapter."
    });
  }

  return warnings;
}
```

- [x] **Step 4: Accept extra validation issues**

Update `packages/exporters/src/exportValidation.ts`:

```ts
import type { PixelAssetManifest } from "@pixelaid/shared";
import { validateManifest } from "./manifest";

export type ExportValidationSeverity = "info" | "warning" | "error";

export type ExportValidationIssue = {
  code: string;
  severity: ExportValidationSeverity;
  message: string;
};

export function createExportValidationReport({
  manifest,
  files,
  frameSequenceNames = [],
  extraIssues = []
}: {
  manifest: PixelAssetManifest;
  files: readonly string[];
  frameSequenceNames?: readonly string[];
  extraIssues?: readonly ExportValidationIssue[];
}): ExportValidationReport {
  const issues: ExportValidationIssue[] = [
    ...validateManifest(manifest).map((message) => ({
      code: "manifest",
      severity: "error" as const,
      message
    })),
    ...extraIssues
  ];

  // Keep existing alpha, palette, and frame-sequence validation logic after this initialization.
}
```

Do not remove existing validation behavior. Only add the `extraIssues` parameter and include those issues before summary counts are computed.

- [x] **Step 5: Export shared contracts**

Update `packages/exporters/src/index.ts`:

```ts
export type {
  EngineExportBundle,
  EngineExportFile,
  EngineExportSeverity,
  EngineExportTarget,
  EngineExportWarning
} from "./engineTypes";
export { collectCommonEngineWarnings } from "./engineWarnings";
```

- [x] **Step 6: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/exporters
npm run test -w @pixelaid/exporters -- exportValidation
```

Expected: pass.

Commit:

```powershell
git add packages/exporters/src/engineTypes.ts packages/exporters/src/engineWarnings.ts packages/exporters/src/exportValidation.ts packages/exporters/src/exportValidation.test.ts packages/exporters/src/index.ts
git commit -m "feat(exporters): add engine export contracts"
```

---

### Task 2: Phaser Adapter

**Parallelizable:** Yes, after Task 1.

**Files:**
- Create: `packages/exporters/src/phaser.ts`
- Create: `packages/exporters/src/phaser.test.ts`
- Modify: `packages/exporters/src/index.ts`

- [x] **Step 1: Add failing Phaser adapter tests**

Create `packages/exporters/src/phaser.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { PixelAssetManifest } from "@pixelaid/shared";
import { createPhaserAnimations, createPhaserAtlas, createPhaserExport } from "./phaser";

const manifest = createManifest();

describe("Phaser export adapter", () => {
  test("creates deterministic TexturePacker-style atlas JSON", () => {
    expect(createPhaserAtlas(manifest, { textureKey: "hero_sheet" })).toEqual({
      frames: {
        idle_000: {
          frame: { x: 0, y: 0, w: 16, h: 16 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
          sourceSize: { w: 16, h: 16 },
          pivot: { x: 0.5, y: 0.875 },
          duration: 120
        },
        idle_001: {
          frame: { x: 16, y: 0, w: 16, h: 16 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
          sourceSize: { w: 16, h: 16 },
          pivot: { x: 0.5, y: 0.875 },
          duration: 90
        }
      },
      meta: {
        app: "PixelAid",
        version: "0.1.0",
        image: "hero_sheet.png",
        texture: "hero_sheet",
        size: { w: 32, h: 16 },
        scale: "1"
      }
    });
  });

  test("creates Phaser animation config with loop and ping-pong semantics", () => {
    expect(createPhaserAnimations(manifest, { textureKey: "hero_sheet" })).toEqual({
      texture: "hero_sheet",
      animations: [
        {
          key: "idle",
          frames: [
            { key: "hero_sheet", frame: "idle_000", duration: 120 },
            { key: "hero_sheet", frame: "idle_001", duration: 90 }
          ],
          frameRate: 8,
          repeat: -1,
          yoyo: true
        }
      ]
    });
  });

  test("returns selected Phaser files and common warnings", () => {
    const exportResult = createPhaserExport(manifest, { baseName: "hero", textureKey: "hero_sheet" });

    expect(exportResult.files.map((file) => file.path)).toEqual([
      "phaser/hero_atlas.json",
      "phaser/hero_animations.json",
      "phaser/README_IMPORT.md"
    ]);
    expect(exportResult.warnings.map((warning) => warning.code)).toContain("engine-phaser-extrude-logical-rects");
  });
});

function createManifest(): PixelAssetManifest {
  return {
    meta: {
      app: "PixelAid",
      version: "0.1.0",
      image: "hero_sheet.png",
      assetType: "animationSheet",
      palette: ["#000000", "#ffffff"],
      source: { width: 128, height: 64 },
      operation: {
        settings: {
          mode: "spriteSheet",
          assetType: "animationSheet",
          maxColors: 16,
          grid: { detect: "manual", scale: 4 },
          downscale: "dominant",
          alpha: "preserve",
          cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true }
        },
        grid: {
          outputWidth: 32,
          outputHeight: 16,
          scaleX: 4,
          scaleY: 4,
          phaseX: 0,
          phaseY: 0,
          confidence: 1,
          reason: "test"
        },
        durationMs: 2
      }
    },
    sheet: { width: 32, height: 16, frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, extrude: 1 },
    frames: [
      { name: "idle_000", rect: { x: 0, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 14 }, durationMs: 120 },
      { name: "idle_001", rect: { x: 16, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 14 }, durationMs: 90 }
    ],
    animations: {
      idle: { frames: ["idle_000", "idle_001"], fps: 8, loop: true, direction: "ping-pong" }
    }
  };
}
```

- [x] **Step 2: Run red Phaser test**

Run:

```powershell
npm run test -w @pixelaid/exporters -- phaser
```

Expected red: missing `./phaser`.

- [x] **Step 3: Implement Phaser adapter**

Create `packages/exporters/src/phaser.ts`:

```ts
import type { PixelAssetManifest, SpriteAnimation } from "@pixelaid/shared";
import type { EngineExportBundle } from "./engineTypes";
import { collectCommonEngineWarnings } from "./engineWarnings";

export type PhaserExportOptions = {
  baseName: string;
  textureKey?: string;
};

export function createPhaserAtlas(manifest: PixelAssetManifest, options: { textureKey?: string } = {}) {
  const texture = options.textureKey ?? stripImageExtension(manifest.meta.image);
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
    meta: {
      app: manifest.meta.app,
      version: manifest.meta.version,
      image: manifest.meta.image,
      texture,
      size: { w: manifest.sheet.width, h: manifest.sheet.height },
      scale: "1"
    }
  };
}

export function createPhaserAnimations(manifest: PixelAssetManifest, options: { textureKey?: string } = {}) {
  const texture = options.textureKey ?? stripImageExtension(manifest.meta.image);
  return {
    texture,
    animations: Object.entries(manifest.animations).map(([key, animation]) => ({
      key,
      frames: orderFrames(animation).map((frameName) => ({
        key: texture,
        frame: frameName,
        duration: manifest.frames.find((frame) => frame.name === frameName)?.durationMs ?? 120
      })),
      ...(animation.fps ? { frameRate: animation.fps } : {}),
      repeat: animation.loop ? -1 : 0,
      yoyo: animation.direction === "ping-pong"
    }))
  };
}

export function createPhaserExport(manifest: PixelAssetManifest, options: PhaserExportOptions): EngineExportBundle {
  const textureKey = options.textureKey ?? stripImageExtension(manifest.meta.image);
  return {
    files: [
      { path: `phaser/${options.baseName}_atlas.json`, kind: "json", contents: createPhaserAtlas(manifest, { textureKey }) },
      { path: `phaser/${options.baseName}_animations.json`, kind: "json", contents: createPhaserAnimations(manifest, { textureKey }) },
      { path: "phaser/README_IMPORT.md", kind: "text", contents: createPhaserReadme(manifest, textureKey) }
    ],
    warnings: collectCommonEngineWarnings(manifest, "phaser")
  };
}

function orderFrames(animation: SpriteAnimation): string[] {
  if (animation.direction === "reverse") {
    return [...animation.frames].reverse();
  }
  return [...animation.frames];
}

function createPhaserReadme(manifest: PixelAssetManifest, textureKey: string): string {
  return [
    "# Phaser Import",
    "",
    `Texture key: \`${textureKey}\``,
    `Image: \`${manifest.meta.image}\``,
    "",
    "- Load the PNG with nearest-neighbor rendering enabled in your Phaser game config.",
    "- Load the atlas JSON with `this.load.atlas(...)`.",
    "- Use the animation JSON to create `this.anims.create(...)` entries.",
    "- Keep the generic PixelAid manifest for pivots, palette, source, and operation provenance.",
    ""
  ].join("\n");
}

function stripImageExtension(image: string): string {
  return image.replace(/\.[^.]+$/, "");
}

function roundRatio(value: number, size: number): number {
  return Number((value / Math.max(1, size)).toFixed(6));
}
```

- [x] **Step 4: Export Phaser API**

Update `packages/exporters/src/index.ts`:

```ts
export { createPhaserAnimations, createPhaserAtlas, createPhaserExport } from "./phaser";
export type { PhaserExportOptions } from "./phaser";
```

- [x] **Step 5: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/exporters
npm run test -w @pixelaid/exporters -- phaser
```

Expected: pass.

Commit:

```powershell
git add packages/exporters/src/phaser.ts packages/exporters/src/phaser.test.ts packages/exporters/src/index.ts
git commit -m "feat(exporters): add Phaser export adapter"
```

---

### Task 3: Godot Adapter

**Parallelizable:** Yes, after Task 1.

**Files:**
- Create: `packages/exporters/src/godot.ts`
- Create: `packages/exporters/src/godot.test.ts`
- Modify: `packages/exporters/src/index.ts`

- [x] **Step 1: Add failing Godot adapter tests**

Create `packages/exporters/src/godot.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { PixelAssetManifest } from "@pixelaid/shared";
import { createGodotExport, createGodotImportReadme, createGodotImporterScript } from "./godot";

const manifest = createManifest();

describe("Godot export adapter", () => {
  test("creates deterministic Godot import README", () => {
    const readme = createGodotImportReadme(manifest, { baseName: "hero" });

    expect(readme).toContain("# Godot Import");
    expect(readme).toContain("Nearest");
    expect(readme).toContain("hero_sheet.png");
    expect(readme).toContain("hero_manifest.json");
  });

  test("creates a helper script that reads manifest frames and animations", () => {
    const script = createGodotImporterScript({
      manifestPath: "res://manifest/hero_manifest.json",
      texturePath: "res://images/hero_sheet.png"
    });

    expect(script).toContain("@tool");
    expect(script).toContain("SpriteFrames");
    expect(script).toContain("AtlasTexture");
    expect(script).toContain("hero_manifest.json");
    expect(script).toContain("durationMs");
  });

  test("returns Godot files and pivot warning", () => {
    const exportResult = createGodotExport(manifest, { baseName: "hero", manifestPath: "manifest/hero_manifest.json" });

    expect(exportResult.files.map((file) => file.path)).toEqual([
      "godot/README_IMPORT.md",
      "godot/pixelaid_import_spriteframes.gd"
    ]);
    expect(exportResult.warnings.map((warning) => warning.code)).toContain("engine-godot-pivots-script-required");
  });
});

function createManifest(): PixelAssetManifest {
  return {
    meta: {
      app: "PixelAid",
      version: "0.1.0",
      image: "hero_sheet.png",
      assetType: "animationSheet",
      palette: ["#000000", "#ffffff"],
      source: { width: 128, height: 64 },
      operation: {
        settings: {
          mode: "spriteSheet",
          assetType: "animationSheet",
          maxColors: 16,
          grid: { detect: "manual", scale: 4 },
          downscale: "dominant",
          alpha: "preserve",
          cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true }
        },
        grid: {
          outputWidth: 32,
          outputHeight: 16,
          scaleX: 4,
          scaleY: 4,
          phaseX: 0,
          phaseY: 0,
          confidence: 1,
          reason: "test"
        },
        durationMs: 2
      }
    },
    sheet: { width: 32, height: 16, frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, extrude: 1 },
    frames: [
      { name: "idle_000", rect: { x: 0, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 14 }, durationMs: 120 },
      { name: "idle_001", rect: { x: 16, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 14 }, durationMs: 90 }
    ],
    animations: {
      idle: { frames: ["idle_000", "idle_001"], fps: 8, loop: true, direction: "ping-pong" }
    }
  };
}
```

- [x] **Step 2: Run red Godot test**

Run:

```powershell
npm run test -w @pixelaid/exporters -- godot
```

Expected red: missing `./godot`.

- [x] **Step 3: Implement Godot adapter**

Create `packages/exporters/src/godot.ts`:

```ts
import type { PixelAssetManifest } from "@pixelaid/shared";
import type { EngineExportBundle, EngineExportWarning } from "./engineTypes";
import { collectCommonEngineWarnings } from "./engineWarnings";

export type GodotExportOptions = {
  baseName: string;
  manifestPath?: string;
};

export function createGodotExport(manifest: PixelAssetManifest, options: GodotExportOptions): EngineExportBundle {
  return {
    files: [
      { path: "godot/README_IMPORT.md", kind: "text", contents: createGodotImportReadme(manifest, options) },
      {
        path: "godot/pixelaid_import_spriteframes.gd",
        kind: "text",
        contents: createGodotImporterScript({
          manifestPath: options.manifestPath ?? `res://manifest/${options.baseName}_manifest.json`,
          texturePath: `res://images/${manifest.meta.image}`
        })
      }
    ],
    warnings: [...collectCommonEngineWarnings(manifest, "godot"), ...collectGodotWarnings(manifest)]
  };
}

export function createGodotImportReadme(manifest: PixelAssetManifest, options: GodotExportOptions): string {
  const manifestPath = options.manifestPath ?? `manifest/${options.baseName}_manifest.json`;
  return [
    "# Godot Import",
    "",
    `Image: \`${manifest.meta.image}\``,
    `Manifest: \`${manifestPath}\``,
    "",
    "- Import the PNG as a 2D texture.",
    "- Use lossless compression for pixel art.",
    "- Set texture filtering to Nearest in the import settings or project defaults.",
    "- Run `pixelaid_import_spriteframes.gd` from the Godot editor to create a `SpriteFrames` resource from manifest animations.",
    "- Keep the generic PixelAid manifest beside the resource for pivots, palette, source, and operation provenance.",
    ""
  ].join("\n");
}

export function createGodotImporterScript({ manifestPath, texturePath }: { manifestPath: string; texturePath: string }): string {
  return [
    "@tool",
    "extends EditorScript",
    "",
    `const PIXELAID_MANIFEST_PATH := \"${manifestPath}\"`,
    `const PIXELAID_TEXTURE_PATH := \"${texturePath}\"`,
    "",
    "func _run() -> void:",
    "    var file := FileAccess.open(PIXELAID_MANIFEST_PATH, FileAccess.READ)",
    "    if file == null:",
    "        push_error(\"PixelAid manifest not found: %s\" % PIXELAID_MANIFEST_PATH)",
    "        return",
    "    var manifest := JSON.parse_string(file.get_as_text())",
    "    if typeof(manifest) != TYPE_DICTIONARY:",
    "        push_error(\"PixelAid manifest is not valid JSON\")",
    "        return",
    "    var texture: Texture2D = load(PIXELAID_TEXTURE_PATH)",
    "    if texture == null:",
    "        push_error(\"PixelAid texture not found: %s\" % PIXELAID_TEXTURE_PATH)",
    "        return",
    "    var sprite_frames := SpriteFrames.new()",
    "    var animations: Dictionary = manifest.get(\"animations\", {})",
    "    for animation_name in animations.keys():",
    "        var animation: Dictionary = animations[animation_name]",
    "        sprite_frames.add_animation(animation_name)",
    "        sprite_frames.set_animation_loop(animation_name, animation.get(\"loop\", true))",
    "        sprite_frames.set_animation_speed(animation_name, animation.get(\"fps\", 8))",
    "        for frame_name in animation.get(\"frames\", []):",
    "            var frame := _find_frame(manifest.get(\"frames\", []), frame_name)",
    "            if frame.is_empty():",
    "                push_warning(\"Missing PixelAid frame: %s\" % frame_name)",
    "                continue",
    "            var rect: Dictionary = frame.get(\"rect\", {})",
    "            var atlas := AtlasTexture.new()",
    "            atlas.atlas = texture",
    "            atlas.region = Rect2(rect.get(\"x\", 0), rect.get(\"y\", 0), rect.get(\"w\", 1), rect.get(\"h\", 1))",
    "            sprite_frames.add_frame(animation_name, atlas, max(0.001, float(frame.get(\"durationMs\", 120)) / 1000.0))",
    "    ResourceSaver.save(sprite_frames, \"res://pixelaid_spriteframes.tres\")",
    "",
    "func _find_frame(frames: Array, frame_name: String) -> Dictionary:",
    "    for frame in frames:",
    "        if frame.get(\"name\", \"\") == frame_name:",
    "            return frame",
    "    return {}",
    ""
  ].join("\n");
}

function collectGodotWarnings(manifest: PixelAssetManifest): EngineExportWarning[] {
  const warnings: EngineExportWarning[] = [];
  if (manifest.frames.some((frame) => frame.pivot.x !== Math.floor(frame.rect.w / 2) || frame.pivot.y !== frame.rect.h)) {
    warnings.push({
      target: "godot",
      code: "engine-godot-pivots-script-required",
      severity: "warning",
      message: "Godot SpriteFrames do not store per-frame pivots directly; keep manifest pivots or apply offsets in gameplay scripts."
    });
  }
  if (Object.values(manifest.animations).some((animation) => animation.direction && animation.direction !== "forward")) {
    warnings.push({
      target: "godot",
      code: "engine-godot-animation-direction",
      severity: "warning",
      message: "Godot helper stores animation names and loop/speed; reverse or ping-pong playback needs project script handling."
    });
  }
  return warnings;
}
```

- [x] **Step 4: Export Godot API**

Update `packages/exporters/src/index.ts`:

```ts
export { createGodotExport, createGodotImportReadme, createGodotImporterScript } from "./godot";
export type { GodotExportOptions } from "./godot";
```

- [x] **Step 5: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/exporters
npm run test -w @pixelaid/exporters -- godot
```

Expected: pass.

Commit:

```powershell
git add packages/exporters/src/godot.ts packages/exporters/src/godot.test.ts packages/exporters/src/index.ts
git commit -m "feat(exporters): add Godot export helper"
```

---

### Task 4: Unity Adapter

**Parallelizable:** Yes, after Task 1.

**Files:**
- Create: `packages/exporters/src/unity.ts`
- Create: `packages/exporters/src/unity.test.ts`
- Modify: `packages/exporters/src/index.ts`

- [x] **Step 1: Add failing Unity adapter tests**

Create `packages/exporters/src/unity.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { PixelAssetManifest } from "@pixelaid/shared";
import { createUnityExport, createUnityImportReadme, createUnityImporterScript, toUnityPivot } from "./unity";

const manifest = createManifest();

describe("Unity export adapter", () => {
  test("converts PixelAid native pivots to Unity normalized pivots", () => {
    expect(toUnityPivot({ x: 8, y: 14 }, { w: 16, h: 16 })).toEqual({ x: 0.5, y: 0.125 });
  });

  test("creates deterministic Unity import README", () => {
    const readme = createUnityImportReadme(manifest, { baseName: "hero" });

    expect(readme).toContain("# Unity Import");
    expect(readme).toContain("Filter Mode: Point");
    expect(readme).toContain("PixelAidUnityImporter.cs");
  });

  test("creates an Editor importer script that preserves frame names and pivots", () => {
    const script = createUnityImporterScript({ manifestAssetPath: "Assets/PixelAid/hero_manifest.json" });

    expect(script).toContain("TextureImporter");
    expect(script).toContain("SpriteMetaData");
    expect(script).toContain("PixelAidManifest");
    expect(script).toContain("pivot");
  });

  test("returns Unity files and animation direction warning", () => {
    const exportResult = createUnityExport(manifest, { baseName: "hero", manifestAssetPath: "Assets/PixelAid/hero_manifest.json" });

    expect(exportResult.files.map((file) => file.path)).toEqual([
      "unity/README_IMPORT.md",
      "unity/PixelAidUnityImporter.cs"
    ]);
    expect(exportResult.warnings.map((warning) => warning.code)).toContain("engine-unity-animation-direction");
  });
});

function createManifest(): PixelAssetManifest {
  return {
    meta: {
      app: "PixelAid",
      version: "0.1.0",
      image: "hero_sheet.png",
      assetType: "animationSheet",
      palette: ["#000000", "#ffffff"],
      source: { width: 128, height: 64 },
      operation: {
        settings: {
          mode: "spriteSheet",
          assetType: "animationSheet",
          maxColors: 16,
          grid: { detect: "manual", scale: 4 },
          downscale: "dominant",
          alpha: "preserve",
          cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true }
        },
        grid: {
          outputWidth: 32,
          outputHeight: 16,
          scaleX: 4,
          scaleY: 4,
          phaseX: 0,
          phaseY: 0,
          confidence: 1,
          reason: "test"
        },
        durationMs: 2
      }
    },
    sheet: { width: 32, height: 16, frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, extrude: 1 },
    frames: [
      { name: "idle_000", rect: { x: 0, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 14 }, durationMs: 120 },
      { name: "idle_001", rect: { x: 16, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 14 }, durationMs: 90 }
    ],
    animations: {
      idle: { frames: ["idle_000", "idle_001"], fps: 8, loop: true, direction: "ping-pong" }
    }
  };
}
```

- [x] **Step 2: Run red Unity test**

Run:

```powershell
npm run test -w @pixelaid/exporters -- unity
```

Expected red: missing `./unity`.

- [x] **Step 3: Implement Unity adapter**

Create `packages/exporters/src/unity.ts`:

```ts
import type { Pivot, PixelAssetManifest, Rect } from "@pixelaid/shared";
import type { EngineExportBundle, EngineExportWarning } from "./engineTypes";
import { collectCommonEngineWarnings } from "./engineWarnings";

export type UnityExportOptions = {
  baseName: string;
  manifestAssetPath?: string;
};

export function createUnityExport(manifest: PixelAssetManifest, options: UnityExportOptions): EngineExportBundle {
  return {
    files: [
      { path: "unity/README_IMPORT.md", kind: "text", contents: createUnityImportReadme(manifest, options) },
      {
        path: "unity/PixelAidUnityImporter.cs",
        kind: "text",
        contents: createUnityImporterScript({
          manifestAssetPath: options.manifestAssetPath ?? `Assets/PixelAid/${options.baseName}_manifest.json`
        })
      }
    ],
    warnings: [...collectCommonEngineWarnings(manifest, "unity"), ...collectUnityWarnings(manifest)]
  };
}

export function createUnityImportReadme(manifest: PixelAssetManifest, options: UnityExportOptions): string {
  const manifestPath = options.manifestAssetPath ?? `Assets/PixelAid/${options.baseName}_manifest.json`;
  return [
    "# Unity Import",
    "",
    `Image: \`${manifest.meta.image}\``,
    `Manifest asset path: \`${manifestPath}\``,
    "",
    "- Copy the PNG, generic manifest, and `PixelAidUnityImporter.cs` into your Unity project.",
    "- Select the PNG and run the PixelAid importer menu item.",
    "- Texture Type: Sprite (2D and UI).",
    "- Sprite Mode: Multiple.",
    "- Filter Mode: Point.",
    "- Compression: None.",
    "- Keep the generic PixelAid manifest for animation timing, source, palette, and operation provenance.",
    ""
  ].join("\n");
}

export function createUnityImporterScript({ manifestAssetPath }: { manifestAssetPath: string }): string {
  return [
    "using System;",
    "using System.IO;",
    "using UnityEditor;",
    "using UnityEngine;",
    "",
    "public static class PixelAidUnityImporter",
    "{",
    `    private const string ManifestAssetPath = \"${manifestAssetPath}\";`,
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
    "        var texturePath = AssetDatabase.GetAssetPath(texture);",
    "        var importer = AssetImporter.GetAtPath(texturePath) as TextureImporter;",
    "        if (importer == null)",
    "        {",
    "            Debug.LogError(\"Selected asset is not a texture importer target.\");",
    "            return;",
    "        }",
    "        var manifestText = File.ReadAllText(ManifestAssetPath);",
    "        var manifest = JsonUtility.FromJson<PixelAidManifest>(manifestText);",
    "        importer.textureType = TextureImporterType.Sprite;",
    "        importer.spriteImportMode = SpriteImportMode.Multiple;",
    "        importer.filterMode = FilterMode.Point;",
    "        importer.textureCompression = TextureImporterCompression.Uncompressed;",
    "        var metadata = new SpriteMetaData[manifest.frames.Length];",
    "        for (var i = 0; i < manifest.frames.Length; i++)",
    "        {",
    "            var frame = manifest.frames[i];",
    "            metadata[i] = new SpriteMetaData",
    "            {",
    "                name = frame.name,",
    "                rect = new Rect(frame.rect.x, manifest.sheet.height - frame.rect.y - frame.rect.h, frame.rect.w, frame.rect.h),",
    "                alignment = (int)SpriteAlignment.Custom,",
    "                pivot = new Vector2(frame.pivot.x / Math.Max(1f, frame.rect.w), 1f - frame.pivot.y / Math.Max(1f, frame.rect.h))",
    "            };",
    "        }",
    "        importer.spritesheet = metadata;",
    "        EditorUtility.SetDirty(importer);",
    "        importer.SaveAndReimport();",
    "    }",
    "",
    "    [Serializable] private class PixelAidManifest { public PixelAidSheet sheet; public PixelAidFrame[] frames; }",
    "    [Serializable] private class PixelAidSheet { public int width; public int height; }",
    "    [Serializable] private class PixelAidFrame { public string name; public PixelAidRect rect; public PixelAidPivot pivot; public int durationMs; }",
    "    [Serializable] private class PixelAidRect { public int x; public int y; public int w; public int h; }",
    "    [Serializable] private class PixelAidPivot { public int x; public int y; }",
    "}",
    ""
  ].join("\n");
}

export function toUnityPivot(pivot: Pivot, rect: Pick<Rect, "w" | "h">): { x: number; y: number } {
  return {
    x: roundRatio(pivot.x, rect.w),
    y: Number((1 - pivot.y / Math.max(1, rect.h)).toFixed(6))
  };
}

function collectUnityWarnings(manifest: PixelAssetManifest): EngineExportWarning[] {
  const warnings: EngineExportWarning[] = [];
  if (Object.values(manifest.animations).some((animation) => animation.direction && animation.direction !== "forward")) {
    warnings.push({
      target: "unity",
      code: "engine-unity-animation-direction",
      severity: "warning",
      message: "Unity helper imports frame slices and pivots; reverse or ping-pong playback still needs AnimationClip setup."
    });
  }
  return warnings;
}

function roundRatio(value: number, size: number): number {
  return Number((value / Math.max(1, size)).toFixed(6));
}
```

- [x] **Step 4: Export Unity API**

Update `packages/exporters/src/index.ts`:

```ts
export { createUnityExport, createUnityImportReadme, createUnityImporterScript, toUnityPivot } from "./unity";
export type { UnityExportOptions } from "./unity";
```

- [x] **Step 5: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/exporters
npm run test -w @pixelaid/exporters -- unity
```

Expected: pass.

Commit:

```powershell
git add packages/exporters/src/unity.ts packages/exporters/src/unity.test.ts packages/exporters/src/index.ts
git commit -m "feat(exporters): add Unity export helper"
```

---

### Task 5: Engine Bundle Coordinator

**Parallelizable:** No. This combines Tasks 2-4.

**Files:**
- Create: `packages/exporters/src/engineBundle.ts`
- Create: `packages/exporters/src/engineBundle.test.ts`
- Modify: `packages/exporters/src/index.ts`

- [x] **Step 1: Add failing engine bundle tests**

Create `packages/exporters/src/engineBundle.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { PixelAssetManifest } from "@pixelaid/shared";
import { createEngineExportBundle } from "./engineBundle";

describe("engine export bundle coordinator", () => {
  test("returns deterministic files for selected targets only", () => {
    const bundle = createEngineExportBundle({
      manifest: createManifest(),
      baseName: "hero",
      targets: ["phaser", "unity"]
    });

    expect(bundle.files.map((file) => file.path)).toEqual([
      "phaser/hero_atlas.json",
      "phaser/hero_animations.json",
      "phaser/README_IMPORT.md",
      "unity/README_IMPORT.md",
      "unity/PixelAidUnityImporter.cs",
      "engines/README_IMPORT.md"
    ]);
    expect(bundle.files.some((file) => file.path.startsWith("godot/"))).toBe(false);
  });

  test("returns no files when no targets are selected", () => {
    expect(createEngineExportBundle({ manifest: createManifest(), baseName: "hero", targets: [] })).toEqual({
      files: [],
      warnings: []
    });
  });
});

function createManifest(): PixelAssetManifest {
  return {
    meta: {
      app: "PixelAid",
      version: "0.1.0",
      image: "hero_sheet.png",
      assetType: "animationSheet",
      palette: ["#000000", "#ffffff"],
      source: { width: 128, height: 64 },
      operation: {
        settings: {
          mode: "spriteSheet",
          assetType: "animationSheet",
          maxColors: 16,
          grid: { detect: "manual", scale: 4 },
          downscale: "dominant",
          alpha: "preserve",
          cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true }
        },
        grid: {
          outputWidth: 32,
          outputHeight: 16,
          scaleX: 4,
          scaleY: 4,
          phaseX: 0,
          phaseY: 0,
          confidence: 1,
          reason: "test"
        },
        durationMs: 2
      }
    },
    sheet: { width: 32, height: 16, frameWidth: 16, frameHeight: 16, margin: 0, spacing: 0, extrude: 1 },
    frames: [
      { name: "idle_000", rect: { x: 0, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 14 }, durationMs: 120 },
      { name: "idle_001", rect: { x: 16, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 14 }, durationMs: 90 }
    ],
    animations: {
      idle: { frames: ["idle_000", "idle_001"], fps: 8, loop: true, direction: "forward" }
    }
  };
}
```

- [x] **Step 2: Run red bundle test**

Run:

```powershell
npm run test -w @pixelaid/exporters -- engineBundle
```

Expected red: missing `./engineBundle`.

- [x] **Step 3: Implement bundle coordinator**

Create `packages/exporters/src/engineBundle.ts`:

```ts
import type { PixelAssetManifest } from "@pixelaid/shared";
import { createGodotExport } from "./godot";
import { createPhaserExport } from "./phaser";
import { createUnityExport } from "./unity";
import type { EngineExportBundle, EngineExportTarget } from "./engineTypes";

export type CreateEngineExportBundleOptions = {
  manifest: PixelAssetManifest;
  baseName: string;
  targets: readonly EngineExportTarget[];
};

export function createEngineExportBundle(options: CreateEngineExportBundleOptions): EngineExportBundle {
  if (options.targets.length === 0) {
    return { files: [], warnings: [] };
  }

  const bundles = options.targets.map((target) => createTargetBundle(target, options));
  const files = bundles.flatMap((bundle) => bundle.files);
  const warnings = bundles.flatMap((bundle) => bundle.warnings);

  return {
    files: [
      ...files,
      {
        path: "engines/README_IMPORT.md",
        kind: "text",
        contents: createEngineReadme(options.targets)
      }
    ],
    warnings
  };
}

function createTargetBundle(
  target: EngineExportTarget,
  options: CreateEngineExportBundleOptions
): EngineExportBundle {
  if (target === "godot") {
    return createGodotExport(options.manifest, { baseName: options.baseName });
  }
  if (target === "unity") {
    return createUnityExport(options.manifest, { baseName: options.baseName });
  }
  return createPhaserExport(options.manifest, { baseName: options.baseName });
}

function createEngineReadme(targets: readonly EngineExportTarget[]): string {
  return [
    "# PixelAid Engine Files",
    "",
    `Included targets: ${targets.join(", ")}`,
    "",
    "- The generic PixelAid manifest remains the source of truth.",
    "- Engine files are adapters or helper scripts generated from that manifest.",
    "- Keep the PNG, manifest, palette files, and validation report together.",
    ""
  ].join("\n");
}
```

- [x] **Step 4: Export bundle API**

Update `packages/exporters/src/index.ts`:

```ts
export { createEngineExportBundle } from "./engineBundle";
export type { CreateEngineExportBundleOptions } from "./engineBundle";
```

- [x] **Step 5: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/exporters
npm run test -w @pixelaid/exporters -- engineBundle phaser godot unity
```

Expected: pass.

Commit:

```powershell
git add packages/exporters/src/engineBundle.ts packages/exporters/src/engineBundle.test.ts packages/exporters/src/index.ts
git commit -m "feat(exporters): bundle selected engine adapters"
```

---

### Task 6: Web Export Selection And ZIP Integration

**Parallelizable:** No. This wires package APIs into export UI and validation.

**Files:**
- Create: `apps/web/src/lib/engineExportFiles.ts`
- Create: `apps/web/src/lib/engineExportFiles.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [x] **Step 1: Add failing web conversion tests**

Create `apps/web/src/lib/engineExportFiles.test.ts`:

```ts
import { strFromU8 } from "fflate";
import { describe, expect, test } from "vitest";
import type { EngineExportFile, EngineExportWarning } from "@pixelaid/exporters";
import { engineExportFileToBundleFile, engineWarningsToValidationIssues } from "./engineExportFiles";

describe("engine export bundle file conversion", () => {
  test("converts text and JSON engine files to ZIP bundle files", () => {
    const textFile: EngineExportFile = { path: "godot/README_IMPORT.md", kind: "text", contents: "# Godot\n" };
    const jsonFile: EngineExportFile = { path: "phaser/hero_atlas.json", kind: "json", contents: { frames: {} } };

    expect(strFromU8(engineExportFileToBundleFile(textFile).bytes)).toBe("# Godot\n");
    expect(strFromU8(engineExportFileToBundleFile(jsonFile).bytes)).toBe(`${JSON.stringify({ frames: {} }, null, 2)}\n`);
  });

  test("maps engine warnings into export validation issues", () => {
    const warnings: EngineExportWarning[] = [
      { target: "unity", code: "engine-unity-animation-direction", severity: "warning", message: "Clip setup required." }
    ];

    expect(engineWarningsToValidationIssues(warnings)).toEqual([
      { code: "engine-unity-animation-direction", severity: "warning", message: "Clip setup required." }
    ]);
  });
});
```

- [x] **Step 2: Run red web conversion test**

Run:

```powershell
npm run test -w @pixelaid/web -- engineExportFiles
```

Expected red: missing `./engineExportFiles`.

- [x] **Step 3: Implement web conversion helper**

Create `apps/web/src/lib/engineExportFiles.ts`:

```ts
import type { EngineExportFile, EngineExportWarning, ExportValidationIssue } from "@pixelaid/exporters";
import { jsonBundleFile, textBundleFile, type AssetBundleFile } from "./exportBundle";

export function engineExportFileToBundleFile(file: EngineExportFile): AssetBundleFile {
  if (file.kind === "json") {
    return jsonBundleFile(file.path, file.contents);
  }
  return textBundleFile(file.path, file.contents);
}

export function engineWarningsToValidationIssues(warnings: readonly EngineExportWarning[]): ExportValidationIssue[] {
  return warnings.map((warning) => ({
    code: warning.code,
    severity: warning.severity,
    message: warning.message
  }));
}
```

- [x] **Step 4: Add engine target selection in `App.tsx`**

Import:

```ts
import { createEngineExportBundle, type EngineExportTarget } from "@pixelaid/exporters";
import { engineExportFileToBundleFile, engineWarningsToValidationIssues } from "./lib/engineExportFiles";
```

Add state near export-related state:

```ts
const [engineExportTargets, setEngineExportTargets] = useState<EngineExportTarget[]>(["godot", "unity", "phaser"]);
```

Add helper callback near export callbacks:

```ts
const toggleEngineExportTarget = useCallback((target: EngineExportTarget) => {
  setEngineExportTargets((current) =>
    current.includes(target) ? current.filter((item) => item !== target) : [...current, target]
  );
}, []);
```

In `exportFixedAsset`, after creating `manifest`, create engine bundle:

```ts
const engineBundle = createEngineExportBundle({
  manifest,
  baseName,
  targets: engineExportTargets
});
```

Update `filePaths` to include:

```ts
...engineBundle.files.map((file) => file.path)
```

Update `createExportValidationReport` call:

```ts
const validation = createExportValidationReport({
  manifest,
  files: filePaths,
  frameSequenceNames: frameSequence.map((frame) => frame.frameName),
  extraIssues: engineWarningsToValidationIssues(engineBundle.warnings)
});
```

Update `bundleFiles` to include:

```ts
...engineBundle.files.map(engineExportFileToBundleFile)
```

Add `engineExportTargets` to the export callback dependencies.

- [x] **Step 5: Add export inspector checkboxes**

In the `export` inspector group in `apps/web/src/App.tsx`, add a compact target selector after the validation readout:

```tsx
<div className="engine-export-targets" aria-label="Engine export targets">
  {(["godot", "unity", "phaser"] as const).map((target) => (
    <label key={target} className="toggle-row">
      <input
        type="checkbox"
        checked={engineExportTargets.includes(target)}
        onChange={() => toggleEngineExportTarget(target)}
      />
      {targetLabel(target)}
    </label>
  ))}
</div>
```

Add helper function near other component helpers:

```ts
function targetLabel(target: EngineExportTarget): string {
  if (target === "godot") {
    return "Godot";
  }
  if (target === "unity") {
    return "Unity";
  }
  return "Phaser";
}
```

Only add CSS if spacing is cramped:

```css
.engine-export-targets {
  display: grid;
  gap: 0.25rem;
}
```

- [x] **Step 6: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- engineExportFiles
npm run build -w @pixelaid/web
```

Expected: pass.

Commit:

```powershell
git add apps/web/src/lib/engineExportFiles.ts apps/web/src/lib/engineExportFiles.test.ts apps/web/src/App.tsx apps/web/src/styles.css
git commit -m "feat(web): include selected engine export files"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/editor.md`
- Modify: `docs/architecture.md`
- Modify: `docs/licensing.md`
- Modify: `docs/superpowers/plans/2026-04-28-mig-14-engine-export-adapters.md`

- [x] **Step 1: Update editor docs**

In `docs/editor.md`, update Export docs with:

```md
Engine export targets can be selected in the Export inspector. When enabled, the ZIP includes Godot, Unity, and/or Phaser folders beside the generic PixelAid manifest. The generic manifest remains the source of truth; engine files are adapters, helper scripts, or import instructions generated from that manifest.
```

- [x] **Step 2: Update architecture docs**

In `docs/architecture.md`, update the exporter boundary:

```md
`packages/exporters` owns the generic manifest, validation, and engine adapter files for Godot, Unity, and Phaser. Engine adapters never replace the generic manifest; they emit deterministic sidecars and warnings for unsupported target fields.
```

- [x] **Step 3: Update licensing docs**

In `docs/licensing.md`, add:

```md
MIG-14 engine adapters add no dependencies. Godot, Unity, and Phaser files are generated text/JSON helpers maintained in-repo.
```

- [x] **Step 4: Verify and commit**

Run:

```powershell
npm run typecheck
npm run test
npm run build
```

Expected: pass.

Commit:

```powershell
git add docs/editor.md docs/architecture.md docs/licensing.md docs/superpowers/plans/2026-04-28-mig-14-engine-export-adapters.md
git commit -m "docs(exporters): document engine export adapters"
```

---

### Task 8: Final Verification, Linear Update, And Foundation Handoff

**Files:**
- No planned code changes except fixes discovered during verification.
- Modify: `docs/superpowers/plans/2026-04-28-mig-14-engine-export-adapters.md` for final checklist completion.

- [ ] **Step 1: Full verification**

Run:

```powershell
npm run typecheck
npm run test
npm run build
```

Expected: all pass.

- [ ] **Step 2: Local server smoke**

Start a local dev server on port `5177` or the next free port:

```powershell
npm run dev -w @pixelaid/web -- --host 127.0.0.1 --port 5177 --strictPort
```

Smoke:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:5177 -UseBasicParsing
```

Expected: HTTP `200`, PixelAid app loads. Capture a screenshot if browser tooling is available.

- [ ] **Step 3: Update Linear**

Add a completion comment to `MIG-14` with:

- Branch: `codex/mig-14-engine-export-adapters`
- Delivered files and targets.
- Verification commands and results.
- Known limitations/warnings for Godot/Unity target support.

Then move `MIG-14` to `Done`.

- [ ] **Step 4: Foundation handoff**

Verify the MIG worktree is clean:

```powershell
git status --short --branch
```

Fast-forward foundation:

```powershell
git merge --ff-only codex/mig-14-engine-export-adapters
```

Expected: `codex/pixelaid-roadmap-foundation` advances cleanly.

Commit final checklist update if needed:

```powershell
git add docs/superpowers/plans/2026-04-28-mig-14-engine-export-adapters.md
git commit -m "docs(exporters): complete MIG-14 execution checklist"
```

---

## Acceptance Criteria Checklist

- [ ] Generic manifest remains canonical and always included in the bundle.
- [ ] Godot files include import README and helper script.
- [ ] Unity files include import README and Editor importer script, with no generated `.meta`.
- [ ] Phaser files include deterministic atlas JSON and animation JSON.
- [ ] Engine adapter warnings are included in validation reports.
- [ ] Export inspector lets the user select Godot, Unity, and Phaser targets.
- [ ] Tests cover deterministic adapter output and unsupported-field warnings.
- [ ] No dependencies are added.
