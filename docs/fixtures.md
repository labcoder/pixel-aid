# Fixture Suite

PixelAid fixtures are deterministic TypeScript generators. The repo avoids large binary goldens by default; most tests create compact signatures and structural assertions from generated `RGBAImage` buffers. Small, high-value PNG/WebP goldens may live under package-local `src/goldens/` folders when exact pixel output needs to be locked for a real-world edge case.

Release-facing onboarding/demo samples are documented in `docs/onboarding-samples.md`. The canonical sample registry is `releaseOnboardingSamples` in `packages/fixtures/src/onboardingSamples.ts`; it links demo workflows to existing deterministic fixtures and records first-party provenance.

## Privacy-Safe Beta Fixture Intake

When beta feedback exposes a repeatable failure, classify the source before adding anything to the repo:

| Intake status | Repo action | Notes |
| --- | --- | --- |
| Public/reusable | Add a minimized first-party fixture or small committed asset only if redistribution is explicit. | Keep the permission note in fixture docs or metadata. |
| Private for debugging | Use locally to understand the failure, then replace it with a deterministic synthetic fixture. | Do not commit the user's source art, prompt text, API metadata, or diagnostics bundle. |
| Cannot share | Ask for symptoms/settings only and create a synthetic reproduction from scratch. | Capture the failure mode, not the user's asset. |
| Synthetic replacement required | Add a generator under `packages/fixtures/src` with first-party provenance. | Prefer simple shapes that isolate one algorithmic failure. |

New bugs should become fixtures when they affect grid detection, alpha/background cleanup, palette stability, sheet/tile structure, export metadata, or a release workflow that otherwise needs manual QA. Keep large sources lazy and prefer compact golden signatures over checked-in PNG outputs.

Machine-readable intake metadata lives in `QualityFixtureMetadata` from `@pixelaid/fixtures`. Each failure fixture or internal sample reference must record:

- `sourceFilename`: a committed synthetic source URI such as `synthetic://...`, a redistributable asset path, or an internal-only reference path.
- `assetType` and `expectedMode`: the taxonomy type plus the core mode expected to process it.
- `expectedTargetSize` for single-image fixtures, or `expectedSheetLayout` for sprite/tile sheets.
- `failureCategories`: one or more known failure labels such as `bright-matte-halo`, `weak-ambiguous-grid`, `presentation-label-gutters`, or `palette-drift-animation`.
- `desiredCleanupSettings`: the intentional alpha, grid, palette, downscale, or cleanup settings when they are known.
- `expectedWarnings`: warnings the engine or report-only harness should surface.
- `reviewStatus`: `report-only`, `needs-review`, `golden-approved`, or `internal-only`.
- `privacy` and `license`: whether the sample is safe to commit, internal only, or must become a synthetic replacement before entering source control.

Do not commit private user assets, prompts, generated metadata bundles, or screenshots as fixtures. If a private source is useful during debugging, keep it outside the repo in an ignored/internal folder, then add a synthetic deterministic fixture that reproduces the failure. Safe-to-commit fixture metadata cannot use `private-do-not-commit` license provenance.

`qualityFailureFixtureCatalog` is the initial M6 quality corpus index. It maps representative deterministic fixtures to their intake metadata and currently covers bright mattes/halos, noisy pseudo-pixel grids, weak or ambiguous grid detection, morphology artifacts, uneven row sheets, presentation-style sheets with labels/gutters, palette drift animations, source-sized sheet preservation, and outline repair failures. Report-only entries are allowed when the fixture documents a known weak spot before the expected output is ready.

## Visual Regression Goldens

`packages/fixtures/src/visualRegression.ts` defines the compact golden-signature suite used by `packages/core/src/visualRegression.test.ts`. Each case runs a real `fixImage` path and compares:

- native output width and height
- FNV-style RGBA checksum
- visible and transparent pixel counts
- capped visible palette
- selected sample pixels

The current suite covers:

- fake-pixel single-sprite grid/crop/outline cleanup
- checkerboard matte alpha cleanup
- dual-tone outline repair
- shared-palette animation drift
- effect-heavy sparse sprite sheets
- detail-preserving baseline-drift sheets
- tileset seam preservation

`packages/core/src/astroSpriteSheetGoldens.test.ts` keeps a separate real-world sheet golden suite for the source-sized atlas regressions that compact synthetic fixtures did not catch. It checks that already-clean Astro and Hollow Knight sheets stay close to identity when reprocessed, and that dirty WebP sources recover toward reviewed cleaned PNG outputs without changing dimensions or rebuilding linework. The tests include focused frame comparisons for details that visual review flagged first, such as Astro's first frame and the Hollow Knight chair frame.

Run the visual regression suite:

```sh
npm run test:visual -w @pixelaid/core
```

When a signature changes, the test writes JSON artifacts under `packages/core/.visual-regression-diffs/`. That directory is ignored by git. Inspect the `actual` signature and only copy it into `visualRegression.ts` when the algorithm change is intentional and visually reviewed.

## Categories

| Fixture | Asset type | Source shape | Exercises |
| --- | --- | --- | --- |
| `single-robot-6x` | Sprite | 706x878 fake-pixel source, 6x grid | Grid phase, foreground crop, palette cap, outline padding. |
| `single-knight-8x-noisy` | Sprite | 520x648 fake-pixel source, 8x grid | Alternate phase, noisy block statistics, palette limit. |
| `ambiguous-grid-soft-block-sprite` | Sprite | 288x288 low-contrast fake-pixel source, 6x grid | Weak grid confidence, ambiguous interior bands, manual override review. |
| `halo-transparent-edge` | Sprite | 64x64 transparent sprite | Binary alpha and semi-transparent halo removal. |
| `matte-opaque-white-edge` | Sprite | 64x64 opaque white matte | Background flood-fill and near-white fringe removal. |
| `morphology-pinhole-orphan-sprite` | Sprite | 12x12 transparent sprite | Pinhole fill, isolated component removal, and morphology diagnostics. |
| `outline-repair-dual-tone` | Sprite | 16x16 transparent sprite | Selected outline colors and repairExisting behavior without outline thickening. |
| `palette-drift-walk-4f` | Animation sheet | 4 frames at 24x32 | Shared palette behavior, frame names, pivots, animation metadata. |
| `uneven-gutter-labeled-sheet` | Animation sheet | 640x360 row sheet | Row counts, labels, source rectangles, uneven gutter warnings. |
| `drifted-effect-sheet` | Animation sheet | 640x360 effect-heavy row sheet | Component merging and drift warning metadata. |
| `baseline-drift-animation-sheet` | Animation sheet | 160x40, 4 frames | Baseline/pivot drift and content-center instability. |
| `presentation-mockup-2x6-sheet` | Animation sheet | 720x420 poster-style sheet | Fake checkerboard cells, captions, brackets, watermark marks, and true sprite bounds inside presentation cells. |
| `tileset-seams-4x4-16` | Tileset | 4x4 tiles, 16x16 cells | Tile frame rects, seam samples, palette consistency. |
| `large-landscape-bands` | Background | 1440x810 scene | Large-canvas behavior and crop conservatism. |
| `large-non-sprite-background` | Background | 1280x960 scene | Preservation-oriented non-sprite handling. |

## Benchmarks

Benchmark fixtures are lazy and do not allocate image buffers during module import.

- `fake-pixel-720p-single`: 1280x720 source, 160x90 native target.
- `fake-pixel-1080p-single`: 1920x1080 source, 240x135 native target.
- `fake-pixel-large-sheet`: 2048x2048 source, 64 frame-aware cells.

Run fixture tests:

```sh
npm run test -w @pixelaid/fixtures
npm run test -w @pixelaid/core -- src/fixtureSuite.test.ts
npm run test:visual -w @pixelaid/core
npm run test -w @pixelaid/exporters -- src/fixtureManifest.test.ts
```

Run report-only benchmarks:

```sh
npm run benchmark -w @pixelaid/core
```

## Golden PNG Updates

Golden PNG fixtures are updated only by explicit intent. For the current core golden, run:

```sh
PIXELAID_UPDATE_GOLDENS=1 npm run test -w @pixelaid/core -- src/goldenImage.test.ts
```

Review the resulting PNG diff and commit the changed `packages/core/src/goldens/*.png` file together with the algorithm or fixture change that required it. Normal test runs compare against the committed PNG and report changed pixel count, maximum per-channel delta, and a bounding box for differences.
