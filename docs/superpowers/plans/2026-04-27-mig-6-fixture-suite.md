# MIG-6 Fixture Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generated, documented fixture suite that exercises real-world PixelAid cleanup risks across grid detection, crop metadata, palette stability, alpha/halo cleanup, sheet layout metadata, and large-source benchmarks.

**Architecture:** Keep fixtures in `packages/fixtures` as deterministic TypeScript generators, not committed large binaries. Core and exporter packages consume the fixture catalog for structural assertions, compact golden-output signatures, and Vitest benchmarks. Fixture metadata should align with the MIG-5 asset taxonomy contract once it stabilizes, with a small adapter if the final taxonomy names differ from the fixture categories below.

**Tech Stack:** TypeScript, npm workspaces, Vitest, existing `@pixelaid/shared`, `@pixelaid/fixtures`, `@pixelaid/core`, and `@pixelaid/exporters` packages.

---

## Planning Constraints

- This plan is for MIG-6 only. Do not implement MIG-6 until MIG-5's asset taxonomy contract is stable.
- Do not touch `apps/web` for this issue unless MIG-5 moves fixture taxonomy display into shared UI docs.
- Keep generated fixture images in code. Avoid binary PNG goldens unless the owner explicitly approves a small exception.
- Keep production algorithms unchanged unless a fixture exposes a real bug and the user confirms a follow-up fix scope.
- Commit after each completed implementation task with a semantic commit message. Do not batch all MIG-6 changes into one commit.

## Existing Repo Context

- Current fixture package: `packages/fixtures`.
- Existing generated fixture: `packages/fixtures/src/singleSprite.ts`.
- Existing fixture tests: `packages/fixtures/src/singleSprite.test.ts`.
- Existing core structural and golden-style tests: `packages/core/src/core.test.ts`.
- Existing benchmark: `packages/core/src/singleSpriteCleanup.bench.ts`.
- Current core benchmark command: `npm run benchmark -w @pixelaid/core`.
- Root commands: `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run benchmark`.

## Likely Files

Create:

- `packages/fixtures/src/types.ts` - fixture catalog, category, expected metadata, golden signature, and benchmark metadata types.
- `packages/fixtures/src/imagePrimitives.ts` - shared deterministic drawing helpers for generated RGBA fixtures.
- `packages/fixtures/src/goldenSignature.ts` - compact image signature helpers for generated outputs.
- `packages/fixtures/src/highResolutionPseudoPixelSprites.ts` - pseudo-pixel single-sprite fixtures including the current robot-like source.
- `packages/fixtures/src/transparentMatteHaloSprites.ts` - transparent matte, semi-transparent halo, and opaque-background fringe fixtures.
- `packages/fixtures/src/paletteDriftAnimationFrames.ts` - multi-frame drift fixtures that require shared palette behavior.
- `packages/fixtures/src/unevenSpriteSheets.ts` - irregular gutter, label, drift, and source-rect sheet fixtures.
- `packages/fixtures/src/tilesetSeams.ts` - tile sheet seam and edge-consistency fixtures.
- `packages/fixtures/src/largeBackgrounds.ts` - large background and landscape fixtures that should not be misclassified or over-cropped.
- `packages/fixtures/src/benchmarkFixtures.ts` - lazy 720p, 1080p, and large-sheet benchmark fixture metadata and generators.
- `packages/fixtures/src/fixtureCatalog.test.ts` - catalog coverage and metadata tests.
- `packages/core/src/fixtureSuite.test.ts` - structural and lightweight golden-output tests against core algorithms.
- `packages/core/src/fixtureSuite.bench.ts` - benchmark cases for large sources and large sheets.
- `packages/exporters/src/fixtureManifest.test.ts` - manifest metadata assertions for fixture-derived results.
- `docs/fixtures.md` - human documentation for fixture intent, expected catches, and benchmark usage.

Modify:

- `packages/fixtures/src/index.ts` - export new catalog, generators, types, and signature helpers.
- `packages/fixtures/src/singleSprite.ts` - reuse shared primitives or re-export from the new high-resolution fixture module.
- `packages/fixtures/src/singleSprite.test.ts` - keep current assertions passing while migrating exports.
- `packages/core/package.json` - broaden benchmark script so multiple `*.bench.ts` files run.
- `README.md` - link `docs/fixtures.md` and list fixture-suite commands if command names change.
- `docs/performance.md` - mention the new large-source benchmark metadata and command.

## Fixture Categories

| Category | Fixture IDs | Intended Catch |
| --- | --- | --- |
| High-resolution pseudo-pixel sprites | `single-robot-6x`, `single-knight-8x-noisy` | Grid scale/phase, crop-to-bounds, block downsampling, palette limits, outline padding. |
| Transparent matte/halo sprites | `halo-transparent-edge`, `matte-opaque-white-edge` | Alpha threshold, background flood-fill, halo removal, near-white fringe removal. |
| Palette-drift animation frames | `palette-drift-walk-4f` | Shared palette extraction across frames, no per-frame color drift, stable frame metadata. |
| Uneven sprite sheets | `uneven-gutter-labeled-sheet`, `drifted-effect-sheet` | Row counts, source rects, row animation tags, irregular gutter normalization, warning metadata. |
| Tileset seams | `tileset-seams-4x4-16` | Frame rect generation, seam colors, palette remap consistency along tile boundaries. |
| Large backgrounds | `large-landscape-bands`, `large-non-sprite-background` | Auto-classification hints, crop conservatism, large-canvas grid scoring. |
| 720p/1080p fake-pixel sources | `fake-pixel-720p-single`, `fake-pixel-1080p-single`, `fake-pixel-large-sheet` | Benchmark metadata, large typed-array handling, grid detection and full cleanup throughput. |

## Proposed Fixture Metadata Shape

Adjust this type to import the final MIG-5 taxonomy type once available. Until then, keep the shape local to `packages/fixtures` and make the taxonomy dependency a thin field that can be swapped in one file.

```ts
import type { AssetMode, Rect, RGBAImage, SheetSliceOptions, SpriteFrame } from "@pixelaid/shared";

export type CleanupFixtureCategory =
  | "highResolutionPseudoPixelSprite"
  | "transparentMatteHaloSprite"
  | "paletteDriftAnimationFrames"
  | "unevenSpriteSheet"
  | "tilesetSeams"
  | "largeBackground"
  | "largeFakePixelSource";

export type FixtureGoldenSignature = {
  width: number;
  height: number;
  checksum: string;
  visiblePixels: number;
  transparentPixels: number;
  palette: string[];
  samplePixels: Record<string, readonly [number, number, number, number]>;
};

export type CleanupFixtureExpected = {
  mode: AssetMode;
  grid?: {
    scaleX: number;
    scaleY: number;
    phaseX: number;
    phaseY: number;
    minConfidence: number;
    sourceRect?: Rect;
    outputWidth?: number;
    outputHeight?: number;
  };
  palette?: {
    maxColors: number;
    requiredColors?: string[];
    stableAcrossFrames?: boolean;
  };
  alpha?: {
    transparentPixelsAtLeast?: number;
    visibleNearWhitePixelsAtMost?: number;
    sampleTransparentPixels?: readonly string[];
  };
  sheet?: {
    options: SheetSliceOptions;
    frames?: SpriteFrame[];
    rowFrameCounts?: number[];
    animationNames?: string[];
    expectedWarnings?: string[];
  };
  golden?: FixtureGoldenSignature;
  benchmark?: {
    sourcePixels: number;
    nativePixels: number;
    frameCount?: number;
    budgetMs?: number;
    reportOnly: boolean;
  };
};

export type CleanupFixture = {
  id: string;
  title: string;
  category: CleanupFixtureCategory;
  taxonomy: string;
  description: string;
  catches: string[];
  image: RGBAImage;
  expected: CleanupFixtureExpected;
};
```

## Numbered Tasks

### Task 1: Align MIG-5 Taxonomy and Add Fixture Catalog Contract

**Files:**

- Create: `packages/fixtures/src/types.ts`
- Modify: `packages/fixtures/src/index.ts`
- Test: `packages/fixtures/src/fixtureCatalog.test.ts`

- [ ] **Step 1: Inspect MIG-5 taxonomy contract**

  Read the final MIG-5 files and identify the exported taxonomy type or constants. Expected likely locations are `packages/shared/src/types.ts`, `packages/shared/src/index.ts`, or a new shared taxonomy module. Record the exact import path in the implementation notes before coding.

- [ ] **Step 2: Write the failing catalog contract test**

  Add `packages/fixtures/src/fixtureCatalog.test.ts` with tests that import `cleanupFixtureCatalog` and assert that all seven MIG-6 categories exist, every fixture has a non-empty `description`, every fixture has at least one `catches` entry, and every fixture has taxonomy metadata compatible with MIG-5.

  Run:

  ```sh
  npm run test -w @pixelaid/fixtures -- src/fixtureCatalog.test.ts
  ```

  Expected before implementation: fail because `cleanupFixtureCatalog` is not exported.

- [ ] **Step 3: Add the minimal fixture types and empty-safe catalog export**

  Add `CleanupFixtureCategory`, `CleanupFixtureExpected`, `CleanupFixture`, and `FixtureGoldenSignature` to `packages/fixtures/src/types.ts`. Export a catalog array from `packages/fixtures/src/index.ts` only after at least one fixture module is ready in later tasks; for this task, export types and category constants.

- [ ] **Step 4: Run fixture package tests**

  Run:

  ```sh
  npm run test -w @pixelaid/fixtures
  npm run typecheck -w @pixelaid/fixtures
  ```

  Expected: existing `singleSprite` tests still pass; the new catalog test may remain skipped only if MIG-5 is not merged yet. If MIG-5 is merged, the catalog test must pass in this task.

- [ ] **Step 5: Commit**

  ```sh
  git add packages/fixtures/src/types.ts packages/fixtures/src/index.ts packages/fixtures/src/fixtureCatalog.test.ts
  git commit -m "feat(fixtures): add cleanup fixture catalog contract"
  ```

### Task 2: Extract Shared Generated-Image Primitives

**Files:**

- Create: `packages/fixtures/src/imagePrimitives.ts`
- Modify: `packages/fixtures/src/singleSprite.ts`
- Test: `packages/fixtures/src/singleSprite.test.ts`

- [ ] **Step 1: Write primitive behavior tests or extend existing fixture tests**

  Verify that `createSingleSpriteCleanupFixture()` still returns the same dimensions, foreground bounds, scale, phase, and palette after extraction.

  Run:

  ```sh
  npm run test -w @pixelaid/fixtures -- src/singleSprite.test.ts
  ```

  Expected before refactor: pass. This is a safety net for extraction.

- [ ] **Step 2: Extract helpers without changing generated pixels**

  Move reusable helpers from `singleSprite.ts` into `imagePrimitives.ts`, including:

  - `fillImage`
  - `fillRect`
  - `fillEllipse`
  - `blitNativeToFakePixel`
  - `clampByte`
  - a small deterministic noise helper that accepts bounds, scale, and phase.

  Keep loops typed-array based and avoid per-pixel object allocation.

- [ ] **Step 3: Re-run fixture tests**

  Run:

  ```sh
  npm run test -w @pixelaid/fixtures -- src/singleSprite.test.ts
  npm run typecheck -w @pixelaid/fixtures
  ```

  Expected: pass with the same metadata values currently asserted.

- [ ] **Step 4: Commit**

  ```sh
  git add packages/fixtures/src/imagePrimitives.ts packages/fixtures/src/singleSprite.ts packages/fixtures/src/singleSprite.test.ts
  git commit -m "refactor(fixtures): share generated image primitives"
  ```

### Task 3: Add Single-Sprite, Halo, and Large-Background Fixtures

**Files:**

- Create: `packages/fixtures/src/highResolutionPseudoPixelSprites.ts`
- Create: `packages/fixtures/src/transparentMatteHaloSprites.ts`
- Create: `packages/fixtures/src/largeBackgrounds.ts`
- Modify: `packages/fixtures/src/index.ts`
- Test: `packages/fixtures/src/fixtureCatalog.test.ts`

- [ ] **Step 1: Write failing catalog tests for the three categories**

  Assert that the catalog includes:

  - `single-robot-6x` with expected scale `6`, phase `(2, 1)`, foreground crop `{ x: 50, y: 1, w: 612, h: 864 }`, and max palette `24`.
  - `single-knight-8x-noisy` with a different scale and phase from the robot fixture.
  - `halo-transparent-edge` with alpha expectations and near-white halo expectations.
  - `matte-opaque-white-edge` with background flood-fill expectations.
  - `large-landscape-bands` and `large-non-sprite-background` with source dimensions above one megapixel and no binary golden data.

- [ ] **Step 2: Implement generated fixtures**

  Use deterministic drawing primitives. Generate native-sized source art first, then expand it to pseudo-pixel source dimensions with scale and phase. Add bounded color wobble and edge halos through deterministic integer formulas.

- [ ] **Step 3: Preserve compatibility export**

  Keep `createSingleSpriteCleanupFixture()` exported from `packages/fixtures/src/index.ts` so current core tests continue to compile.

- [ ] **Step 4: Run fixture tests**

  Run:

  ```sh
  npm run test -w @pixelaid/fixtures
  npm run typecheck -w @pixelaid/fixtures
  ```

  Expected: pass, with no committed binary fixtures.

- [ ] **Step 5: Commit**

  ```sh
  git add packages/fixtures/src/highResolutionPseudoPixelSprites.ts packages/fixtures/src/transparentMatteHaloSprites.ts packages/fixtures/src/largeBackgrounds.ts packages/fixtures/src/index.ts packages/fixtures/src/fixtureCatalog.test.ts
  git commit -m "feat(fixtures): add single sprite and alpha cleanup fixtures"
  ```

### Task 4: Add Animation, Uneven Sheet, and Tileset Fixtures

**Files:**

- Create: `packages/fixtures/src/paletteDriftAnimationFrames.ts`
- Create: `packages/fixtures/src/unevenSpriteSheets.ts`
- Create: `packages/fixtures/src/tilesetSeams.ts`
- Modify: `packages/fixtures/src/index.ts`
- Test: `packages/fixtures/src/fixtureCatalog.test.ts`

- [ ] **Step 1: Write failing tests for sheet and animation metadata**

  Assert:

  - `palette-drift-walk-4f` has four frames, stable expected palette metadata, and frame names `walk_000` through `walk_003`.
  - `uneven-gutter-labeled-sheet` has expected `rowFrameCounts`, animation names, source rects, and detection warning expectations.
  - `drifted-effect-sheet` includes expected warnings for drift or merged components.
  - `tileset-seams-4x4-16` has a 4x4 sheet, `16x16` native tile metadata, and seam sample coordinates.

- [ ] **Step 2: Generate the fixtures**

  Use source-space `sourceRect` metadata for sheet fixtures and native-space `rect` metadata for packed output expectations. Keep frame data serializable and aligned with `SpriteFrame`.

- [ ] **Step 3: Run fixture tests**

  Run:

  ```sh
  npm run test -w @pixelaid/fixtures
  npm run typecheck -w @pixelaid/fixtures
  ```

  Expected: pass.

- [ ] **Step 4: Commit**

  ```sh
  git add packages/fixtures/src/paletteDriftAnimationFrames.ts packages/fixtures/src/unevenSpriteSheets.ts packages/fixtures/src/tilesetSeams.ts packages/fixtures/src/index.ts packages/fixtures/src/fixtureCatalog.test.ts
  git commit -m "feat(fixtures): add animation sheet and tileset fixtures"
  ```

### Task 5: Add Benchmark Fixture Metadata for Large Sources

**Files:**

- Create: `packages/fixtures/src/benchmarkFixtures.ts`
- Modify: `packages/fixtures/src/index.ts`
- Test: `packages/fixtures/src/fixtureCatalog.test.ts`

- [ ] **Step 1: Write failing benchmark metadata tests**

  Assert these generated benchmark fixtures exist and are lazy generator functions rather than eagerly allocated module-level images:

  - `fake-pixel-720p-single`: `1280x720` source, expected native pixel count below source pixel count.
  - `fake-pixel-1080p-single`: `1920x1080` source.
  - `fake-pixel-large-sheet`: source above four megapixels with frame count metadata.

- [ ] **Step 2: Implement lazy benchmark fixture creators**

  Export metadata plus `createImage()` functions. Do not allocate large `Uint8ClampedArray` buffers during module import.

- [ ] **Step 3: Run fixture tests and check import cost**

  Run:

  ```sh
  npm run test -w @pixelaid/fixtures
  npm run typecheck -w @pixelaid/fixtures
  ```

  Expected: pass. The test should instantiate at least one large fixture to prove dimensions and metadata, but avoid generating every large source in every fixture test.

- [ ] **Step 4: Commit**

  ```sh
  git add packages/fixtures/src/benchmarkFixtures.ts packages/fixtures/src/index.ts packages/fixtures/src/fixtureCatalog.test.ts
  git commit -m "feat(fixtures): add large source benchmark metadata"
  ```

### Task 6: Add Core Structural Assertions and Lightweight Goldens

**Files:**

- Create: `packages/fixtures/src/goldenSignature.ts`
- Create: `packages/core/src/fixtureSuite.test.ts`
- Modify: `packages/fixtures/src/index.ts`
- Test: `packages/core/src/fixtureSuite.test.ts`

- [ ] **Step 1: Add compact golden signature helper**

  Create a deterministic helper that returns:

  - width and height
  - visible pixel count
  - transparent pixel count
  - sorted palette up to the tested max color count
  - selected sample pixels by `x,y`
  - a 32-bit checksum formatted as eight lowercase hex digits

  Use integer loops over `Uint8ClampedArray`; do not allocate one object per pixel.

- [ ] **Step 2: Write failing core fixture-suite tests**

  Add tests for:

  - Grid/crop metadata from high-resolution single-sprite fixtures.
  - Palette size and required colors after cleanup.
  - Alpha and halo cleanup output using transparent matte fixtures.
  - Sheet layout metadata from uneven sheet fixtures.
  - Tileset seam samples after palette remapping.
  - Golden signatures for critical cleanup paths.

  Run:

  ```sh
  npm run test -w @pixelaid/core -- src/fixtureSuite.test.ts
  ```

  Expected before implementation: fail on missing helper or missing fixture exports.

- [ ] **Step 3: Wire tests to existing core APIs**

  Use existing exports from `@pixelaid/core`:

  - `detectGridCandidates`
  - `detectSheetLayout`
  - `fixImage`
  - `readPixel`
  - `sliceSheetFrames`

  Keep tests structural and deterministic. If an assertion reveals an algorithm bug, stop after documenting the failing fixture and ask whether to fix that bug in MIG-6 or a follow-up issue.

- [ ] **Step 4: Run core tests**

  Run:

  ```sh
  npm run test -w @pixelaid/core
  npm run typecheck -w @pixelaid/core
  ```

  Expected: pass.

- [ ] **Step 5: Commit**

  ```sh
  git add packages/fixtures/src/goldenSignature.ts packages/fixtures/src/index.ts packages/core/src/fixtureSuite.test.ts
  git commit -m "test(core): add cleanup fixture structural goldens"
  ```

### Task 7: Add Manifest Metadata Assertions from Fixtures

**Files:**

- Create: `packages/exporters/src/fixtureManifest.test.ts`
- Test: `packages/exporters/src/fixtureManifest.test.ts`

- [ ] **Step 1: Write fixture-driven manifest tests**

  Use a fixture-derived `PixelFixResult` and `createPixelAssetManifest()` to assert:

  - `meta.source` matches source dimensions.
  - `meta.operation.grid.sourceRect` is preserved for cropped single sprites.
  - `sheet.frameWidth`, `sheet.frameHeight`, `spacing`, and `extrude` match fixture expectations.
  - frame names, pivots, durations, and animation references validate with `validateManifest()`.

- [ ] **Step 2: Run exporter tests**

  Run:

  ```sh
  npm run test -w @pixelaid/exporters -- src/fixtureManifest.test.ts
  npm run typecheck -w @pixelaid/exporters
  ```

  Expected: pass.

- [ ] **Step 3: Commit**

  ```sh
  git add packages/exporters/src/fixtureManifest.test.ts
  git commit -m "test(exporters): assert fixture manifest metadata"
  ```

### Task 8: Add Large Fixture Benchmarks

**Files:**

- Create: `packages/core/src/fixtureSuite.bench.ts`
- Modify: `packages/core/package.json`
- Test: benchmark command

- [ ] **Step 1: Update benchmark discovery**

  Change `packages/core/package.json` benchmark script from one hard-coded file to all benchmark files:

  ```json
  {
    "scripts": {
      "benchmark": "vitest bench --run"
    }
  }
  ```

- [ ] **Step 2: Add benchmark cases**

  Add benchmarks for:

  - 720p grid detection.
  - 720p full cleanup.
  - 1080p grid detection.
  - large sheet frame-aware cleanup.

  Use fixture benchmark metadata in benchmark names so output is self-describing.

- [ ] **Step 3: Run benchmark command**

  Run:

  ```sh
  npm run benchmark -w @pixelaid/core
  ```

  Expected: benchmark completes and includes both the existing single-sprite cleanup benchmark and new MIG-6 large fixture benchmarks.

- [ ] **Step 4: Commit**

  ```sh
  git add packages/core/src/fixtureSuite.bench.ts packages/core/package.json
  git commit -m "perf(core): benchmark large cleanup fixtures"
  ```

### Task 9: Document Fixture Intent and Commands

**Files:**

- Create: `docs/fixtures.md`
- Modify: `README.md`
- Modify: `docs/performance.md`

- [ ] **Step 1: Write fixture documentation**

  Document each fixture category and fixture ID. For each fixture, include:

  - source shape and generated dimensions
  - cleanup path exercised
  - expected structural metadata
  - golden check strategy
  - benchmark relevance, if any

- [ ] **Step 2: Link docs from README and performance notes**

  Add `docs/fixtures.md` to README's workspace/docs context. Update `docs/performance.md` to mention benchmark metadata and the command:

  ```sh
  npm run benchmark -w @pixelaid/core
  ```

- [ ] **Step 3: Run docs-adjacent verification**

  Run:

  ```sh
  npm run lint
  npm run typecheck
  ```

  Expected: pass.

- [ ] **Step 4: Commit**

  ```sh
  git add docs/fixtures.md README.md docs/performance.md
  git commit -m "docs(fixtures): document cleanup fixture suite"
  ```

### Task 10: Full Verification and Handoff

**Files:**

- Verify all changed files from prior tasks.

- [ ] **Step 1: Run full test suite**

  Run:

  ```sh
  npm run test
  npm run lint
  npm run typecheck
  npm run build
  npm run benchmark
  ```

  Expected: all commands pass. If benchmarks are too slow for routine local runs, record the elapsed time and ask whether root `npm run benchmark` should stay full-suite or split quick and full benchmark scripts.

- [ ] **Step 2: Review repo size impact**

  Run:

  ```sh
  git diff --stat main...HEAD
  ```

  Expected: source and docs changes only; no large binary images or generated output directories.

- [ ] **Step 3: Review hot loops**

  Inspect fixture generation and signature code. Confirm image loops use typed arrays and numeric offsets, with no per-pixel `{ r, g, b, a }` object allocation.

- [ ] **Step 4: Final semantic checkpoint**

  If any fixups were required after full verification, commit them with the narrowest semantic message, for example:

  ```sh
  git commit -m "test(fixtures): tighten cleanup suite expectations"
  ```

## Test Commands

Primary implementation commands:

```sh
npm run test -w @pixelaid/fixtures
npm run test -w @pixelaid/core
npm run test -w @pixelaid/exporters
npm run lint
npm run typecheck
npm run build
```

Focused commands:

```sh
npm run test -w @pixelaid/fixtures -- src/fixtureCatalog.test.ts
npm run test -w @pixelaid/core -- src/fixtureSuite.test.ts
npm run test -w @pixelaid/exporters -- src/fixtureManifest.test.ts
```

## Benchmark Command

```sh
npm run benchmark -w @pixelaid/core
```

Run the root benchmark before final handoff:

```sh
npm run benchmark
```

## Verification Checklist

- All seven MIG-6 fixture categories are present in the exported fixture catalog.
- Every fixture has `id`, taxonomy metadata, source image generator, expected metadata, description, and `catches`.
- Structural tests cover grid, crop, palette, alpha, and sheet metadata.
- Lightweight golden checks use compact signatures rather than committed large images.
- Benchmark metadata exists for large single sprites and large sheets.
- Large benchmark images are generated lazily, not at module import time.
- Docs explain what each fixture catches.
- No new runtime dependency is added. If a dependency becomes necessary, stop and perform a license and bundle-impact review first.
- No production or test source outside the planned files is modified without a user-approved scope change.

## Semantic Commit Checkpoints

1. `feat(fixtures): add cleanup fixture catalog contract`
2. `refactor(fixtures): share generated image primitives`
3. `feat(fixtures): add single sprite and alpha cleanup fixtures`
4. `feat(fixtures): add animation sheet and tileset fixtures`
5. `feat(fixtures): add large source benchmark metadata`
6. `test(core): add cleanup fixture structural goldens`
7. `test(exporters): assert fixture manifest metadata`
8. `perf(core): benchmark large cleanup fixtures`
9. `docs(fixtures): document cleanup fixture suite`
10. Optional fixup only if verification requires it: `test(fixtures): tighten cleanup suite expectations`

## Blockers and Open Questions

1. **Blocker:** MIG-5 asset taxonomy contract must stabilize before implementation. MIG-6 should import or adapt to the final taxonomy shape rather than inventing a competing category model.
2. **Question:** Should lightweight golden-output checks be signature-only, as proposed here, or should the repo allow a very small number of tiny PNG goldens for visual inspection?
3. **Question:** Should benchmark metadata include enforceable budget thresholds in tests, or remain report-only in MIG-6? This plan assumes report-only to avoid flaky CI on varied hardware.
4. **Question:** Should `large-non-sprite-background` assert current classifier behavior, or only document the intended catch until classification APIs are formalized by another issue?

## Next Best Prompt

After MIG-5 lands and the taxonomy contract is stable, the next best prompt is:

```txt
Implement Task 1 from docs/superpowers/plans/2026-04-27-mig-6-fixture-suite.md. Use the final MIG-5 taxonomy contract, do not continue to Task 2 until Task 1 tests pass and the semantic commit is created.
```
