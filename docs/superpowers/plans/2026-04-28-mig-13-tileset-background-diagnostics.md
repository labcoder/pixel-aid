# MIG-13 Tileset, Tilemap, and Background Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inspect-first diagnostics for tilesets, tilemaps, and backgrounds so PixelAid handles non-sprite assets according to their own failure modes.

**Architecture:** Keep diagnostic algorithms pure and tested in `packages/core`, with serializable diagnostic contracts in `packages/shared`. Use `apps/web` only for presentation: repeat-preview canvas, inspector readouts, metrics/log surfaces, and asset-type guidance. The core fixer remains unchanged unless a diagnostic requires metadata already produced by fix results.

**Tech Stack:** TypeScript, Vite/React, Canvas2D with `imageSmoothingEnabled = false`, Vitest, existing npm workspaces. No new dependencies.

---

## Current Baseline

- Worktree: `C:\dev\Mighty\pixel-aid\.worktrees\mig-13-tileset-background-diagnostics`
- Branch: `codex/mig-13-tileset-background-diagnostics`
- Base: `codex/pixelaid-roadmap-foundation` at `3067aa0`
- Baseline setup: `npm install` was required in this fresh worktree.
- Baseline verification after install:
  - `npm run test` passed across workspaces.
  - `npm run build` passed across workspaces.

## Scope Decisions

- `MIG-13` is diagnostics and preview, not engine export. Engine-specific tileset metadata remains `MIG-14`.
- Tilesets become stronger than "future seam diagnostics"; they should surface seam risk and repeat preview now.
- Tilemaps remain inspect/diagnose-first. Do not add map-data import/export in this issue.
- Backgrounds stay preservation-oriented. Do not default them toward sprite crop, binary alpha, or aggressive denoise.
- Repeat preview must use canvas, not React pixel nodes.
- Diagnostics should warn and explain. They should not silently rewrite tiles or background imagery.

## File Structure

- `packages/shared/src/types.ts`: shared diagnostic types for tile seams and scene/background inspection.
- `packages/shared/src/index.ts`: exports the new diagnostic types.
- `packages/shared/src/assetTypes.ts`: support descriptions/warnings for tileset, tilemap, and background.
- `packages/shared/src/assetTypes.test.ts`: expectations for support levels and wording-sensitive warnings.
- `packages/core/src/tileDiagnostics.ts`: pure seam, lighting, and repeat-risk analysis for rectangular tile sheets.
- `packages/core/src/tileDiagnostics.test.ts`: tests for seamless and broken tilesets.
- `packages/core/src/sceneDiagnostics.ts`: pure inspect diagnostics for backgrounds/tilemaps: palette/detail density and preservation warnings.
- `packages/core/src/sceneDiagnostics.test.ts`: tests for background and tilemap diagnostics.
- `packages/core/src/index.ts`: exports new diagnostic helpers.
- `packages/fixtures/src/tilesetSeams.ts`: add a non-seamless fixture beside the current 4x4 tileset.
- `packages/fixtures/src/largeBackgrounds.ts`: add or annotate a detail-density background fixture only if core tests need it.
- `packages/fixtures/src/fixtureCatalog.test.ts`: keep fixture catalog expectations green.
- `apps/web/src/lib/tileRepeatPreview.ts`: pure repeat-preview layout helpers.
- `apps/web/src/lib/tileRepeatPreview.test.ts`: deterministic layout and selected-frame tests.
- `apps/web/src/components/TileRepeatPreviewCanvas.tsx`: canvas renderer for repeated tile preview.
- `apps/web/src/lib/tileDiagnosticsView.ts`: formatting helpers for warnings/readouts.
- `apps/web/src/lib/tileDiagnosticsView.test.ts`: presentation helper tests.
- `apps/web/src/lib/bottomPanelLayout.ts`: route tileset assets to tile preview instead of the sprite timeline.
- `apps/web/src/lib/bottomPanelLayout.test.ts`: updated bottom-panel section expectations.
- `apps/web/src/App.tsx`: integrate diagnostics, repeat preview, and readouts.
- `docs/editor.md`: document tile/background diagnostics workflow.
- `docs/algorithms.md`: document seam and scene diagnostics.
- `docs/performance.md`: document diagnostic sampling/performance constraints if implementation adds sampling notes.
- `docs/superpowers/plans/2026-04-28-mig-13-tileset-background-diagnostics.md`: mark task statuses as work proceeds.

---

### Task 1: Shared Diagnostic Contracts and Asset-Type Wording

**Parallelizable:** No. This sets type names used by later tasks.

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/assetTypes.ts`
- Modify: `packages/shared/src/assetTypes.test.ts`

- [x] **Step 1: Add failing shared tests**

Update `packages/shared/src/assetTypes.test.ts` with expectations:

```ts
it("marks 0.2 tileset diagnostics as supported while keeping tilemaps inspect-first", () => {
  expect(getAssetTypeDefinition("tileset").support).toBe("full");
  expect(getAssetTypeDefinition("tileset").defaultWarnings.map((warning) => warning.code)).toContain(
    "tileset-engine-metadata-next"
  );
  expect(getAssetTypeDefinition("tilemap").support).toBe("inspectOnly");
  expect(getAssetTypeDefinition("tilemap").defaultWarnings.map((warning) => warning.code)).toContain(
    "tilemap-inspect-only"
  );
  expect(getAssetTypeDefinition("background").support).toBe("inspectOnly");
});
```

Add a type-export smoke test if desired in `packages/shared/src/assetTypes.test.ts`:

```ts
import type { SceneAssetDiagnostics, TilesetSeamDiagnostics } from "./types";

it("has serializable diagnostics contracts for tile and scene inspection", () => {
  const tileDiagnostics: TilesetSeamDiagnostics = {
    tileWidth: 16,
    tileHeight: 16,
    rows: 2,
    columns: 2,
    checkedSeams: 4,
    averageEdgeDelta: 0,
    maxEdgeDelta: 0,
    seamRiskScore: 0,
    lightingRiskScore: 0,
    issues: []
  };
  const sceneDiagnostics: SceneAssetDiagnostics = {
    assetType: "background",
    sampledPixelCount: 100,
    colorBinCount: 12,
    detailDensity: 0.12,
    detailDensityLabel: "medium",
    paletteRiskScore: 0.2,
    warnings: []
  };

  expect(tileDiagnostics.issues).toEqual([]);
  expect(sceneDiagnostics.detailDensityLabel).toBe("medium");
});
```

- [x] **Step 2: Run red test**

Run:

```powershell
npm run test -w @pixelaid/shared -- assetTypes
```

Expected red: tileset/tilemap support expectations and missing diagnostic type exports fail.

- [x] **Step 3: Add diagnostic types**

In `packages/shared/src/types.ts`, add after `AssetTypeClassification`:

```ts
export type DiagnosticSeverity = "info" | "warning" | "error";

export type TilesetSeamEdge = "right-left" | "bottom-top";

export type TilesetSeamIssueCode =
  | "edge-mismatch"
  | "lighting-discontinuity"
  | "cross-boundary-detail";

export type TilesetSeamIssue = {
  code: TilesetSeamIssueCode;
  severity: DiagnosticSeverity;
  message: string;
  edge: TilesetSeamEdge;
  tileA: { row: number; column: number };
  tileB: { row: number; column: number };
  score: number;
};

export type TilesetSeamDiagnostics = {
  tileWidth: number;
  tileHeight: number;
  rows: number;
  columns: number;
  checkedSeams: number;
  averageEdgeDelta: number;
  maxEdgeDelta: number;
  seamRiskScore: number;
  lightingRiskScore: number;
  issues: TilesetSeamIssue[];
};

export type SceneAssetDiagnostics = {
  assetType: Extract<AssetType, "background" | "tilemap">;
  sampledPixelCount: number;
  colorBinCount: number;
  detailDensity: number;
  detailDensityLabel: "low" | "medium" | "high";
  paletteRiskScore: number;
  warnings: AssetTypeWarning[];
};
```

In `packages/shared/src/index.ts`, add the new types to the type export block:

```ts
  DiagnosticSeverity,
  SceneAssetDiagnostics,
  TilesetSeamDiagnostics,
  TilesetSeamEdge,
  TilesetSeamIssue,
  TilesetSeamIssueCode,
```

- [x] **Step 4: Update asset type definitions**

In `packages/shared/src/assetTypes.ts`:

- Change `tileset.support` from `"inspectOnly"` to `"full"`.
- Change tileset description to:

```ts
description: "Tile images where grid alignment, repeat preview, and seam diagnostics matter.",
```

- Replace tileset default warning with:

```ts
{
  code: "tileset-engine-metadata-next",
  severity: "info",
  message: "Tileset seam diagnostics are available; engine-specific tileset metadata arrives with export adapters."
}
```

- Change `tilemap.support` from `"future"` to `"inspectOnly"`.
- Change tilemap warning code/message to:

```ts
{
  code: "tilemap-inspect-only",
  severity: "warning",
  message: "Tilemap data import/export is inspect-only until map metadata support is scoped."
}
```

- [x] **Step 5: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/shared
npm run test -w @pixelaid/shared -- assetTypes
```

Expected: pass.

Commit:

```powershell
git add packages/shared/src/types.ts packages/shared/src/index.ts packages/shared/src/assetTypes.ts packages/shared/src/assetTypes.test.ts
git commit -m "feat(shared): add tile and scene diagnostic contracts"
```

---

### Task 2: Core Tileset Seam Diagnostics

**Parallelizable:** Worker A can own this task after Task 1.

**Files:**
- Create: `packages/core/src/tileDiagnostics.ts`
- Create: `packages/core/src/tileDiagnostics.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Add failing tests**

Create `packages/core/src/tileDiagnostics.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { tilesetSeamFixtures } from "@pixelaid/fixtures";
import type { RGBAImage, SheetSliceOptions } from "@pixelaid/shared";
import { analyzeTilesetSeams } from "./tileDiagnostics";
import { createImage, writePixel } from "./image";

const sheet: SheetSliceOptions = {
  frameWidth: 16,
  frameHeight: 16,
  rows: 2,
  columns: 2,
  margin: 0,
  spacing: 0,
  extrude: 0
};

describe("tileset seam diagnostics", () => {
  test("scores the seamless fixture as low risk", () => {
    const fixture = tilesetSeamFixtures[0]!;
    const diagnostics = analyzeTilesetSeams(fixture.createImage(), fixture.expected.sheet!.options);

    expect(diagnostics.checkedSeams).toBeGreaterThan(0);
    expect(diagnostics.seamRiskScore).toBeLessThan(0.2);
    expect(diagnostics.issues).toEqual([]);
  });

  test("flags mismatched neighbor edges", () => {
    const image = createBrokenTwoByTwoTileset();
    const diagnostics = analyzeTilesetSeams(image, sheet);

    expect(diagnostics.seamRiskScore).toBeGreaterThan(0.45);
    expect(diagnostics.maxEdgeDelta).toBeGreaterThan(0.7);
    expect(diagnostics.issues.map((issue) => issue.code)).toContain("edge-mismatch");
    expect(diagnostics.issues[0]).toMatchObject({
      edge: "right-left",
      tileA: { row: 0, column: 0 },
      tileB: { row: 0, column: 1 }
    });
  });

  test("detects lighting discontinuity between adjacent tiles", () => {
    const image = createLightingMismatchTileset();
    const diagnostics = analyzeTilesetSeams(image, sheet);

    expect(diagnostics.lightingRiskScore).toBeGreaterThan(0.3);
    expect(diagnostics.issues.map((issue) => issue.code)).toContain("lighting-discontinuity");
  });
});

function createBrokenTwoByTwoTileset(): RGBAImage {
  const image = createImage(32, 32, [40, 120, 70, 255]);
  for (let y = 0; y < 32; y += 1) {
    writePixel(image, 15, y, [10, 20, 30, 255]);
    writePixel(image, 16, y, [230, 220, 210, 255]);
  }
  return image;
}

function createLightingMismatchTileset(): RGBAImage {
  const image = createImage(32, 32, [50, 100, 70, 255]);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 16; x < 32; x += 1) {
      writePixel(image, x, y, [150, 200, 170, 255]);
    }
  }
  return image;
}
```

- [x] **Step 2: Run red test**

Run:

```powershell
npm run test -w @pixelaid/core -- tileDiagnostics
```

Expected red: missing `./tileDiagnostics`.

- [x] **Step 3: Implement `analyzeTilesetSeams`**

Create `packages/core/src/tileDiagnostics.ts` with this API:

```ts
import type { SheetSliceOptions, TilesetSeamDiagnostics, TilesetSeamEdge, TilesetSeamIssue, RGBAImage } from "@pixelaid/shared";

export type AnalyzeTilesetSeamsOptions = SheetSliceOptions & {
  edgeMismatchThreshold?: number;
  lightingMismatchThreshold?: number;
};

export function analyzeTilesetSeams(image: RGBAImage, options: AnalyzeTilesetSeamsOptions): TilesetSeamDiagnostics {
  // implementation
}
```

Implementation rules:

- Use only typed-array index math; no `{ r, g, b }` allocations inside pixel loops.
- Check every horizontal neighbor seam and vertical neighbor seam implied by `rows`, `columns`, `margin`, `spacing`, `frameWidth`, and `frameHeight`.
- For `right-left`, compare the rightmost visible column of tile A to the leftmost visible column of tile B.
- For `bottom-top`, compare the bottom row of tile A to the top row of tile B.
- Normalize RGB distance by `441.67295593` so edge scores are `0..1`.
- `averageEdgeDelta` is the mean of all seam edge scores.
- `maxEdgeDelta` is the maximum seam edge score.
- `seamRiskScore` is `Math.min(1, averageEdgeDelta * 0.5 + maxEdgeDelta * 0.5)`.
- `lightingRiskScore` compares average luminance of adjacent tile interiors and stores the maximum normalized luminance difference.
- Add `edge-mismatch` warning issues when a seam score is above `edgeMismatchThreshold ?? 0.22`.
- Add `lighting-discontinuity` warning issues when luminance delta is above `lightingMismatchThreshold ?? 0.28`.
- Keep issue messages deterministic, for example:

```ts
`Tile ${rowA},${columnA} ${edgeLabel} seam differs from tile ${rowB},${columnB}.`
```

- [x] **Step 4: Export helper**

In `packages/core/src/index.ts`, add:

```ts
export { analyzeTilesetSeams } from "./tileDiagnostics";
export type { AnalyzeTilesetSeamsOptions } from "./tileDiagnostics";
```

- [x] **Step 5: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/core
npm run test -w @pixelaid/core -- tileDiagnostics
```

Expected: pass.

Commit:

```powershell
git add packages/core/src/tileDiagnostics.ts packages/core/src/tileDiagnostics.test.ts packages/core/src/index.ts
git commit -m "feat(core): add tileset seam diagnostics"
```

---

### Task 3: Core Scene Diagnostics for Backgrounds and Tilemaps

**Parallelizable:** Worker B can own this task after Task 1.

**Files:**
- Create: `packages/core/src/sceneDiagnostics.ts`
- Create: `packages/core/src/sceneDiagnostics.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Add failing tests**

Create `packages/core/src/sceneDiagnostics.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { largeBackgroundFixtures } from "@pixelaid/fixtures";
import { analyzeSceneAssetDiagnostics } from "./sceneDiagnostics";
import { createImage, writePixel } from "./image";

describe("scene asset diagnostics", () => {
  test("keeps large backgrounds preservation-oriented", () => {
    const fixture = largeBackgroundFixtures.find((item) => item.id === "large-non-sprite-background")!;
    const diagnostics = analyzeSceneAssetDiagnostics(fixture.createImage(), { assetType: "background", spritePaletteBudget: 32 });

    expect(diagnostics.assetType).toBe("background");
    expect(diagnostics.sampledPixelCount).toBeGreaterThan(0);
    expect(diagnostics.warnings.map((warning) => warning.code)).toContain("background-preserve-detail");
  });

  test("warns when a scene has more color bins than sprite-style budgets", () => {
    const image = createManyColorScene();
    const diagnostics = analyzeSceneAssetDiagnostics(image, { assetType: "background", spritePaletteBudget: 16 });

    expect(diagnostics.colorBinCount).toBeGreaterThan(16);
    expect(diagnostics.paletteRiskScore).toBeGreaterThan(0);
    expect(diagnostics.warnings.map((warning) => warning.code)).toContain("scene-palette-density");
  });

  test("marks tilemaps as inspect-only map-data assets", () => {
    const diagnostics = analyzeSceneAssetDiagnostics(createImage(128, 128, [20, 30, 40, 255]), {
      assetType: "tilemap",
      spritePaletteBudget: 32
    });

    expect(diagnostics.assetType).toBe("tilemap");
    expect(diagnostics.warnings.map((warning) => warning.code)).toContain("tilemap-inspect-only");
  });
});

function createManyColorScene() {
  const image = createImage(64, 64, [0, 0, 0, 255]);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      writePixel(image, x, y, [(x * 5) % 256, (y * 7) % 256, ((x + y) * 3) % 256, 255]);
    }
  }
  return image;
}
```

- [x] **Step 2: Run red test**

Run:

```powershell
npm run test -w @pixelaid/core -- sceneDiagnostics
```

Expected red: missing `./sceneDiagnostics`.

- [x] **Step 3: Implement `analyzeSceneAssetDiagnostics`**

Create `packages/core/src/sceneDiagnostics.ts`:

```ts
import type { AssetTypeWarning, RGBAImage, SceneAssetDiagnostics } from "@pixelaid/shared";

export type AnalyzeSceneAssetDiagnosticsOptions = {
  assetType: "background" | "tilemap";
  spritePaletteBudget: number;
  maxSamples?: number;
};

export function analyzeSceneAssetDiagnostics(
  image: RGBAImage,
  options: AnalyzeSceneAssetDiagnosticsOptions
): SceneAssetDiagnostics {
  // implementation
}
```

Implementation rules:

- Sample with a deterministic stride: `Math.max(1, Math.floor(Math.sqrt((image.width * image.height) / (options.maxSamples ?? 8192))))`.
- Use a `Uint8Array(32768)` to count 5-bit RGB bins without allocating strings per pixel.
- Compute `colorBinCount` from touched bins.
- Compute a cheap edge/detail score from sampled neighbor luminance differences. Normalize to `0..1`.
- `detailDensityLabel`: low `< 0.08`, medium `< 0.18`, high otherwise.
- `paletteRiskScore`: `Math.min(1, Math.max(0, colorBinCount - spritePaletteBudget) / Math.max(1, spritePaletteBudget * 2))`.
- Always include warning code `background-preserve-detail` for backgrounds:

```ts
{ code: "background-preserve-detail", severity: "info", message: "Backgrounds are inspected with preservation-first cleanup so sprite-style crop, binary alpha, and denoise do not destroy scene detail." }
```

- Include `scene-palette-density` when `paletteRiskScore > 0.25`.
- Include `scene-detail-density` when `detailDensityLabel === "high"`.
- Include `tilemap-inspect-only` for tilemaps.

- [x] **Step 4: Export helper**

In `packages/core/src/index.ts`, add:

```ts
export { analyzeSceneAssetDiagnostics } from "./sceneDiagnostics";
export type { AnalyzeSceneAssetDiagnosticsOptions } from "./sceneDiagnostics";
```

- [x] **Step 5: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/core
npm run test -w @pixelaid/core -- sceneDiagnostics
```

Expected: pass.

Commit:

```powershell
git add packages/core/src/sceneDiagnostics.ts packages/core/src/sceneDiagnostics.test.ts packages/core/src/index.ts
git commit -m "feat(core): add scene asset diagnostics"
```

---

### Task 4: Fixture Coverage for Seam Diagnostics

**Parallelizable:** Yes, after Task 2 API shape is known.

**Files:**
- Modify: `packages/fixtures/src/tilesetSeams.ts`
- Modify: `packages/fixtures/src/fixtureCatalog.test.ts`
- Modify: `packages/fixtures/src/types.ts` only if tests require new expected metadata

- [x] **Step 1: Add failing fixture catalog test**

In `packages/fixtures/src/fixtureCatalog.test.ts`, add:

```ts
test("includes both seamless and broken tileset seam fixtures", () => {
  const ids = cleanupFixtureCatalog.filter((fixture) => fixture.category === "tilesetSeams").map((fixture) => fixture.id);

  expect(ids).toContain("tileset-seams-4x4-16");
  expect(ids).toContain("tileset-broken-seams-2x2-16");
});
```

- [x] **Step 2: Run red test**

Run:

```powershell
npm run test -w @pixelaid/fixtures -- fixtureCatalog
```

Expected red: missing `tileset-broken-seams-2x2-16`.

- [x] **Step 3: Add broken seam fixture**

In `packages/fixtures/src/tilesetSeams.ts`, append a second fixture:

```ts
{
  id: "tileset-broken-seams-2x2-16",
  title: "Broken 2x2 tileset seam fixture",
  category: "tilesetSeams",
  assetType: "tileset",
  description: "Four 16x16 tiles with deliberately mismatched interior edge colors and lighting discontinuity.",
  catches: ["edge mismatch diagnostics", "lighting seam diagnostics", "repeat preview warnings"],
  createImage: createBrokenTilesetImage,
  expected: {
    mode: "tileSheet",
    palette: { maxColors: 16 },
    sheet: {
      options: { frameWidth: 16, frameHeight: 16, rows: 2, columns: 2, margin: 0, spacing: 0, extrude: 0 },
      rowFrameCounts: [2, 2],
      expectedWarnings: ["edge-mismatch", "lighting-discontinuity"]
    }
  }
}
```

Add `createBrokenTilesetImage()` using `createImage` and `fillRect`. Keep it small and deterministic.

- [x] **Step 4: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/fixtures
npm run test -w @pixelaid/fixtures -- fixtureCatalog
```

Expected: pass.

Commit:

```powershell
git add packages/fixtures/src/tilesetSeams.ts packages/fixtures/src/fixtureCatalog.test.ts packages/fixtures/src/types.ts
git commit -m "test(fixtures): add broken tileset seam fixture"
```

---

### Task 5: Web Repeat Preview Model and Canvas

**Parallelizable:** Worker C can own pure model/tests; main should own component integration.

**Files:**
- Create: `apps/web/src/lib/tileRepeatPreview.ts`
- Create: `apps/web/src/lib/tileRepeatPreview.test.ts`
- Create: `apps/web/src/components/TileRepeatPreviewCanvas.tsx`

- [x] **Step 1: Add failing repeat-preview model tests**

Create `apps/web/src/lib/tileRepeatPreview.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { SpriteFrame } from "@pixelaid/shared";
import { getRepeatPreviewCells, getTilePreviewFrame } from "./tileRepeatPreview";

const frames: SpriteFrame[] = [
  { name: "tile_000", rect: { x: 0, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 16 }, durationMs: 120 },
  { name: "tile_001", rect: { x: 16, y: 0, w: 16, h: 16 }, pivot: { x: 8, y: 16 }, durationMs: 120 }
];

describe("tile repeat preview model", () => {
  test("selects the chosen frame or falls back to the first tile", () => {
    expect(getTilePreviewFrame(frames, 1)?.name).toBe("tile_001");
    expect(getTilePreviewFrame(frames, 99)?.name).toBe("tile_000");
    expect(getTilePreviewFrame([], 0)).toBeNull();
  });

  test("returns deterministic 3x3 repeat cells centered on the selected tile", () => {
    const cells = getRepeatPreviewCells({
      frame: frames[0]!,
      cellSize: 16,
      rows: 3,
      columns: 3
    });

    expect(cells).toHaveLength(9);
    expect(cells[4]).toMatchObject({
      row: 1,
      column: 1,
      isCenter: true,
      source: { x: 0, y: 0, w: 16, h: 16 },
      destination: { x: 16, y: 16, w: 16, h: 16 }
    });
  });
});
```

- [x] **Step 2: Run red test**

Run:

```powershell
npm run test -w @pixelaid/web -- tileRepeatPreview
```

Expected red: missing `./tileRepeatPreview`.

- [x] **Step 3: Implement repeat-preview model**

Create `apps/web/src/lib/tileRepeatPreview.ts`:

```ts
import type { Rect, SpriteFrame } from "@pixelaid/shared";

export type TileRepeatPreviewCell = {
  row: number;
  column: number;
  isCenter: boolean;
  source: Rect;
  destination: Rect;
};

export function getTilePreviewFrame(frames: readonly SpriteFrame[], selectedFrameIndex: number): SpriteFrame | null {
  return frames[selectedFrameIndex] ?? frames[0] ?? null;
}

export function getRepeatPreviewCells({
  frame,
  cellSize,
  rows = 3,
  columns = 3
}: {
  frame: SpriteFrame;
  cellSize: number;
  rows?: number;
  columns?: number;
}): TileRepeatPreviewCell[] {
  // implementation
}
```

Implementation rules:

- Use `frame.rect` as the `source` rect for every cell.
- Destination `x = column * cellSize`, `y = row * cellSize`, `w = cellSize`, `h = cellSize`.
- `isCenter` is true for `Math.floor(rows / 2), Math.floor(columns / 2)`.
- Keep all output deterministic.

- [x] **Step 4: Add canvas component**

Create `apps/web/src/components/TileRepeatPreviewCanvas.tsx`.

Component API:

```ts
import type { RGBAImage, SpriteFrame, TilesetSeamDiagnostics } from "@pixelaid/shared";

export type TileRepeatPreviewCanvasProps = {
  image: RGBAImage | null;
  frame: SpriteFrame | null;
  diagnostics: TilesetSeamDiagnostics | null;
};
```

Rendering rules:

- Use `<canvas>`.
- Convert `RGBAImage` to an internal native canvas with `putImageData`.
- Set `ctx.imageSmoothingEnabled = false`.
- Draw a 3x3 repeat of the selected tile.
- Draw a subtle center outline around the selected tile repeat.
- If diagnostics has warning issues, draw thin warning-colored seam lines between repeated cells.
- If `image` or `frame` is null, render an empty state.

- [x] **Step 5: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- tileRepeatPreview
```

Expected: pass.

Commit:

```powershell
git add apps/web/src/lib/tileRepeatPreview.ts apps/web/src/lib/tileRepeatPreview.test.ts apps/web/src/components/TileRepeatPreviewCanvas.tsx
git commit -m "feat(web): add tile repeat preview model"
```

---

### Task 6: Web Diagnostic Formatting and Bottom Panel Routing

**Parallelizable:** Yes, after Tasks 2, 3, and 5.

**Files:**
- Create: `apps/web/src/lib/tileDiagnosticsView.ts`
- Create: `apps/web/src/lib/tileDiagnosticsView.test.ts`
- Modify: `apps/web/src/lib/bottomPanelLayout.ts`
- Modify: `apps/web/src/lib/bottomPanelLayout.test.ts`

- [x] **Step 1: Add failing formatting tests**

Create `apps/web/src/lib/tileDiagnosticsView.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { SceneAssetDiagnostics, TilesetSeamDiagnostics } from "@pixelaid/shared";
import { formatSceneDiagnosticsSummary, formatTilesetDiagnosticsSummary } from "./tileDiagnosticsView";

describe("tile diagnostics view formatting", () => {
  test("formats low-risk tileset diagnostics", () => {
    const diagnostics: TilesetSeamDiagnostics = {
      tileWidth: 16,
      tileHeight: 16,
      rows: 2,
      columns: 2,
      checkedSeams: 4,
      averageEdgeDelta: 0.03,
      maxEdgeDelta: 0.08,
      seamRiskScore: 0.05,
      lightingRiskScore: 0.02,
      issues: []
    };

    expect(formatTilesetDiagnosticsSummary(diagnostics)).toEqual({
      status: "OK",
      summary: "4 seams checked / 5% seam risk / 2% lighting risk",
      warnings: []
    });
  });

  test("formats scene diagnostics warnings", () => {
    const diagnostics: SceneAssetDiagnostics = {
      assetType: "background",
      sampledPixelCount: 100,
      colorBinCount: 80,
      detailDensity: 0.22,
      detailDensityLabel: "high",
      paletteRiskScore: 0.6,
      warnings: [{ code: "scene-palette-density", severity: "warning", message: "Palette is broad." }]
    };

    expect(formatSceneDiagnosticsSummary(diagnostics)).toEqual({
      status: "Review",
      summary: "80 color bins / high detail / 60% palette risk",
      warnings: ["Palette is broad."]
    });
  });
});
```

- [x] **Step 2: Add failing bottom layout tests**

Update `apps/web/src/lib/bottomPanelLayout.test.ts` to call the new signature:

```ts
expect(getBottomPanelSections("tileSheet", "tileset")).toEqual(["tilePreview", "logs", "metrics"]);
expect(getBottomPanelSections("tileSheet", "spriteSheet")).toEqual(["timeline", "logs", "metrics"]);
expect(getBottomPanelSections("single", "background")).toEqual(["logs", "metrics"]);
```

- [x] **Step 3: Run red tests**

Run:

```powershell
npm run test -w @pixelaid/web -- tileDiagnosticsView bottomPanelLayout
```

Expected red: missing formatter and old bottom-panel signature.

- [x] **Step 4: Implement formatting helpers**

Create `apps/web/src/lib/tileDiagnosticsView.ts`:

```ts
import type { SceneAssetDiagnostics, TilesetSeamDiagnostics } from "@pixelaid/shared";

export type DiagnosticsSummary = {
  status: "OK" | "Review";
  summary: string;
  warnings: string[];
};

export function formatTilesetDiagnosticsSummary(diagnostics: TilesetSeamDiagnostics | null): DiagnosticsSummary {
  // implementation
}

export function formatSceneDiagnosticsSummary(diagnostics: SceneAssetDiagnostics | null): DiagnosticsSummary {
  // implementation
}
```

Use percent formatting with `Math.round(score * 100)`.

- [x] **Step 5: Update bottom panel routing**

In `apps/web/src/lib/bottomPanelLayout.ts`, update:

```ts
import type { AssetMode, AssetType } from "@pixelaid/shared";

export type BottomPanelSection = "timeline" | "tilePreview" | "logs" | "metrics";

export function getBottomPanelSections(mode: AssetMode, assetType: AssetType = "sprite"): BottomPanelSection[] {
  if (assetType === "tileset") {
    return ["tilePreview", "logs", "metrics"];
  }
  if (mode === "single") {
    return ["logs", "metrics"];
  }
  return ["timeline", "logs", "metrics"];
}
```

- [x] **Step 6: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- tileDiagnosticsView bottomPanelLayout
```

Expected: pass.

Commit:

```powershell
git add apps/web/src/lib/tileDiagnosticsView.ts apps/web/src/lib/tileDiagnosticsView.test.ts apps/web/src/lib/bottomPanelLayout.ts apps/web/src/lib/bottomPanelLayout.test.ts
git commit -m "feat(web): format tile and scene diagnostics"
```

---

### Task 7: App Integration for Tileset Repeat Preview and Scene Diagnostics

**Parallelizable:** No. This coordinates state, imports, UI, and diagnostics.

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/lib/assetTypePresets.ts`
- Modify: `apps/web/src/lib/assetTypePresets.test.ts`
- Modify: `apps/web/src/lib/fixSuggestions.ts`
- Modify: `apps/web/src/lib/fixSuggestions.test.ts`
- Modify: `apps/web/src/lib/guidedFix.ts`
- Modify: `apps/web/src/lib/guidedFix.test.ts`

- [ ] **Step 1: Update preset and suggestion tests**

Update `apps/web/src/lib/assetTypePresets.test.ts`:

```ts
test("keeps tileset cleanup conservative while enabling seam diagnostics", () => {
  const preset = getAssetTypeCleanupPreset("tileset");

  expect(preset.alpha).toBe("preserve");
  expect(preset.removeOrphans).toBe(false);
  expect(preset.warningCodes).toContain("tileset-engine-metadata-next");
});
```

Update `apps/web/src/lib/fixSuggestions.test.ts` tileset expectation:

```ts
expect(suggestion.categoryWarnings.map((warning) => warning.code)).toContain("tileset-engine-metadata-next");
```

Add a tilemap/background inspect suggestion test if missing:

```ts
test("keeps tilemap-like manual assets preservation-oriented", () => {
  const preset = getAssetTypeCleanupPreset("tilemap");

  expect(preset.alpha).toBe("preserve");
  expect(preset.denoiseStrength).toBe(0);
  expect(getAssetTypeWarnings("tilemap").map((warning) => warning.code)).toContain("tilemap-inspect-only");
});
```

- [ ] **Step 2: Run red tests**

Run:

```powershell
npm run test -w @pixelaid/web -- assetTypePresets fixSuggestions guidedFix
```

Expected red: warning code/support wording is still old.

- [ ] **Step 3: Update web presets and suggestion copy**

In `apps/web/src/lib/assetTypePresets.ts`:

- Replace `"tileset-seams-inspect-only"` with `"tileset-engine-metadata-next"`.
- Replace `"tilemap-future"` with `"tilemap-inspect-only"`.
- Update `codeToAssetTypeWarningMessage` to match shared messages.

In `apps/web/src/lib/fixSuggestions.ts`, update tileset reason:

```ts
reason = "Square, evenly divisible source looks like a tileset; repeat preview and seam diagnostics are available.";
```

In `apps/web/src/lib/guidedFix.ts`, update tileSheet intent:

```ts
intent: input.assetType === "tileset"
  ? "Start by checking cell size, repeat preview, seam risk, palette limits, and transparent background handling."
  : "Start by checking cell size, palette limits, and transparent background handling before export.",
```

- [ ] **Step 4: Integrate diagnostics in `App.tsx`**

In `apps/web/src/App.tsx`, import:

```ts
import { analyzeSceneAssetDiagnostics, analyzeTilesetSeams } from "@pixelaid/core";
import { TileRepeatPreviewCanvas } from "./components/TileRepeatPreviewCanvas";
import { getTilePreviewFrame } from "./lib/tileRepeatPreview";
import { formatSceneDiagnosticsSummary, formatTilesetDiagnosticsSummary } from "./lib/tileDiagnosticsView";
```

Update bottom sections:

```ts
const bottomPanelSections = useMemo(() => getBottomPanelSections(mode, assetType), [assetType, mode]);
```

Add memoized diagnostics near existing palette/timeline memos:

```ts
const tilesetDiagnostics = useMemo(
  () =>
    assetType === "tileset" && previewImage && sheetMode
      ? analyzeTilesetSeams(previewImage, sheetOptions)
      : null,
  [assetType, previewImage, sheetMode, sheetOptions]
);
const sceneDiagnostics = useMemo(
  () =>
    (assetType === "background" || assetType === "tilemap") && selectedAsset
      ? analyzeSceneAssetDiagnostics(selectedAsset.image, { assetType, spritePaletteBudget: 32 })
      : null,
  [assetType, selectedAsset]
);
const tileDiagnosticsSummary = useMemo(() => formatTilesetDiagnosticsSummary(tilesetDiagnostics), [tilesetDiagnostics]);
const sceneDiagnosticsSummary = useMemo(() => formatSceneDiagnosticsSummary(sceneDiagnostics), [sceneDiagnostics]);
const tilePreviewFrame = useMemo(() => getTilePreviewFrame(sheetFrames, selectedFrameIndex), [selectedFrameIndex, sheetFrames]);
```

Add readouts in the Asset or Frame / Cell inspector group:

```tsx
{assetType === "tileset" ? (
  <>
    <ReadonlyField label="Seam risk" value={tileDiagnosticsSummary.summary} text />
    {tileDiagnosticsSummary.warnings.length > 0 ? (
      <div className="asset-type-warning-list" aria-label="Tileset diagnostics">
        {tileDiagnosticsSummary.warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
      </div>
    ) : null}
  </>
) : null}
{sceneDiagnostics ? (
  <>
    <ReadonlyField label="Scene detail" value={sceneDiagnosticsSummary.summary} text />
    {sceneDiagnosticsSummary.warnings.length > 0 ? (
      <div className="asset-type-warning-list" aria-label="Scene diagnostics">
        {sceneDiagnosticsSummary.warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
      </div>
    ) : null}
  </>
) : null}
```

Add a bottom panel section where existing timeline/logs/metrics sections are rendered:

```tsx
{bottomPanelSections.includes("tilePreview") ? (
  <section className="bottom-panel-section tile-preview-section" aria-label="Tile repeat preview">
    <div className="panel-section-heading">
      <h2>Repeat Preview</h2>
      <span>{tileDiagnosticsSummary.status}</span>
    </div>
    <TileRepeatPreviewCanvas image={previewImage} frame={tilePreviewFrame} diagnostics={tilesetDiagnostics} />
  </section>
) : null}
```

Use existing local class conventions; do not nest UI cards.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- assetTypePresets fixSuggestions guidedFix bottomPanelLayout tileDiagnosticsView tileRepeatPreview
```

Expected: pass.

Commit:

```powershell
git add apps/web/src/App.tsx apps/web/src/lib/assetTypePresets.ts apps/web/src/lib/assetTypePresets.test.ts apps/web/src/lib/fixSuggestions.ts apps/web/src/lib/fixSuggestions.test.ts apps/web/src/lib/guidedFix.ts apps/web/src/lib/guidedFix.test.ts
git commit -m "feat(web): surface tile and scene diagnostics"
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/editor.md`
- Modify: `docs/algorithms.md`
- Modify: `docs/performance.md`
- Modify: `docs/superpowers/plans/2026-04-28-mig-13-tileset-background-diagnostics.md`

- [ ] **Step 1: Update editor docs**

In `docs/editor.md`, update:

- Asset type table: tileset support now includes repeat preview and seam diagnostics.
- Tilemap: inspect-only map-data warning.
- Background: preservation diagnostics.
- Frame / Cell: tile sheet controls feed seam analysis.
- Viewport or Timeline section: repeat preview is canvas-based and appears for tilesets.
- Metrics: seam risk, lighting risk, palette/detail-density warnings.

- [ ] **Step 2: Update algorithm docs**

In `docs/algorithms.md`, add sections:

```md
## Tileset Seam Diagnostics

PixelAid compares adjacent tile edges in native pixel space. It reports edge mismatch, lighting discontinuity, and repeat risk without rewriting tile pixels.
```

```md
## Scene Diagnostics

Background and tilemap diagnostics sample large images for color-bin count and detail density. These diagnostics bias the UI toward preservation-first cleanup and warn when sprite-style palette or alpha settings would be destructive.
```

- [ ] **Step 3: Update performance docs**

In `docs/performance.md`, add a note that diagnostics use bounded deterministic sampling and typed arrays.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run typecheck
npm run test
npm run build
```

Expected: pass.

Commit:

```powershell
git add docs/editor.md docs/algorithms.md docs/performance.md docs/superpowers/plans/2026-04-28-mig-13-tileset-background-diagnostics.md
git commit -m "docs(web): document tile and scene diagnostics"
```

---

### Task 9: Final Verification and Linear Update

**Files:**
- No planned file changes except fixes discovered during verification.

- [ ] **Step 1: Full verification**

Run:

```powershell
npm run typecheck
npm run test
npm run build
```

Expected: pass.

- [ ] **Step 2: Local server smoke**

Start the app from `apps/web` on a free port:

```powershell
npm run dev -- --host 127.0.0.1 --port 5176
```

Confirm HTTP 200:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:5176" -UseBasicParsing
```

Expected: `StatusCode` 200.

If browser automation is available, also verify:

- Import/select a tileset-like fixture or manual tileset asset.
- Asset type shows Tileset.
- Bottom panel shows Repeat Preview instead of Timeline for tilesets.
- Seam risk readout appears.
- Background asset still defaults to preserve alpha and no denoise.

- [ ] **Step 3: Update Linear**

After user confirmation for the Linear write:

- Add a completion comment to `MIG-13` with implementation summary and verification commands.
- Move `MIG-13` to Done.

- [ ] **Step 4: Foundation handoff**

After user approval, fast-forward `codex/pixelaid-roadmap-foundation` to include `codex/mig-13-tileset-background-diagnostics`.

---

## Subagent Flow

- Main agent:
  - Task 1 shared contracts.
  - Task 7 App integration.
  - Task 8 docs.
  - Task 9 verification/Linear/foundation.
- Worker A:
  - Task 2 core tileset seam diagnostics.
- Worker B:
  - Task 3 core scene diagnostics.
- Worker C:
  - Task 5 repeat-preview model and canvas.
- Worker D, optional:
  - Task 4 fixture expansion.
- Task 6 can be assigned to a worker after Tasks 2/3/5 are complete, or kept with main if App integration is imminent.

## Acceptance Criteria

- Users can classify or auto-detect tileset/tilemap/background-like inputs.
- Tileset assets have deterministic seam diagnostics.
- Tileset preview repeats tiles and exposes obvious edge seams.
- Diagnostics identify seam, lighting, palette-density, and detail-density risks without rewriting assets.
- Background mode remains preservation-oriented.
- Tilemap stays inspect-only and does not imply map-data export.
- Tests cover seamless and broken tilesets, scene diagnostics, repeat-preview layout, formatting, and bottom-panel routing.
- `npm run typecheck`, `npm run test`, and `npm run build` pass.
