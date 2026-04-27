# MIG-8 Production Palette Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic production palette workflows: stronger quantization, fixed/custom palettes, sheet/first-frame palette locking, palette drift diagnostics, manifest metadata, and editor controls.

**Architecture:** Keep all palette decisions in `packages/core` and serializable contracts in `packages/shared`. The web app only edits palette settings and previews palettes; it does not implement image-processing behavior. No new dependency should be added for MIG-8 unless the worker stops and gets explicit approval with a license/bundle-size note.

**Tech Stack:** TypeScript, Vite/React, Vitest, existing npm workspaces.

---

## Current State

- `packages/core/src/palette.ts` extracts palettes by exact/frequency counts with coarse RGB quantization, then remaps every visible pixel to the nearest palette color.
- `packages/core/src/fix.ts` uses `options.palette ?? extractPaletteWithReservedColors(...)`, so a provided palette already behaves like fixed palette input, but the option contract does not explain mode/locking/diagnostics.
- Sprite-sheet fixes clean frames, pack them, extract one palette from the packed sheet, and remap the final sheet. This is already closer to sheet-wide locking, but it is implicit and has no first-frame mode or drift warning.
- `packages/shared/src/types.ts` has `maxColors` and optional `palette` but no palette settings or diagnostics type.
- `apps/web/src/App.tsx` exposes only "Max colors" plus source/output swatches. `apps/web/src/lib/palettePreview.ts` only ranks visible exact source colors.
- Manifest export already includes `meta.palette` and `meta.operation.settings`; new palette settings/diagnostics will be persisted there once added to shared types/result diagnostics.

## MIG-8 Scope Decisions

- Add an in-house deterministic median-cut-like quantizer behind an adapter API. Keep the existing frequency path as a selectable legacy strategy and fallback.
- Support budgets `8`, `16`, `24`, `32`, and `64`, while keeping numeric `maxColors` compatibility.
- Support fixed/custom palettes through explicit settings and existing `options.palette` backward compatibility.
- Support safe built-in presets that are authored in this repo. Do not add trademarked or third-party palette names/color sets unless licensing is documented first.
- Support first-frame and sheet-wide palette locking for sheet-like assets. Treat project locking as a serialized fixed/custom palette mode in this milestone; persistent project palette storage belongs in a later asset-browser issue.
- Keep dithering disabled. Add a serializable `dithering: "none"` setting and UI label only; do not implement ordered/error diffusion in MIG-8.

## File Structure

- Modify `packages/shared/src/types.ts`
  - Add `PaletteMode`, `PaletteStrategy`, `PaletteLockScope`, `PaletteDitheringMode`, `PaletteSettings`, `PaletteDiagnostics`, `PaletteDriftDiagnostics`.
  - Extend `FixOptions` with optional `paletteSettings?: PaletteSettings`.
  - Extend `PixelFixDiagnostics` with optional `palette?: PaletteDiagnostics`.
- Modify `packages/shared/src/index.ts`
  - Export the new palette-related types.
- Modify `packages/core/src/palette.ts`
  - Keep `extractPalette` and `remapToPalette` public for compatibility.
  - Add a small adapter API: `resolvePalette`, `extractAutoPalette`, `extractLockedPalette`, `analyzePaletteDrift`, `normalizePaletteSettings`, and helpers for fixed palettes/presets.
  - Implement deterministic median-cut-like palette extraction without new dependencies.
- Modify `packages/core/src/fix.ts`
  - Replace direct palette extraction with `resolvePalette(...)`.
  - Preserve outline reserved colors.
  - Wire first-frame/sheet-wide palette locking for sheet fixes.
  - Attach palette diagnostics to `PixelFixResult`.
- Modify `packages/core/src/index.ts`
  - Export the new palette functions/types needed by tests and UI utility code.
- Modify `packages/core/src/core.test.ts`
  - Add tests for auto budgets, fixed palette remap, preset palette remap, first-frame lock, sheet-wide lock, drift warnings, and no colors outside active palette.
- Modify `packages/exporters/src/manifest.test.ts`
  - Add assertions that palette settings and diagnostics are reproducible in manifest operation metadata.
- Modify `apps/web/src/lib/palettePreview.ts`
  - Add pure helpers for palette text parsing/formatting, budget clamping, palette mode labels, and drift warning formatting if they do not fit better in a new file.
- Modify or create `apps/web/src/lib/paletteControls.ts`
  - Prefer creating this file if `palettePreview.ts` starts mixing image preview and control parsing responsibilities.
- Modify or create tests:
  - `apps/web/src/lib/palettePreview.test.ts`
  - `apps/web/src/lib/paletteControls.test.ts` if `paletteControls.ts` is created.
- Modify `apps/web/src/App.tsx`
  - Add palette mode, strategy, lock scope, preset/custom controls, output palette review, and drift warning surfacing.
  - Include palette settings in `buildFixOptions`.
- Modify `docs/algorithms.md`
  - Document palette mode, quantization strategy, locking, and drift warnings.
- Modify `docs/licensing.md`
  - State that MIG-8 adds no dependency and only repo-authored safe palette presets.

---

### Task 1: Shared Palette Contract

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/shared.test.ts` or existing shared tests if they cover type constants

- [ ] **Step 1: Add failing type-level/runtime tests for palette constants**

Add exported palette budget/preset constants in shared only if needed by tests. If shared currently has no runtime constants file, use core/web tests later instead and keep this task to types only.

Run:

```powershell
npm run typecheck -w @pixelaid/shared
```

Expected: fail until the new types are added where referenced by later tasks.

- [ ] **Step 2: Add palette types**

In `packages/shared/src/types.ts`, add:

```ts
export type PaletteMode = "auto" | "fixed" | "preset";

export type PaletteStrategy = "medianCut" | "frequency";

export type PaletteLockScope = "single" | "firstFrame" | "sheet" | "project";

export type PaletteDitheringMode = "none";

export type PaletteSettings = {
  mode?: PaletteMode;
  strategy?: PaletteStrategy;
  maxColors?: number;
  colors?: string[];
  preset?: string;
  lockScope?: PaletteLockScope;
  dithering?: PaletteDitheringMode;
};

export type PaletteDriftDiagnostics = {
  frameCount: number;
  checkedFrameCount: number;
  maxFrameColorCount: number;
  maxFramePaletteDelta: number;
  warnings: string[];
};

export type PaletteDiagnostics = {
  mode: PaletteMode;
  strategy: PaletteStrategy;
  lockScope: PaletteLockScope;
  maxColors: number;
  inputColorCount: number;
  outputColorCount: number;
  palette: string[];
  fixedColorCount?: number;
  preset?: string;
  dithering: PaletteDitheringMode;
  drift?: PaletteDriftDiagnostics;
  warnings: string[];
};
```

Extend existing types:

```ts
export type PixelFixDiagnostics = {
  alpha?: AlphaCleanupDiagnostics;
  palette?: PaletteDiagnostics;
};

export type FixOptions = {
  // existing fields...
  palette?: string[];
  paletteSettings?: PaletteSettings;
  // existing fields...
};
```

Keep `palette?: string[]` for backward compatibility.

- [ ] **Step 3: Export types**

Update `packages/shared/src/index.ts` if needed so the new palette types are exported with the rest of shared.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/shared
npm run test -w @pixelaid/shared
```

Expected: both pass.

Commit:

```powershell
git add packages/shared/src/types.ts packages/shared/src/index.ts
git commit -m "feat(shared): add palette workflow contracts"
```

---

### Task 2: Core Palette Adapter and Quantizer

**Files:**
- Modify: `packages/core/src/palette.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/core.test.ts`

- [ ] **Step 1: Add failing core tests**

In `packages/core/src/core.test.ts`, extend `describe("palette reduction", ...)` with tests shaped like:

```ts
test("extracts deterministic median-cut palettes within standard budgets", () => {
  const source = imageFromPixels(8, [
    rgba(10, 12, 16), rgba(12, 14, 18), rgba(80, 132, 120), rgba(84, 136, 124),
    rgba(150, 72, 88), rgba(154, 76, 92), rgba(230, 210, 120), rgba(236, 216, 126)
  ]);

  const result = resolvePalette(source, {
    requested: { mode: "auto", strategy: "medianCut", maxColors: 4, dithering: "none" },
    fallbackMaxColors: 4
  });

  expect(result.palette).toHaveLength(4);
  expect(new Set(result.palette).size).toBe(4);
  expect(result.diagnostics.strategy).toBe("medianCut");
  expect(result.diagnostics.maxColors).toBe(4);
});

test("fixed palette mode remaps only to provided colors", () => {
  const source = imageFromPixels(4, [rgba(3, 4, 5), rgba(248, 248, 248), rgba(120, 180, 160), rgba(130, 190, 170)]);
  const result = resolvePalette(source, {
    requested: { mode: "fixed", colors: ["#000000", "#ffffff"], dithering: "none" },
    fallbackMaxColors: 8
  });
  const remapped = remapToPalette(source, result.palette);

  expect(result.palette).toEqual(["#000000", "#ffffff"]);
  expect(visibleColors(remapped)).toEqual(new Set(["#000000", "#ffffff"]));
});
```

Use existing helper style in `core.test.ts`; add a local `visibleColors` helper if needed.

Run:

```powershell
npm run test -w @pixelaid/core -- src/core.test.ts -t "palette reduction"
```

Expected: fail because `resolvePalette` is not implemented/exported.

- [ ] **Step 2: Implement adapter API**

In `packages/core/src/palette.ts`, add:

```ts
import type { PaletteDiagnostics, PaletteSettings, PaletteStrategy, RGBAImage, SpriteFrame } from "@pixelaid/shared";
```

Add exported types local to core:

```ts
export type ResolvePaletteOptions = {
  requested?: PaletteSettings;
  fallbackMaxColors: number;
  reservedColors?: readonly string[];
  frames?: readonly SpriteFrame[];
  lockSourceFrame?: SpriteFrame;
};

export type ResolvedPalette = {
  palette: string[];
  diagnostics: PaletteDiagnostics;
};
```

Add functions:

```ts
export function resolvePalette(image: RGBAImage, options: ResolvePaletteOptions): ResolvedPalette {
  const settings = normalizePaletteSettings(options.requested, options.fallbackMaxColors);
  const reserved = uniqueHexColors(options.reservedColors ?? []);
  const requestedColors = settings.mode === "fixed" ? uniqueHexColors(settings.colors ?? []) : [];
  const presetColors = settings.mode === "preset" ? getPalettePresetColors(settings.preset) : [];
  const fixedColors = settings.mode === "fixed" ? requestedColors : presetColors;
  const maxColors = Math.max(1, settings.maxColors ?? options.fallbackMaxColors);

  const palette =
    fixedColors.length > 0
      ? fixedColors
      : extractAutoPalette(selectPaletteSource(image, options), maxColors, settings.strategy, reserved);

  const outputPalette = mergeReservedPalette(palette, reserved, maxColors);
  return {
    palette: outputPalette,
    diagnostics: {
      mode: settings.mode,
      strategy: settings.strategy,
      lockScope: settings.lockScope,
      maxColors,
      inputColorCount: countVisibleExactColors(image),
      outputColorCount: outputPalette.length,
      palette: outputPalette,
      ...(fixedColors.length > 0 ? { fixedColorCount: fixedColors.length } : {}),
      ...(settings.preset ? { preset: settings.preset } : {}),
      dithering: settings.dithering,
      warnings: []
    }
  };
}
```

Implement these helpers with deterministic behavior:

- `normalizePaletteSettings(...)`
- `extractAutoPalette(...)`
- `extractMedianCutPalette(...)`
- `extractFrequencyPalette(...)` using current `extractPalette`
- `uniqueHexColors(...)` using `parseHexColor`/`rgbToHex`
- `mergeReservedPalette(...)`
- `countVisibleExactColors(...)`
- `selectPaletteSource(...)`, initially returning the full image unless Task 3 adds frame-aware selection
- `getPalettePresetColors(...)` with repo-authored presets only:

```ts
const SAFE_PALETTE_PRESETS: Record<string, string[]> = {
  "pixelaid-mono-4": ["#0f172a", "#475569", "#cbd5e1", "#f8fafc"],
  "pixelaid-arcade-8": ["#101112", "#2f3742", "#48636f", "#5c8d78", "#9bb66f", "#d6c86e", "#d98b5f", "#f4efe4"],
  "pixelaid-ui-8": ["#0b0f19", "#1f2937", "#374151", "#6b7280", "#d1d5db", "#f9fafb", "#60a5fa", "#f97316"]
};
```

Keep exported `extractPalette(image, maxColors)` behavior compatible by making it call `extractFrequencyPalette(...)` or leaving it intact.

- [ ] **Step 3: Export adapter API**

Update `packages/core/src/index.ts`:

```ts
export { extractPalette, remapToPalette, resolvePalette, extractAutoPalette, analyzePaletteDrift } from "./palette";
export type { ResolvePaletteOptions, ResolvedPalette } from "./palette";
```

If `analyzePaletteDrift` is not implemented until Task 3, do not export it yet; add it in Task 3.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/core -- src/core.test.ts -t "palette reduction"
npm run typecheck -w @pixelaid/core
```

Expected: pass.

Commit:

```powershell
git add packages/core/src/palette.ts packages/core/src/index.ts packages/core/src/core.test.ts
git commit -m "feat(core): add deterministic palette resolver"
```

---

### Task 3: Wire Palette Modes Into Fix Pipeline

**Files:**
- Modify: `packages/core/src/fix.ts`
- Modify: `packages/core/src/core.test.ts`

- [ ] **Step 1: Add failing fix pipeline tests**

Add tests in `describe("fix pipeline", ...)`:

```ts
test("fixed palette mode maps fixed output only to configured colors", () => {
  const source = imageFromPixels(4, [rgba(15, 15, 15), rgba(245, 245, 245), rgba(70, 150, 130), rgba(90, 170, 150)]);
  const result = fixImage(source, {
    ...defaultOptions,
    targetWidth: 4,
    targetHeight: 1,
    maxColors: 8,
    paletteSettings: { mode: "fixed", colors: ["#000000", "#ffffff"], dithering: "none" }
  });

  expect(result.palette).toEqual(["#000000", "#ffffff"]);
  expect(result.diagnostics?.palette?.mode).toBe("fixed");
  expect(visibleColors(result.image)).toEqual(new Set(["#000000", "#ffffff"]));
});

test("preset palette mode records preset metadata", () => {
  const result = fixImage(blockySource(), {
    ...defaultOptions,
    paletteSettings: { mode: "preset", preset: "pixelaid-arcade-8", dithering: "none" }
  });

  expect(result.diagnostics?.palette).toMatchObject({
    mode: "preset",
    preset: "pixelaid-arcade-8",
    dithering: "none"
  });
  expect(result.palette.length).toBeGreaterThan(0);
});
```

Run:

```powershell
npm run test -w @pixelaid/core -- src/core.test.ts -t "fixed palette|preset palette"
```

Expected: fail until `fixImage` uses `resolvePalette`.

- [ ] **Step 2: Replace direct extraction in single-image path**

In `packages/core/src/fix.ts`, replace:

```ts
const reservedPalette = reservedOutlinePalette(options);
const palette = options.palette ?? extractPaletteWithReservedColors(outlineCleaned, options.maxColors, reservedPalette);
const remapped = remapToPalette(outlineCleaned, palette);
```

with:

```ts
const reservedPalette = reservedOutlinePalette(options);
const paletteResult = resolvePalette(outlineCleaned, {
  requested: resolvePaletteSettings(options),
  fallbackMaxColors: options.maxColors,
  reservedColors: reservedPalette
});
const remapped = remapToPalette(outlineCleaned, paletteResult.palette);
```

Add `palette: paletteResult.diagnostics` beside existing alpha diagnostics:

```ts
diagnostics: {
  alpha: alphaResult.diagnostics,
  palette: paletteResult.diagnostics
}
```

Implement `resolvePaletteSettings(options)` so legacy `options.palette` still works:

```ts
function resolvePaletteSettings(options: FixOptions): PaletteSettings | undefined {
  if (options.paletteSettings) {
    return options.paletteSettings;
  }
  if (options.palette) {
    return { mode: "fixed", colors: options.palette, lockScope: "single", dithering: "none" };
  }
  return undefined;
}
```

- [ ] **Step 3: Replace direct extraction in sheet path**

In `fixSheetFrames`, replace packed-sheet palette extraction with the same resolver:

```ts
const paletteResult = resolvePalette(packed, {
  requested: resolvePaletteSettings(options),
  fallbackMaxColors: options.maxColors,
  reservedColors: reservedPalette,
  frames
});
const remapped = remapToPalette(packed, paletteResult.palette);
```

Attach `paletteResult.diagnostics` next to alpha diagnostics without dropping alpha:

```ts
diagnostics: {
  ...(alphaDiagnostics ? { alpha: alphaDiagnostics } : {}),
  palette: paletteResult.diagnostics
}
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/core -- src/core.test.ts
npm run typecheck -w @pixelaid/core
```

Expected: pass.

Commit:

```powershell
git add packages/core/src/fix.ts packages/core/src/core.test.ts
git commit -m "feat(core): wire palette modes into fixes"
```

---

### Task 4: Sheet Locking and Palette Drift Diagnostics

**Files:**
- Modify: `packages/core/src/palette.ts`
- Modify: `packages/core/src/fix.ts`
- Modify: `packages/core/src/core.test.ts`
- Use fixture: `packages/fixtures/src/paletteDriftAnimationFrames.ts`

- [ ] **Step 1: Add failing sheet-lock tests**

Add tests in `packages/core/src/core.test.ts`:

```ts
test("locks animation sheet output to one shared palette", () => {
  const fixture = paletteDriftAnimationFixtures[0]!;
  const result = fixImage(fixture.image, {
    mode: "spriteSheet",
    assetType: "animationSheet",
    targetWidth: 96,
    targetHeight: 32,
    maxColors: 8,
    grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
    downscale: "dominant",
    alpha: "preserve",
    cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true },
    sheet: fixture.expected.sheet!.options,
    sheetFrames: fixture.expected.sheet!.frames,
    paletteSettings: { mode: "auto", strategy: "medianCut", lockScope: "sheet", maxColors: 8, dithering: "none" }
  });

  expect(result.palette.length).toBeLessThanOrEqual(8);
  expect(visibleColors(result.image).size).toBeLessThanOrEqual(8);
  expect(result.diagnostics?.palette?.lockScope).toBe("sheet");
  expect(result.diagnostics?.palette?.drift?.warnings.length).toBeGreaterThan(0);
});

test("first-frame palette lock reuses first frame colors across the sheet", () => {
  const fixture = paletteDriftAnimationFixtures[0]!;
  const result = fixImage(fixture.image, {
    mode: "spriteSheet",
    assetType: "animationSheet",
    targetWidth: 96,
    targetHeight: 32,
    maxColors: 6,
    grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
    downscale: "dominant",
    alpha: "preserve",
    cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true },
    sheet: fixture.expected.sheet!.options,
    sheetFrames: fixture.expected.sheet!.frames,
    paletteSettings: { mode: "auto", strategy: "medianCut", lockScope: "firstFrame", maxColors: 6, dithering: "none" }
  });

  expect(result.diagnostics?.palette?.lockScope).toBe("firstFrame");
  expect(result.palette.length).toBeLessThanOrEqual(6);
});
```

Import `paletteDriftAnimationFixtures` from `@pixelaid/fixtures`.

Run:

```powershell
npm run test -w @pixelaid/core -- src/core.test.ts -t "palette lock"
```

Expected: fail until frame-aware locking and drift diagnostics are implemented.

- [ ] **Step 2: Implement frame source selection**

In `packages/core/src/palette.ts`, add support for `lockScope`:

- `single`: full image.
- `sheet`: full packed sheet.
- `firstFrame`: crop a temporary `RGBAImage` from `frames[0].rect`.
- `project`: use fixed/custom colors if supplied; otherwise fall back to `sheet` for sheet assets and `single` for non-sheet assets with a warning.

Add a helper:

```ts
function createFramePaletteSource(image: RGBAImage, frame: SpriteFrame): RGBAImage {
  const output = {
    width: frame.rect.w,
    height: frame.rect.h,
    data: new Uint8ClampedArray(frame.rect.w * frame.rect.h * 4)
  };
  for (let y = 0; y < frame.rect.h; y += 1) {
    const sourceStart = ((frame.rect.y + y) * image.width + frame.rect.x) * 4;
    const targetStart = y * frame.rect.w * 4;
    output.data.set(image.data.subarray(sourceStart, sourceStart + frame.rect.w * 4), targetStart);
  }
  return output;
}
```

- [ ] **Step 3: Implement drift diagnostics**

Add:

```ts
export function analyzePaletteDrift(image: RGBAImage, frames: readonly SpriteFrame[] | undefined, activePalette: readonly string[], maxColors: number): PaletteDriftDiagnostics | undefined {
  if (!frames || frames.length <= 1) {
    return undefined;
  }
  // Extract each frame palette with frequency strategy, compare against active palette.
  // Record max frame color count and max frame palette delta.
}
```

Use exact/quantized frame palettes and count how many frame palette colors are not in the active palette after quantization. Add warnings such as:

```ts
`Palette drift detected across ${frames.length} frames; ${maxDelta} frame colors remap outside the active palette.`
```

Attach `drift` to diagnostics in `resolvePalette(...)` when frames exist.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/core -- src/core.test.ts -t "palette"
npm run test -w @pixelaid/fixtures
npm run typecheck -w @pixelaid/core
```

Expected: pass.

Commit:

```powershell
git add packages/core/src/palette.ts packages/core/src/fix.ts packages/core/src/core.test.ts
git commit -m "feat(core): add palette locking diagnostics"
```

---

### Task 5: Manifest Metadata and Documentation

**Files:**
- Modify: `packages/exporters/src/manifest.test.ts`
- Modify: `docs/algorithms.md`
- Modify: `docs/licensing.md`

- [ ] **Step 1: Add failing manifest assertions**

In `packages/exporters/src/manifest.test.ts`, add a test or extend the deterministic metadata test:

```ts
test("preserves palette workflow settings and diagnostics in operation metadata", () => {
  const paletteResult: PixelFixResult = {
    ...result,
    settings: {
      ...settings,
      paletteSettings: {
        mode: "auto",
        strategy: "medianCut",
        lockScope: "sheet",
        maxColors: 8,
        dithering: "none"
      }
    },
    diagnostics: {
      palette: {
        mode: "auto",
        strategy: "medianCut",
        lockScope: "sheet",
        maxColors: 8,
        inputColorCount: 120,
        outputColorCount: 8,
        palette: ["#000000", "#ffffff"],
        dithering: "none",
        warnings: ["Palette drift detected across 4 frames; 3 frame colors remap outside the active palette."],
        drift: {
          frameCount: 4,
          checkedFrameCount: 4,
          maxFrameColorCount: 12,
          maxFramePaletteDelta: 3,
          warnings: ["Palette drift detected across 4 frames; 3 frame colors remap outside the active palette."]
        }
      }
    }
  };

  const manifest = createPixelAssetManifest({ result: paletteResult, imageName: "hero_sheet.png" });

  expect(manifest.meta.operation.settings.paletteSettings).toMatchObject({ lockScope: "sheet", strategy: "medianCut" });
  expect(manifest.meta.operation.diagnostics?.palette).toMatchObject({ outputColorCount: 8, lockScope: "sheet" });
});
```

Run:

```powershell
npm run test -w @pixelaid/exporters -- src/manifest.test.ts
```

Expected: fail until shared/exporter types are aligned, then pass.

- [ ] **Step 2: Document palette algorithms**

Update `docs/algorithms.md` with a short "Palette workflows" section:

```md
## Palette Workflows

PixelAid supports auto, fixed, and safe preset palette modes. Auto mode defaults to deterministic median-cut quantization and can fall back to frequency ranking. Fixed and preset modes never emit visible colors outside the active palette. Dithering remains disabled in MIG-8 because automatic dithering can add animation shimmer.

For sheet-like assets, palette locking can use the whole sheet or the first frame. The fix result records drift diagnostics when frame-local palettes differ from the active locked palette.
```

- [ ] **Step 3: Document dependency/license decision**

Update `docs/licensing.md` "Direct Dependencies Added" section with:

```md
MIG-8 palette workflows add no new runtime or build dependency. The quantizer and safe palette presets are implemented in-repo to avoid GPL/AGPL/LGPL, commercial licensing, attribution, and bundle-size risk. Third-party named palettes should be added only after license/attribution review.
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/exporters -- src/manifest.test.ts
npm run typecheck -w @pixelaid/exporters
```

Expected: pass.

Commit:

```powershell
git add packages/exporters/src/manifest.test.ts docs/algorithms.md docs/licensing.md
git commit -m "docs(core): document palette workflow metadata"
```

---

### Task 6: Web Palette Controls and Warnings

**Files:**
- Modify: `apps/web/src/lib/palettePreview.ts`
- Create or modify: `apps/web/src/lib/paletteControls.ts`
- Modify: `apps/web/src/lib/palettePreview.test.ts`
- Create or modify: `apps/web/src/lib/paletteControls.test.ts`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Add failing pure helper tests**

If creating `paletteControls.ts`, add `apps/web/src/lib/paletteControls.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { formatPaletteText, parsePaletteText, normalizePaletteBudget, summarizePaletteWarnings } from "./paletteControls";

describe("palette controls", () => {
  test("parses custom palette text into normalized unique hex colors", () => {
    expect(parsePaletteText("#fff #112233\n445566, #112233")).toEqual(["#ffffff", "#112233", "#445566"]);
  });

  test("formats palettes one color per line", () => {
    expect(formatPaletteText(["#000000", "#ffffff"])).toBe("#000000\n#ffffff");
  });

  test("clamps palette budgets to supported values", () => {
    expect(normalizePaletteBudget(7)).toBe(8);
    expect(normalizePaletteBudget(17)).toBe(16);
    expect(normalizePaletteBudget(80)).toBe(64);
  });

  test("summarizes drift diagnostics as warnings", () => {
    expect(
      summarizePaletteWarnings({
        mode: "auto",
        strategy: "medianCut",
        lockScope: "sheet",
        maxColors: 8,
        inputColorCount: 48,
        outputColorCount: 8,
        palette: ["#000000"],
        dithering: "none",
        warnings: ["Palette drift detected across 4 frames; 3 frame colors remap outside the active palette."]
      })
    ).toEqual(["Palette drift detected across 4 frames; 3 frame colors remap outside the active palette."]);
  });
});
```

Run:

```powershell
npm run test -w @pixelaid/web -- src/lib/paletteControls.test.ts
```

Expected: fail until helpers exist.

- [ ] **Step 2: Implement helper functions**

Create `apps/web/src/lib/paletteControls.ts` with:

```ts
import type { PaletteDiagnostics } from "@pixelaid/shared";

export const paletteBudgets = [8, 16, 24, 32, 64] as const;

export function parsePaletteText(value: string): string[] {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const token of value.split(/[\s,;]+/)) {
    if (!token.trim()) continue;
    const normalized = normalizePaletteHex(token);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      colors.push(normalized);
    }
  }
  return colors;
}

export function formatPaletteText(colors: readonly string[]): string {
  return colors.join("\n");
}

export function normalizePaletteBudget(value: number): number {
  let best = paletteBudgets[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const budget of paletteBudgets) {
    const distance = Math.abs(value - budget);
    if (distance < bestDistance) {
      best = budget;
      bestDistance = distance;
    }
  }
  return best;
}

export function summarizePaletteWarnings(diagnostics: PaletteDiagnostics | undefined): string[] {
  return diagnostics?.warnings ?? [];
}

export function normalizePaletteHex(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex.split("").map((char) => `${char}${char}`).join("");
  }
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : null;
}
```

- [ ] **Step 3: Add App state and options wiring**

In `apps/web/src/App.tsx`, add state:

```ts
const [paletteMode, setPaletteMode] = useState<PaletteMode>("auto");
const [paletteStrategy, setPaletteStrategy] = useState<PaletteStrategy>("medianCut");
const [paletteLockScope, setPaletteLockScope] = useState<PaletteLockScope>("single");
const [palettePreset, setPalettePreset] = useState("pixelaid-arcade-8");
const [customPaletteText, setCustomPaletteText] = useState("");
```

Update `buildFixOptions` to include:

```ts
paletteSettings: {
  mode: paletteMode,
  strategy: paletteStrategy,
  maxColors,
  lockScope: sheetMode ? paletteLockScope : "single",
  dithering: "none",
  ...(paletteMode === "fixed" ? { colors: parsePaletteText(customPaletteText) } : {}),
  ...(paletteMode === "preset" ? { preset: palettePreset } : {})
}
```

Keep legacy `maxColors` intact.

- [ ] **Step 4: Add inspector controls**

In the cleanup panel near `Max colors`, add:

```tsx
<SelectField
  label="Palette"
  value={paletteMode}
  options={[
    ["auto", "Auto"],
    ["fixed", "Fixed"],
    ["preset", "Preset"]
  ]}
  onChange={(value) => setPaletteMode(value as PaletteMode)}
/>
<SelectField
  label="Quantizer"
  value={paletteStrategy}
  options={[
    ["medianCut", "Median cut"],
    ["frequency", "Frequency"]
  ]}
  disabled={paletteMode !== "auto"}
  onChange={(value) => setPaletteStrategy(value as PaletteStrategy)}
/>
{sheetMode ? (
  <SelectField
    label="Lock"
    value={paletteLockScope}
    options={[
      ["sheet", "Sheet"],
      ["firstFrame", "First frame"],
      ["project", "Project"]
    ]}
    onChange={(value) => setPaletteLockScope(value as PaletteLockScope)}
  />
) : null}
{paletteMode === "preset" ? (
  <SelectField
    label="Preset"
    value={palettePreset}
    options={[
      ["pixelaid-mono-4", "PixelAid Mono 4"],
      ["pixelaid-arcade-8", "PixelAid Arcade 8"],
      ["pixelaid-ui-8", "PixelAid UI 8"]
    ]}
    onChange={setPalettePreset}
  />
) : null}
{paletteMode === "fixed" ? (
  <label className="field-row field-row-stack">
    <span>Fixed colors</span>
    <textarea value={customPaletteText} spellCheck={false} onChange={(event) => setCustomPaletteText(event.currentTarget.value)} />
  </label>
) : null}
```

Use existing CSS classes where possible; add minimal CSS only if textarea layout is broken.

- [ ] **Step 5: Surface palette diagnostics**

Add warning display near `alphaWarningMessages`:

```ts
const paletteWarningMessages = summarizePaletteWarnings(fixResult?.diagnostics?.palette);
```

Render those warnings in the existing warning area, metrics/log panel, or palette panel. Also show mode/count:

```tsx
<PaletteSwatches label={`Output (${fixResult?.diagnostics?.palette?.mode ?? "auto"})`} colors={outputPalette.slice(0, 16)} emptyText="Run Fix" />
```

Update metrics:

```ts
["Palette", fixResult?.diagnostics?.palette ? `${fixResult.diagnostics.palette.mode} / ${fixResult.diagnostics.palette.lockScope}` : paletteMode]
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/web -- src/lib/palettePreview.test.ts src/lib/paletteControls.test.ts
npm run typecheck -w @pixelaid/web
npm run lint
```

Expected: pass.

Commit:

```powershell
git add apps/web/src/App.tsx apps/web/src/lib/palettePreview.ts apps/web/src/lib/palettePreview.test.ts apps/web/src/lib/paletteControls.ts apps/web/src/lib/paletteControls.test.ts
git commit -m "feat(web): expose palette workflow controls"
```

---

### Task 7: Full Verification and Linear Update

**Files:**
- No source changes expected unless verification finds a bug.

- [ ] **Step 1: Run full verification**

Run from `C:\dev\Mighty\pixel-aid\.worktrees\mig-8-palette-workflows`:

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
npm run benchmark
git status --short --branch
```

Expected:

- All commands pass.
- Worktree is clean.
- No new dependencies appear in `package.json` or lockfile unless explicitly approved.

- [ ] **Step 2: Review checklist**

Confirm:

- Fixed-palette mode never emits visible colors outside the active palette.
- Sheet/first-frame locking creates one stable shared palette across a multi-frame fixture.
- Palette drift warnings are present for animation/sprite-sheet assets when frame palettes vary.
- Manifest operation metadata includes `paletteSettings` and `diagnostics.palette`.
- Dithering remains disabled and serializable as `"none"`.
- No pixel-processing hot loop allocates per pixel beyond existing Map/count aggregation.
- `docs/licensing.md` says no dependency was added for MIG-8.

- [ ] **Step 3: Final Linear update**

Add a Linear comment to `MIG-8` with:

- Commit range.
- Implemented palette modes/locking.
- Verification commands and results.
- Any known follow-up, especially persistent project palette storage if deferred.

Then set Linear `MIG-8` to Done only after integration into `codex/pixelaid-roadmap-foundation`.

---

## Parallelization / Subagent Flow

- Task 1 must happen first because it defines the shared contract.
- Task 2 and Task 3 are core-heavy and should stay with one worker to avoid conflicts in `palette.ts`, `fix.ts`, and `core.test.ts`.
- Task 5 can run after Task 3 and is mostly independent.
- Task 6 can run after Task 1 and after the core option names in Task 2 are stable. It should be a separate web worker if we want parallelism.
- Recommended flow:
  1. Worker A: Tasks 1-4 (shared/core contract, quantizer, pipeline, locking).
  2. Worker B: Task 5 after Worker A finishes Task 3 (manifest/docs).
  3. Worker C: Task 6 after Worker A finishes Task 2 (web controls).
  4. Controller: run two-stage review after each worker slice, then integrate and verify.

## Self-Review

- Spec coverage:
  - Stronger quantization/remapping: Tasks 2-3.
  - Auto budgets 8/16/24/32/64: Tasks 2 and 6.
  - Fixed/custom palettes and safe presets: Tasks 2, 3, 6.
  - First-frame, sheet-wide, animation-wide/project-style locking: Tasks 3-4. Persistent project palette storage is intentionally deferred; fixed/custom project colors are serialized now.
  - Palette drift warnings: Tasks 4 and 6.
  - UI controls/review palettes: Task 6.
  - Dithering disabled by default: Tasks 1, 2, 5, 6.
  - Tests for extraction/locking/remapping/no unexpected colors: Tasks 2-4 and 6.
  - Manifest metadata: Task 5.
  - Dependency license review: Task 5.
- Placeholder scan: no placeholder tokens or incomplete test instructions remain.
- Type consistency: `PaletteSettings`, `PaletteDiagnostics`, `PaletteMode`, `PaletteStrategy`, `PaletteLockScope`, and `PaletteDitheringMode` are introduced in Task 1 and reused consistently.
