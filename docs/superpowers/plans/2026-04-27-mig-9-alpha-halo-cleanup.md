# MIG-9 Alpha And Halo Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden PixelAid's transparency cleanup so sprites/icons can remove AI matte artifacts safely while effects, UI, portraits, and backgrounds can preserve intentional soft alpha.

**Architecture:** Extend the shared cleanup contract first, then improve the pure core alpha/halo passes behind that contract. Add deterministic fixtures for matte/halo failure modes, wire web controls to explicit alpha settings, and keep manifest metadata reproducible through `FixOptions` plus operation diagnostics.

**Tech Stack:** TypeScript, npm workspaces, Vitest, typed arrays, React/Vite editor UI.

---

## Scope

Linear issue: `MIG-9` - Harden transparency and halo cleanup.

Worktree:

```txt
C:/dev/Mighty/pixel-aid/.worktrees/mig-9-alpha-halo
```

Branch:

```txt
codex/mig-9-alpha-halo
```

Base:

```txt
codex/pixelaid-roadmap-foundation @ 1393f21
```

## Current Baseline

MIG-9 has been fast-forwarded onto the integrated MIG-7 branch. Before implementation, verify:

```sh
npm run test
```

Expected: all workspace tests pass.

## File Structure

- Modify: `packages/shared/src/types.ts`
  - Add `AlphaMode` value `colorKey`.
  - Add `AlphaCleanupSettings`, `AlphaCleanupDiagnostics`, and optional result/manifest diagnostics.
- Modify: `packages/core/src/alpha.ts`
  - Robust background estimation, binary threshold diagnostics, color-key mode, transparent RGB decontamination.
- Modify: `packages/core/src/halo.ts`
  - Stronger matte/halo detection using edge/corner background model and conservative subject-neighbor replacement.
- Modify: `packages/core/src/fix.ts`
  - Pass `options.alphaSettings` into alpha cleanup, store diagnostics, and use explicit halo options.
- Modify: `packages/core/src/index.ts`
  - Export new alpha diagnostics/settings types from core where needed.
- Modify: `packages/core/src/core.test.ts`
  - Unit coverage for color-key cleanup, hidden RGB decontamination, threshold diagnostics, checkerboard/matte handling.
- Modify: `packages/core/src/fixtureSuite.test.ts`
  - Fixture-level assertions across preview backgrounds and safe transparent RGB.
- Modify: `packages/fixtures/src/transparentMatteHaloSprites.ts`
  - Add gray haze, baked checkerboard, and semi-transparent glow fixtures.
- Modify: `packages/fixtures/src/types.ts`
  - Extend expected alpha metadata enough for fixture assertions.
- Modify: `packages/exporters/src/manifest.test.ts`
  - Verify alpha mode/settings/diagnostics are preserved in manifest metadata.
- Modify: `apps/web/src/lib/assetTypePresets.ts`
  - Add type-aware alpha settings and warnings.
- Modify: `apps/web/src/lib/assetTypePresets.test.ts`
  - Cover sprite/icon strict defaults and preserve defaults for UI/background.
- Modify: `apps/web/src/lib/fixSuggestions.ts`
  - Return suggested alpha settings alongside mode.
- Modify: `apps/web/src/lib/fixSuggestions.test.ts`
  - Cover alpha suggestions for sprites/icons and preservation-oriented types.
- Modify: `apps/web/src/App.tsx`
  - Add alpha threshold/tolerance/decontaminate/color-key controls, corner-sample helper, and warnings.
- Modify: `docs/algorithms.md`
  - Document the new cleanup modes, diagnostics, and warnings.

No new runtime dependency is planned.

---

## Task 1: Shared Alpha Contract And Manifest Metadata

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/exporters/src/manifest.test.ts`

- [ ] **Step 1: Write failing manifest test**

Add a test in `packages/exporters/src/manifest.test.ts`:

```ts
test("preserves alpha cleanup settings and diagnostics in operation metadata", () => {
  const alphaResult: PixelFixResult = {
    ...result,
    settings: {
      ...settings,
      alpha: "colorKey",
      alphaSettings: {
        threshold: 144,
        tolerance: 22,
        colorKey: "#f8f8f8",
        decontaminateRgb: true,
        transparentRgb: "#000000"
      }
    },
    diagnostics: {
      alpha: {
        mode: "colorKey",
        threshold: 144,
        tolerance: 22,
        colorKey: "#f8f8f8",
        decontaminatedPixels: 12,
        transparentPixels: 100,
        softAlphaPixels: 0,
        warnings: []
      }
    }
  };

  const manifest = createPixelAssetManifest({
    result: alphaResult,
    imageName: "icon.png"
  });

  expect(manifest.meta.operation.settings.alpha).toBe("colorKey");
  expect(manifest.meta.operation.settings.alphaSettings).toMatchObject({
    threshold: 144,
    tolerance: 22,
    colorKey: "#f8f8f8"
  });
  expect(manifest.meta.operation.diagnostics?.alpha).toMatchObject({
    mode: "colorKey",
    decontaminatedPixels: 12
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```sh
npm run test -w @pixelaid/exporters -- src/manifest.test.ts -t "alpha cleanup settings"
```

Expected: TypeScript fails because `colorKey`, `alphaSettings`, and operation diagnostics do not exist.

- [ ] **Step 3: Extend shared types**

In `packages/shared/src/types.ts`:

```ts
export type AlphaMode = "preserve" | "binary" | "backgroundFloodFill" | "colorKey";

export type AlphaCleanupSettings = {
  threshold?: number;
  tolerance?: number;
  colorKey?: string;
  decontaminateRgb?: boolean;
  transparentRgb?: string;
};

export type AlphaCleanupDiagnostics = {
  mode: AlphaMode;
  threshold: number;
  tolerance: number;
  colorKey?: string;
  decontaminatedPixels: number;
  transparentPixels: number;
  softAlphaPixels: number;
  warnings: string[];
};

export type PixelFixDiagnostics = {
  alpha?: AlphaCleanupDiagnostics;
};
```

Then add:

```ts
alphaSettings?: AlphaCleanupSettings;
diagnostics?: PixelFixDiagnostics;
```

to `FixOptions` / `PixelFixResult` respectively, and add:

```ts
diagnostics?: PixelFixDiagnostics;
```

to `PixelAssetManifest.meta.operation`.

- [ ] **Step 4: Wire manifest diagnostics**

In `packages/exporters/src/manifest.ts`, include:

```ts
...(options.result.diagnostics ? { diagnostics: options.result.diagnostics } : {})
```

inside `meta.operation`.

- [ ] **Step 5: Run exporter test and verify GREEN**

Run:

```sh
npm run test -w @pixelaid/exporters -- src/manifest.test.ts -t "alpha cleanup settings"
```

Expected: targeted manifest test passes.

- [ ] **Step 6: Commit**

```sh
git add packages/shared/src/types.ts packages/exporters/src/manifest.ts packages/exporters/src/manifest.test.ts
git commit -m "feat(shared): add alpha cleanup metadata"
```

---

## Task 2: Core Alpha Modes, Diagnostics, And Decontamination

**Files:**
- Modify: `packages/core/src/alpha.ts`
- Modify: `packages/core/src/core.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing color-key test**

Add to `describe("alpha cleanup", ...)` in `packages/core/src/core.test.ts`:

```ts
test("removes pixels matching a configured color key", () => {
  const source = imageFromPixels(3, [
    rgba(248, 248, 248),
    rgba(120, 40, 80),
    rgba(250, 250, 250)
  ]);

  const { image: cleaned, diagnostics } = applyAlphaMode(source, "colorKey", {
    colorKey: "#f8f8f8",
    tolerance: 4,
    decontaminateRgb: true
  });

  expect(readPixel(cleaned, 0, 0)).toEqual([0, 0, 0, 0]);
  expect(readPixel(cleaned, 1, 0)).toEqual([120, 40, 80, 255]);
  expect(readPixel(cleaned, 2, 0)[3]).toBe(0);
  expect(diagnostics.mode).toBe("colorKey");
  expect(diagnostics.transparentPixels).toBe(2);
});
```

- [ ] **Step 2: Write failing hidden RGB test**

Add:

```ts
test("decontaminates hidden RGB in transparent binary-alpha pixels", () => {
  const source = imageFromPixels(2, [rgba(255, 255, 255, 12), rgba(20, 30, 40, 200)]);

  const { image: cleaned, diagnostics } = applyAlphaMode(source, "binary", {
    threshold: 128,
    decontaminateRgb: true,
    transparentRgb: "#000000"
  });

  expect(readPixel(cleaned, 0, 0)).toEqual([0, 0, 0, 0]);
  expect(readPixel(cleaned, 1, 0)).toEqual([20, 30, 40, 255]);
  expect(diagnostics.decontaminatedPixels).toBe(1);
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```sh
npm run test -w @pixelaid/core -- src/core.test.ts -t "alpha cleanup"
```

Expected: TypeScript/API failures because `applyAlphaMode` currently returns only `RGBAImage` and `colorKey` is unsupported.

- [ ] **Step 4: Add alpha cleanup result API**

In `packages/core/src/alpha.ts`, change the primary API to:

```ts
export type AlphaCleanupResult = {
  image: RGBAImage;
  diagnostics: AlphaCleanupDiagnostics;
};

export function applyAlphaMode(image: RGBAImage, mode: AlphaMode, options: AlphaCleanupSettings = {}): AlphaCleanupResult
```

Use a helper for defaults:

```ts
const threshold = clampByte(options.threshold ?? 128);
const tolerance = Math.max(0, Math.round(options.tolerance ?? 18));
const decontaminateRgb = options.decontaminateRgb ?? mode !== "preserve";
```

Update current callers in core tests and fix pipeline in later tasks. Do not leave a mixed return API.

- [ ] **Step 5: Implement `colorKey` and decontamination**

Implement:

- `parseHexColor` / `unpackRgb` reuse from `color.ts`.
- Color-key matching by RGB squared distance.
- Binary alpha thresholding with diagnostics.
- Transparent RGB decontamination for pixels whose resulting alpha is `0`.
- Preserve mode clone with optional decontamination only if `decontaminateRgb` is true.

Keep pixel loops numeric and typed-array based; do not allocate per pixel.

- [ ] **Step 6: Run alpha cleanup tests and verify GREEN**

Run:

```sh
npm run test -w @pixelaid/core -- src/core.test.ts -t "alpha cleanup"
```

Expected: alpha cleanup tests pass.

- [ ] **Step 7: Commit**

```sh
git add packages/core/src/alpha.ts packages/core/src/core.test.ts packages/core/src/index.ts
git commit -m "feat(core): add color-key alpha cleanup"
```

---

## Task 3: Robust Background Flood Fill And Checkerboard Fixtures

**Files:**
- Modify: `packages/core/src/alpha.ts`
- Modify: `packages/core/src/core.test.ts`
- Modify: `packages/fixtures/src/transparentMatteHaloSprites.ts`
- Modify: `packages/fixtures/src/types.ts`
- Modify: `packages/core/src/fixtureSuite.test.ts`

- [ ] **Step 1: Write failing gradient matte test**

Add to alpha cleanup tests:

```ts
test("flood-fills off-white edge gradients without removing the subject", () => {
  const source = createImage(5, 5);
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      writePixel(source, x, y, 246 + ((x + y) % 5), 246 + (x % 4), 244 + (y % 4), 255);
    }
  }
  writePixel(source, 2, 2, 50, 90, 130, 255);

  const { image: cleaned } = applyAlphaMode(source, "backgroundFloodFill", {
    tolerance: 12,
    decontaminateRgb: true
  });

  expect(readPixel(cleaned, 0, 0)).toEqual([0, 0, 0, 0]);
  expect(readPixel(cleaned, 4, 4)).toEqual([0, 0, 0, 0]);
  expect(readPixel(cleaned, 2, 2)).toEqual([50, 90, 130, 255]);
});
```

- [ ] **Step 2: Write failing checkerboard fixture test**

Add fixture `checkerboard-baked-alpha-matte` to `transparentMatteHaloSprites.ts`, where a sprite sits on alternating light checker cells. Then add a fixture-suite test that runs `backgroundFloodFill` or `colorKey` settings and asserts:

- Sample corner pixels become transparent.
- Visible near-white/near-gray halo pixels are below fixture threshold.
- Fully transparent pixels have RGB `[0, 0, 0]`.

- [ ] **Step 3: Run targeted tests and verify RED**

Run:

```sh
npm run test -w @pixelaid/core -- src/core.test.ts -t "flood-fills off-white"
npm run test -w @pixelaid/core -- src/fixtureSuite.test.ts -t "checkerboard"
```

Expected: tests fail with current single-top-left background comparison.

- [ ] **Step 4: Improve background model**

In `alpha.ts`, replace the fixed top-left comparison with an edge/corner model:

- Sample all four edges at a modest step.
- Quantize RGB into coarse buckets to identify one or two dominant matte colors.
- Treat checkerboard as two related dominant light buckets when both are high coverage and close in brightness.
- Flood fill from all image edges if a pixel matches any dominant matte bucket within tolerance.

Use typed arrays or small fixed arrays; avoid per-pixel objects in flood-fill loops.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run:

```sh
npm run test -w @pixelaid/core -- src/core.test.ts -t "alpha cleanup"
npm run test -w @pixelaid/core -- src/fixtureSuite.test.ts -t "checkerboard"
```

Expected: alpha and checkerboard tests pass.

- [ ] **Step 6: Commit**

```sh
git add packages/core/src/alpha.ts packages/core/src/core.test.ts packages/fixtures/src/transparentMatteHaloSprites.ts packages/fixtures/src/types.ts packages/core/src/fixtureSuite.test.ts
git commit -m "feat(core): improve matte background cleanup"
```

---

## Task 4: Halo Removal Fixtures And Safe Preview Assertions

**Files:**
- Modify: `packages/core/src/halo.ts`
- Modify: `packages/core/src/core.test.ts`
- Modify: `packages/fixtures/src/transparentMatteHaloSprites.ts`
- Modify: `packages/core/src/fixtureSuite.test.ts`

- [ ] **Step 1: Add failing halo fixture coverage**

Add fixtures:

- `gray-haze-matte-edge`
- `semi-transparent-glow-effect`

Add tests that compose fixed output against these backgrounds:

```ts
const previewBackgrounds = [
  [255, 255, 255, 255],
  [0, 0, 0, 255],
  [70, 126, 80, 255]
] as const;
```

Assert the fixed sprite has no visible pale/gray fringe counts above fixture thresholds when viewed over each background.

- [ ] **Step 2: Run tests and verify RED**

Run:

```sh
npm run test -w @pixelaid/core -- src/fixtureSuite.test.ts -t "halo"
```

Expected: at least one new fixture fails with existing conservative halo removal.

- [ ] **Step 3: Harden `applyHaloRemoval`**

In `packages/core/src/halo.ts`:

- Reuse the same edge/corner background model idea from alpha cleanup, or extract a small shared helper only if it keeps files simpler.
- Detect near-background opaque matte pixels and semi-transparent edge pixels.
- Decontaminate the RGB of halo pixels by averaging nearby solid subject neighbors.
- Preserve intentional glow when alpha mode/settings indicate preservation; do not remove glow unless `removeHalos` is enabled and the pixel is background-like.

- [ ] **Step 4: Run halo tests and verify GREEN**

Run:

```sh
npm run test -w @pixelaid/core -- src/core.test.ts -t "halo cleanup"
npm run test -w @pixelaid/core -- src/fixtureSuite.test.ts -t "halo"
```

Expected: halo tests pass.

- [ ] **Step 5: Commit**

```sh
git add packages/core/src/halo.ts packages/core/src/core.test.ts packages/fixtures/src/transparentMatteHaloSprites.ts packages/core/src/fixtureSuite.test.ts
git commit -m "feat(core): harden halo cleanup fixtures"
```

---

## Task 5: Wire Alpha Settings Through Fix Pipeline

**Files:**
- Modify: `packages/core/src/fix.ts`
- Modify: `packages/core/src/core.test.ts`
- Modify: `packages/exporters/src/manifest.test.ts`

- [ ] **Step 1: Write failing pipeline test**

Add to `describe("fix pipeline", ...)`:

```ts
test("passes alpha cleanup settings through the full fix pipeline", () => {
  const source = createImage(3, 1, [248, 248, 248, 255]);
  writePixel(source, 1, 0, 120, 40, 80, 255);

  const result = fixImage(source, {
    mode: "single",
    assetType: "icon",
    targetWidth: 3,
    targetHeight: 1,
    maxColors: 4,
    grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
    downscale: "dominant",
    alpha: "colorKey",
    alphaSettings: {
      colorKey: "#f8f8f8",
      tolerance: 4,
      threshold: 128,
      decontaminateRgb: true
    },
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true
    }
  });

  expect(readPixel(result.image, 0, 0)).toEqual([0, 0, 0, 0]);
  expect(result.diagnostics?.alpha).toMatchObject({
    mode: "colorKey",
    tolerance: 4,
    colorKey: "#f8f8f8"
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```sh
npm run test -w @pixelaid/core -- src/core.test.ts -t "alpha cleanup settings"
```

Expected: fails until `fixImage` consumes the new alpha result API and stores diagnostics.

- [ ] **Step 3: Wire fix pipeline**

In `packages/core/src/fix.ts`:

- Replace `const alphaCleaned = applyAlphaMode(...)` with destructuring:

```ts
const alphaResult = applyAlphaMode(downsampled, options.alpha, options.alphaSettings);
const alphaCleaned = alphaResult.image;
```

- Do the same in `cleanFixedImage`, but it may return only image unless diagnostics are needed per-frame later.
- Add `diagnostics: { alpha: alphaResult.diagnostics }` to single-image `PixelFixResult`.
- Ensure manifest test from Task 1 passes without custom result construction hacks.

- [ ] **Step 4: Run core/exporter tests**

Run:

```sh
npm run test -w @pixelaid/core -- src/core.test.ts
npm run test -w @pixelaid/exporters -- src/manifest.test.ts
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```sh
git add packages/core/src/fix.ts packages/core/src/core.test.ts packages/exporters/src/manifest.test.ts
git commit -m "feat(core): record alpha cleanup diagnostics"
```

---

## Task 6: Web Controls, Defaults, And Warnings

**Files:**
- Modify: `apps/web/src/lib/assetTypePresets.ts`
- Modify: `apps/web/src/lib/assetTypePresets.test.ts`
- Modify: `apps/web/src/lib/fixSuggestions.ts`
- Modify: `apps/web/src/lib/fixSuggestions.test.ts`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write failing preset tests**

Add tests asserting:

- Sprite/icon presets use `binary` or `backgroundFloodFill` with stricter threshold/decontamination defaults.
- UI element/background presets use `preserve`, `decontaminateRgb: false`, and warning codes for effect preservation.

- [ ] **Step 2: Run tests and verify RED**

Run:

```sh
npm run test -w @pixelaid/web -- src/lib/assetTypePresets.test.ts src/lib/fixSuggestions.test.ts
```

Expected: fails because presets and suggestions do not expose alpha settings.

- [ ] **Step 3: Add alpha settings to presets and suggestions**

Extend `AssetTypeCleanupPreset`:

```ts
alphaSettings: AlphaCleanupSettings;
alphaWarningCodes: string[];
```

Return suggested `alphaSettings` from `FixSettingSuggestion`.

- [ ] **Step 4: Wire App state**

In `apps/web/src/App.tsx`, add state:

```ts
const [alphaThreshold, setAlphaThreshold] = useState(128);
const [alphaTolerance, setAlphaTolerance] = useState(18);
const [alphaColorKey, setAlphaColorKey] = useState("#ffffff");
const [decontaminateRgb, setDecontaminateRgb] = useState(true);
```

Pass:

```ts
alphaSettings: {
  threshold: alphaThreshold,
  tolerance: alphaTolerance,
  colorKey: alphaColorKey,
  decontaminateRgb,
  transparentRgb: "#000000"
}
```

into `buildFixOptions`.

- [ ] **Step 5: Add controls**

In the Cleanup inspector group:

- Add `colorKey` to the alpha select.
- Add threshold numeric/slider control for `binary`.
- Add tolerance numeric/slider control for `backgroundFloodFill` and `colorKey`.
- Add color input for `colorKey`.
- Add "Sample corner" button that samples the current selected asset's top-left pixel into `alphaColorKey`.
- Add decontaminate checkbox.
- Add warning text when `alpha !== "preserve"` and `assetType` is `uiElement`, `background`, or `portrait`.

- [ ] **Step 6: Run web targeted tests and typecheck**

Run:

```sh
npm run test -w @pixelaid/web -- src/lib/assetTypePresets.test.ts src/lib/fixSuggestions.test.ts
npm run typecheck -w @pixelaid/web
```

Expected: targeted tests and typecheck pass.

- [ ] **Step 7: Commit**

```sh
git add apps/web/src/App.tsx apps/web/src/lib/assetTypePresets.ts apps/web/src/lib/assetTypePresets.test.ts apps/web/src/lib/fixSuggestions.ts apps/web/src/lib/fixSuggestions.test.ts
git commit -m "feat(web): expose alpha cleanup controls"
```

---

## Task 7: Docs, Verification, And Linear Update

**Files:**
- Modify: `docs/algorithms.md`

- [ ] **Step 1: Update docs**

Document:

- `preserve`, `binary`, `backgroundFloodFill`, and `colorKey`.
- Threshold/tolerance/color-key/decontamination settings.
- Hidden RGB decontamination and why it matters for engine sampling.
- Warnings for preserving intentional effects/glow.
- Fixture coverage for white matte, gray haze, baked checkerboard, and semi-transparent glow.

- [ ] **Step 2: Run targeted verification**

Run:

```sh
npm run test -w @pixelaid/core -- src/core.test.ts src/fixtureSuite.test.ts
npm run test -w @pixelaid/web -- src/lib/assetTypePresets.test.ts src/lib/fixSuggestions.test.ts
npm run test -w @pixelaid/exporters -- src/manifest.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 3: Run full verification**

Run:

```sh
npm run test
npm run typecheck
npm run lint
npm run build
npm run benchmark
```

Expected: all pass.

- [ ] **Step 4: Commit docs**

```sh
git add docs/algorithms.md
git commit -m "docs(core): document alpha cleanup workflows"
```

- [ ] **Step 5: Update Linear**

Add a Linear comment to `MIG-9` with:

- Branch and worktree path.
- Feature summary.
- Review gate outcomes.
- Verification commands and benchmark notes.

---

## Subagent Dispatch

Use one implementation worker for MIG-9 until the shared alpha contract lands, because `AlphaMode`, `FixOptions`, and `PixelFixResult` changes affect core, web, exporters, and fixtures. After Task 1 is committed, fixture expansion and UI wiring are parallelizable, but a single worker is safer unless we split ownership explicitly.

Worker prompt:

```txt
You are working in C:/dev/Mighty/pixel-aid/.worktrees/mig-9-alpha-halo on branch codex/mig-9-alpha-halo.

You are not alone in the codebase; other issue worktrees may be active. Do not revert edits made by others. Own only the MIG-9 files listed in docs/superpowers/plans/2026-04-27-mig-9-alpha-halo-cleanup.md unless you discover a blocker.

Implement the plan task-by-task using TDD:
1. Write the failing test.
2. Run it and confirm the expected failure.
3. Implement the minimal code.
4. Run targeted tests.
5. Commit semantically after each completed task.

Do not add runtime dependencies. Keep core cleanup pure and typed-array based. Avoid per-pixel object allocation. Preserve effect/background alpha unless the selected mode/settings explicitly remove it. Report changed files, commits, verification commands, and concerns.
```

After implementation, dispatch:

1. Spec review against MIG-9 requirements and acceptance criteria.
2. Code quality review focused on alpha correctness, edge cases, hot-loop allocation, UI state, and manifest compatibility.

---

## Acceptance Mapping

- White/black/checkerboard/game-tile preview backgrounds without visible halos: Tasks 3 and 4 fixture tests.
- Fully transparent pixels have safe RGB: Task 2 and Task 5 pipeline tests.
- Preserve/binary/flood-fill/color-key workflows: Tasks 1, 2, 5, and 6.
- Manifest records alpha mode and thresholds: Tasks 1 and 5.
- Existing alpha and halo tests remain green: full verification in Task 7.
