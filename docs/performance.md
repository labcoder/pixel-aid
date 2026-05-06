# Performance

PixelAid treats responsiveness as part of the product, not polish to add later.

## Rendering

- The viewport uses `<canvas>`, not React pixel nodes.
- Preview drawing sets `ctx.imageSmoothingEnabled = false`.
- The renderer draws native-size image buffers into cached native canvases before scaling.
- Pixel grid overlays use integer zoom and snapped coordinates.
- Detected frame box selection and dragging are handled as canvas pointer interactions; frames are not rendered as React DOM nodes.
- The guided recommendation panel uses normal React controls, but it only updates serialized fix settings. Pixel preview and frame rendering stay on canvas.
- React state drives editor controls and asset selection; it does not run animation loops.
- Timeline playback uses `requestAnimationFrame` and advances React state only when the selected frame changes.
- Animation stability diagnostics are metadata-only checks over the selected timeline frames. They do not inspect image pixels or run inside the playback loop.
- Tileset repeat preview is drawn with Canvas2D and `imageSmoothingEnabled = false`; repeated tiles and seam guides are not rendered as React nodes.
- The bottom timeline/logs/metrics area is resized with a CSS grid variable and pointer events rather than reflow-heavy layout polling.

## Processing

- The core uses `Uint8ClampedArray` image buffers and index math.
- Grid detection uses typed arrays for edge energy and run histograms; the foreground bounds pass scans the source once and avoids per-pixel object allocation.
- Sheet layout detection uses row and column count buffers to find bands and frame segments without rendering frame candidates as React elements.
- Tileset seam diagnostics compare adjacent native tile edges with index math and do not allocate per-pixel color objects.
- Scene diagnostics use bounded deterministic sampling so large backgrounds and tilemaps do not require full-image scans for color-bin/detail-density warnings.
- Import decode preparation still starts from browser event handlers, but the decode adapter and UI yield between phases so large sheets do not look stalled.
- Auto Suggest runs as an engine-tracked worker job. The app only schedules the job on the main thread, then caches the returned grid candidates and quality report instead of rerunning grid detection during React render.
- Fix start-up yields before building the worker job and shows a preparing/fixing status overlay, so a large sheet does not look idle while frame metadata is packaged.
- Heavy fix work runs in `packages/worker`.
- The web app clones source buffers before transfer so the imported source remains available for preview.
- The worker transfers the fixed output buffer back to the main thread.
- Asset browser thumbnails use a separate bounded thumbnail-surface cache instead of forcing full-size viewport preview surfaces. The thumbnail path samples a small nearest-neighbor surface and uses `OffscreenCanvas` where available, with DOM canvas fallback.

## Import And Analysis Phase Map

Milestone 4 tracks each import-to-first-preview phase so expensive work can move off the main thread without changing output semantics. Current ownership reflects the web app after Milestone 3; target ownership is the intended direction for this milestone.

| Phase | Current owner | Target owner | Expensive main-thread risk | Constraints and notes | Follow-up |
| --- | --- | --- | --- | --- | --- |
| File selection, drop, and paste event handling | Main thread / React event handlers | Main thread | Low | Browser file and clipboard events are main-thread entry points. Handlers should enqueue work and yield quickly. | 4.1.2 |
| Blob/image validation | Main thread | Main thread adapter | Low | File MIME/type checks are cheap and should stay near the event boundary. | 4.2.1 |
| Browser decode to bitmap | Browser decode implementation via `createImageBitmap` called from main-thread adapter | Worker-safe decode adapter when supported, fallback to main thread | Medium to high for large images | `createImageBitmap` availability varies by worker/browser. The adapter must preserve current `decodeImageBlob` dimensions and pixel data semantics. | 4.2.1 |
| RGBA extraction from bitmap | Main thread canvas draw plus `getImageData` | Worker or offscreen preparation where supported | High for large sources | DOM canvas is main-thread only; worker movement depends on `OffscreenCanvas` and worker-side bitmap support. Source image must remain immutable after creation. | 4.2.1 |
| Imported asset object creation | Main thread | Main thread / engine registration | Low | The asset metadata write is cheap, but it should receive already-prepared image data. | 4.2.1 |
| Source preview surface creation | Main thread Canvas2D via preview surface cache | Offscreen-capable preview preparation if measured useful | Medium for large images and repeated asset switches | Canvas fallback must remain pixel-perfect with `imageSmoothingEnabled = false`. Cached surfaces are disposable derived data. | 4.4.1 |
| Asset browser thumbnail/render preparation | Main thread Canvas2D today through cached preview surfaces and component canvases | Worker/offscreen thumbnail prep where supported | Medium | Thumbnail dimensions/style should remain equivalent. Avoid extra full-size copies. | 4.2.2 |
| Source analysis palette/outline pass | Persistent analysis worker | Persistent analysis worker | Low on main thread after M3 | Source buffer clone/transfer still starts on main thread, but the expensive scan runs in the worker. Latest-only stale keys prevent old results from committing. | Done in M3, refine in 4.3.3 |
| Quality report execution | Engine cache/schedule policy plus persistent analysis worker | Engine-owned persistent analysis job | Low on main thread after M4.3.3 | Engine helpers own cache keys, exact/fallback cache resolution, one-pass switch fallback policy, and cache writes. React stores presentation state and starts the selected job. | Done in 4.3.3 |
| Auto Suggest from import or button | Engine `autoSuggest` job backed by the persistent worker client | Engine job with worker execution and cache | Low on main thread after M4.3.2 | Main-thread work is limited to clone/transfer setup and result commit. The worker invokes reusable core suggestion logic, and React render may only consume cached results. | 4.3.3 cache ownership refinement |
| Grid candidate thumbnail drawing | Main thread component canvas | Main thread fallback, possible offscreen prep later | Low to medium depending candidate count | Small canvases are acceptable, but the UI must use cached candidate data rather than rerunning detectors. | 4.3.1 |
| First viewport render after import/fix | Main thread Canvas2D renderer | Structured render model, optional offscreen preparation prototype | Medium | Pointer interaction and UI controls stay in React/main thread. Only preparation should move unless measurements justify more. | 4.4.1, 4.4.2 |

Browser API constraints for worker movement:

- `File`, `Blob`, and `ImageBitmap` are transferable/usable in many worker contexts, but support differs enough that the decode adapter must feature-detect instead of assuming.
- `document.createElement("canvas")` and DOM canvas contexts are main-thread only.
- `OffscreenCanvas` can support worker-side draw/readback where available, but Safari and embedded webviews may lag; fallback paths remain required.
- Transferable `ArrayBuffer`s detach the sender-side buffer, so source images must still be cloned before transfer when the UI needs to keep preview and document state alive.
- React render/commit may build lightweight render models and display cached metadata, but it must not run image scans, grid detection, quality reports, or suggestion analysis directly.

Runtime warnings flag expensive main-thread import/analysis phases without failing the operation. Initial warning thresholds are 32ms for decode preparation, 16ms for thumbnail/preview-surface generation, 32ms for Auto Suggest, and 16ms for quality-report setup. Warnings include the operation name and image dimensions, are deduped per asset/scope, and are written to the editor log plus performance marks so normal small assets do not spam the UI.

## Progress And Cancellation

The browser client reports `decode-prep` before the worker job starts. Worker and core fix jobs emit coarse progress stages for `grid-detection`, `frame-slicing`, `downsampling`, `alpha-cleanup`, `palette-remap`, `export-prep`, `complete`, and `cancelled`. Progress is intentionally stage-based instead of per-pixel so long image operations do not flood the UI thread or trigger excessive React state updates.

Core fix functions accept optional runtime hooks for progress and cooperative cancellation. The worker checks those hooks between processing phases and frame-sized chunks, which keeps cancellation deterministic without adding allocation-heavy checks inside every pixel loop.

The browser client asks the worker to cancel gracefully first. If the worker is inside a synchronous phase that cannot process messages immediately, the client terminates the worker as a fallback. Results and progress that arrive after cancellation are ignored or suppressed with request id checks, settled-state guards, and cancellation guards so stale events cannot update the active job UI.

## Persistent Worker Pool Policy

Milestone 3 replaces per-job worker creation with a small persistent pool. The first implementation keeps the policy deliberately narrow:

- One persistent fix worker.
- One persistent analysis worker shared by source analysis and quality analysis.
- No unbounded worker creation, no algorithm-level parallelism, and no browser-visible worker count setting yet.

The fix worker is single-flight. A user-triggered fix job may run only one active job for the current asset/session. Starting a new fix for the same asset cancels the older fix before queueing the new one. Deleting the asset or leaving the active session cancels the active fix. The fix queue depth is capped at one pending job so repeated clicks cannot create a backlog of large transferable buffers.

The analysis worker is latest-only per stale key. Source analysis and quality diagnostics use stable keys such as `assetId:sourceAnalysis` and `assetId:qualityAnalysis:settingsHash`. Auto Suggest uses `assetId:auto-suggest` with an optional asset-type suffix for manual category overrides. Quality report cache-key generation, exact/fallback report selection, and one-pass asset-switch fallback scheduling live in the engine package so React render changes that do not affect quality inputs do not invent new cache policy. When a newer job with the same stale key is queued, older pending jobs are dropped and older completed results are ignored. Analysis jobs may be cancelled when asset selection changes, but stale-result checks remain required because a synchronous worker phase may finish before it can observe cancellation.

All persistent requests use `requestId` for the individual operation and `jobId` for the asset/session job identity. Responses must include both identifiers. The worker may emit `worker-accepted`, `worker-progress`, `worker-result`, `worker-cancelled`, `worker-error`, `worker-stale`, and `worker-ready` responses. The UI only commits a result when the active request id and stale key still match the current asset/session state.

Worker lifetime starts lazy: workers are created on first use and reused across subsequent jobs. They remain alive while the editor page is active. A future idle timeout can terminate workers after several minutes of no jobs, but the first pool implementation should prefer predictable reuse over churn. Page unload, explicit app disposal, and fatal worker errors terminate workers immediately.

Memory pressure policy stays conservative. The app still clones source buffers before transferring them when the source must remain previewable. Pending queues store only the latest transferable job for a stale key. Large generated artifacts and worker-stress reports stay outside source control unless intentionally captured. Buffer ownership and reuse are tracked separately in Milestone 3.4 before the app removes duplicate clones.

## Image Buffer Ownership

PixelAid treats imported source buffers as immutable source truth. The UI may draw them, analyze them, or clone them, but it must not transfer or detach the only source copy while the asset remains previewable.

The current ownership states are:

- `source-immutable`: web-owned source image data retained for preview, undo/replay, and future fixes.
- `transfer-clone`: web-owned copy prepared for `postMessage` transfer to a worker.
- `transferred-to-worker`: sender-side clone after transfer; treated as detached and unreadable.
- `worker-owned`: buffer currently owned by worker/core processing.
- `worker-result`: completed output buffer transferred back to the web app and committed as result state.
- `preview-cache`: derived canvas/image cache data that can be disposed and rebuilt.
- `export-temp`: generated export or ZIP staging data.
- `released`: buffer metadata retained only for diagnostics; code must not read or write the data.

Ownership labels should appear in diagnostics and helper names where practical. A function that clones for transfer should make that intent explicit; a function that keeps source preview data must not silently transfer it. Future buffer pooling may reuse only temporary or released buffers, never `source-immutable` buffers.

Temporary RGBA buffer reuse is bounded by size bucket. A pool may retain a small number of released same-byte-length buffers for scratch work, clears them on release by default, and drops buffers instead of exceeding its configured byte cap. Reused buffers must be labelled as temporary ownership such as `export-temp`; they must not be committed as immutable source buffers or long-lived worker results without creating a new ownership record.

The current worker-transfer clone audit is:

- Source, quality, Auto Suggest, and fix clients clone the immutable source buffer once before transfer.
- The transferred buffer becomes worker-owned; the web-side clone is considered detached after `postMessage`.
- The worker creates typed-array views over received buffers and does not make a second full source clone.
- Editor memory diagnostics clear transfer-clone checkpoints when jobs settle so active memory estimates do not keep counting detached sender-side buffers.

## Editor Responsiveness Diagnostics

The web editor records lightweight, in-session responsiveness diagnostics for major user operations. The diagnostics are visible in the Metrics and Logs bottom panel and are included in exported diagnostics JSON. Timing history is intentionally bounded and is not persisted across sessions.

Recorded phase marks include import receipt, image decode start/end, source-analysis worker start/end, quality-analysis start/end, Auto Suggest start/end, fix preparation start/end, worker job posting, first worker progress, worker result receipt, UI result commit, first output canvas paint after a result, and export start/end. These marks distinguish main-thread preparation from worker execution so slow fixes can be attributed more clearly.

Browsers that support `PerformanceObserver` long-task entries also report main-thread long-task counts plus total and maximum duration for recent active operations. Unsupported browsers report `unsupported` without throwing or requiring a polyfill. Long-task entries are summarized at phase boundaries so the observer does not spam React state updates.

Memory diagnostics are estimates, not exact heap measurements. PixelAid estimates RGBA image-buffer pressure as `width x height x 4` and records known source, clone/transfer, worker result, fixed output, cached preview surface, export PNG, and export bundle checkpoints when those buffers are visible to the editor. These estimates are meant to warn about large-image workflows and should not be treated as browser heap profiles.

## OffscreenCanvas Viewport Evaluation

Milestone 4.4.1 evaluated viewport pre-render ownership without changing the production viewport path. The recommendation is to keep native source/fixed preview surfaces on the current cached Canvas2D path until the viewport render model is extracted and browser-worker support can be measured in the actual Vite/browser runtime.

| Surface | Current data point | Recommendation | Reason |
| --- | --- | --- | --- |
| Native source/fixed preview surfaces | `PreviewSurfaceCache` creates one native-size cached canvas per asset/role and records creation timing. A 1080p RGBA source is about 7.9 MB before any additional canvas backing store. | Defer worker movement. | A worker path still needs full RGBA clone/transfer setup unless decode/preparation already owns the worker buffer. Moving now risks extra memory pressure without measured paint benefit. |
| Asset browser thumbnails | `ThumbnailSurfaceCache` bounds each thumbnail to 96x72 or smaller, records timings, and already selects `OffscreenCanvas` where available with DOM canvas fallback. | Use current bounded OffscreenCanvas-capable path. | The surface is small, cached, and independent from pointer/camera state. |
| Diagnostic overlays | Grid/crop/frame/pivot overlays are lightweight today but depend on selected viewport mode, zoom, and frame state. | Defer until render model extraction. | Moving overlay preparation before the render model exists would duplicate state plumbing and make correctness harder to test. |
| Final viewport composite | The main viewport canvas owns camera transforms, split view, checkerboard, and immediate pointer feedback. | Keep main-thread Canvas2D for now. | The final paint is interaction-sensitive; only preparation surfaces should move unless browser measurements show a real gain. |

The tested recommendation model is `apps/web/src/lib/viewportOffscreenEvaluation.ts`. It treats worker-side `OffscreenCanvas`/`ImageBitmap` support as a measured capability, not an assumption, and keeps production rendering unchanged for 4.4.1.

Milestone 4.4.2 adds `apps/web/src/lib/viewportRenderModel.ts` as the renderer-facing contract for the current Canvas2D viewport. React still owns user interaction and canvas lifecycle, but the draw effect now builds a model containing viewport dimensions, source/fixed surfaces, split layout, zoom/pan, grid state, diagnostic overlay surfaces, frame overlays, and selected frame metadata before handing it to the renderer. This gives future OffscreenCanvas/WebGL/WebGPU work one model boundary to target instead of re-reading React component props.

## Current Metrics

The metrics panel shows:

- Source size.
- Source color count.
- Output size.
- Palette count.
- Downscale method.
- Denoise strength.
- Halo cleanup state.
- Outline mode and native outline size.
- Sheet frame count and frame metadata for sheet-like modes.
- Grid confidence.
- Worker operation duration.
- Active import, analysis, or fix phase while decode, first-pass analysis, or worker job preparation is running.

Grid candidates may also include a source crop rectangle. This is useful when a high-resolution single sprite sits on a bright background because the output dimensions and palette pass then reflect the sprite asset instead of the full image canvas. If an outline is active on an auto-cropped single sprite, the output can be padded by the outline size so the new edge pixels have room to render.

## Current Benchmarks

The core package includes fixture-driven benchmarks for single-sprite cleanup and large generated sources. They exercise the generated high-resolution robot-like source, 720p and 1080p fake-pixel sources, a large frame-aware sheet, background-aware grid detection, adaptive downsampling, palette reduction, and cleanup pipeline.

Run the current core benchmarks with:

```sh
npm run benchmark -w @pixelaid/core
```

Run all available workspace benchmarks with:

```sh
npm run benchmark
```

Capture structured benchmark results for branch-to-branch comparison with:

```sh
npm run benchmark:record
```

The capture command runs the current core Vitest benchmarks from the repo root and writes `benchmark-results/latest.json`. The JSON includes Node, OS, CPU, commit SHA, timestamp, benchmark name, mean and median timing when Vitest reports them, and iteration count. Use `npm run benchmark:record -- --out benchmark-results/my-run.json` to save a named artifact intentionally. Extra Vitest arguments can be passed after a second separator, for example `npm run benchmark:record -- --out benchmark-results/quick.json -- --maxWorkers=1`.

Check the latest structured result against `benchmark-budgets.json` in warn-only mode with:

```sh
npm run benchmark:budget
```

The default budget command is CI-friendly and exits successfully while reporting `pass`, `warn`, and `missing` rows. To exercise the future release-gate behavior locally, run `node scripts/check-benchmark-budgets.mjs --fail-on-blocking`; only budgets marked `blocking: true` can fail that mode. The 720p and 1080p grid detection budgets are marked blocking-ready because they are isolated detector hot-path benchmarks with direct fixture coverage and lower expected noise than full cleanup or large-sheet workflows. Full cleanup, large-sheet cleanup, palette remap, and export bundle budgets remain advisory until repeated CI/local artifacts show stable timing and complete benchmark coverage.

## Core Hotspot Ranking - 2026-05-06

This snapshot was captured for optimization-5.1.2 using the opt-in core phase timing hooks from optimization-5.1.1. The timing harness called `fixImage(..., { collectPhaseTimings: true })` and used standalone wall-clock timing around `detectGridCandidates` for grid-only operations. The one-off harness was removed after collection; the permanent verification command was:

```sh
npm run benchmark -w @pixelaid/core
```

Existing benchmark means from that run:

| Benchmark | Mean |
| --- | ---: |
| `fake-pixel-720p-single: grid detection 0.92MP` | 61.70 ms |
| `fake-pixel-720p-single: full cleanup 0.92MP` | 79.93 ms |
| `fake-pixel-1080p-single: grid detection 2.07MP` | 148.98 ms |
| `fake-pixel-large-sheet: frame-aware cleanup 64 frames` | 184.02 ms |
| `detects crop-aware grid candidates` | 39.97 ms |
| `fixes cropped adaptive single sprite` | 106.47 ms |

Phase timing snapshot:

| Fixture | Operation | Total | Top timed phases |
| --- | --- | ---: | --- |
| `fake-pixel-720p-single` | grid detection | 77.43 ms | grid detection 77.43 ms |
| `fake-pixel-720p-single` | fix | 108.86 ms | downsampling 55.27 ms; background pre-alpha 25.79 ms; denoise 8.86 ms |
| `fake-pixel-1080p-single` | grid detection | 135.39 ms | grid detection 135.39 ms |
| `fake-pixel-1080p-single` | fix | 213.46 ms | downsampling 122.17 ms; background pre-alpha 70.36 ms; outline cleanup 6.13 ms |
| `fake-pixel-large-sheet` | fix | 145.53 ms | sheet frame loop 120.55 ms; palette remap 17.40 ms; palette extraction 4.19 ms |
| `large-landscape-bands` | palette-heavy fix | 307.07 ms | downsampling 170.33 ms; palette remap 114.20 ms; palette extraction 16.30 ms |
| `checkerboard-baked-alpha-matte` | alpha/halo fix | 3.08 ms | background pre-alpha 1.30 ms; halo removal 0.63 ms; alpha cleanup 0.47 ms |

Ranked optimization targets:

1. Downsampling and sheet frame downsampling. `downsampling` was 122.17 ms on the 1080p fix, 170.33 ms on the palette-heavy large background, and most of the 120.55 ms sheet frame loop. Primary paths: `packages/core/src/downsample.ts:57`, `packages/core/src/downsample.ts:143`, `packages/core/src/downsample.ts:196`, and `packages/core/src/downsample.ts:215`.
2. Grid detection on large sources. Standalone grid detection was 77.43 ms on 720p and 135.39 ms on 1080p in the timing harness; the benchmark mean was 148.98 ms for 1080p. Primary path: `packages/core/src/grid.ts:8`.
3. Palette remapping on large palette-heavy images. `palette-remap` was 114.20 ms on `large-landscape-bands`, much larger than palette extraction at 16.30 ms for that fixture. It was also visible on the large sheet at 17.40 ms. Primary path: `packages/core/src/palette.ts:744`.

Secondary targets:

- Background/pre-alpha cleanup is meaningful on large single-sprite sources: 25.79 ms at 720p and 70.36 ms at 1080p.
- Palette extraction and color counting are not the top local cost on these fixtures, but diagnostics and extraction still repeat related passes in `packages/core/src/palette.ts:83` and `packages/core/src/palette.ts:307`.
- Sheet palette drift analysis should be optimized before larger animation fixtures arrive because `packages/core/src/palette.ts:636` still allocates cropped frame images.

### Optimization 5.2.1 Result

Dominant/adaptive downsampling now uses a reusable fixed RGB histogram for each `downsampleBlocks` operation instead of allocating a `Map` for every output block. The comparison below uses the 2026-05-06 pre-change hotspot run as the baseline and the same core benchmark command after the change:

| Benchmark | Before | After | Change |
| --- | ---: | ---: | ---: |
| `fake-pixel-720p-single: full cleanup 0.92MP` | 79.93 ms | 73.59 ms | 7.9% faster |
| `fake-pixel-large-sheet: frame-aware cleanup 64 frames` | 184.02 ms | 120.29 ms | 34.6% faster |
| `fixes cropped adaptive single sprite` | 106.47 ms | 103.16 ms | 3.1% faster |

### Optimization 5.2.2 Result

Median downsampling now uses reusable 256-bin channel histograms instead of allocating and sorting four arrays for every output block. The direct median benchmark was added in this change, so its first committed measurement is listed as the current baseline. Adaptive cleanup also benefits because it falls back to median when dominant coverage is low.

| Benchmark | Before 5.2.2 | After | Change |
| --- | ---: | ---: | ---: |
| `fake-pixel-720p-single: full cleanup 0.92MP` | 73.59 ms | 47.13 ms | 36.0% faster |
| `fixes cropped adaptive single sprite` | 103.16 ms | 70.07 ms | 32.1% faster |
| `fake-pixel-720p-single: median cleanup 0.92MP` | New benchmark | 52.81 ms | Baseline added |

### Optimization 5.2.3 Result

Regular 2x/4x/6x/8x integer grids with integer phase now use a narrow block-bounds fast path when no drift or explicit boundary arrays are present. The path can be disabled with `disableFastPath` for byte-for-byte comparison tests and fallback diagnostics.

| Benchmark | Before 5.2.3 | After | Change |
| --- | ---: | ---: | ---: |
| `fake-pixel-720p-single: full cleanup 0.92MP` | 47.13 ms | 44.18 ms | 6.3% faster |
| `fake-pixel-720p-single: median cleanup 0.92MP` | 52.81 ms | 53.46 ms | 1.2% slower, within local noise |
| `fake-pixel-large-sheet: frame-aware cleanup 64 frames` | 122.34 ms | 122.59 ms | Flat |
| `fixes cropped adaptive single sprite` | 70.07 ms | 70.11 ms | Flat |

### Benchmark coverage matrix

This matrix inventories the benchmark coverage that exists today. `Report-only` means the benchmark runs and prints timing data, but no pass/fail performance threshold is enforced. `Missing` means tests or product code may exist for the operation, but no repeatable benchmark currently measures it.

| Benchmark name | Fixture/source type | Operation measured | Expected asset mode | Rough image size | Current status | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `detects crop-aware grid candidates` | `createSingleSpriteCleanupFixture()` fake-pixel sprite with foreground crop | Background-aware grid candidate detection | `single` / sprite | 706x878 source, 6x grid | Report-only | `packages/core/src/singleSpriteCleanup.bench.ts` |
| `fixes cropped adaptive single sprite` | `createSingleSpriteCleanupFixture()` fake-pixel sprite with bright background | Full adaptive single-sprite fix: auto grid, crop, alpha/background cleanup, halo cleanup, palette cap | `single` / sprite | 706x878 source, 6x grid | Report-only | `packages/core/src/singleSpriteCleanup.bench.ts` |
| `fake-pixel-720p-single: grid detection 0.92MP` | Lazy generated 720p fake-pixel single sprite | Grid candidate detection | `single` / sprite | 1280x720 source -> 160x90 native target | Report-only | `packages/core/src/fixtureSuite.bench.ts` |
| `fake-pixel-720p-single: full cleanup 0.92MP` | Lazy generated 720p fake-pixel single sprite | Full single-sprite fix with manual 8x grid, adaptive downsample, background flood fill, halo cleanup, denoise, and palette cap | `single` / sprite | 1280x720 source -> 160x90 native target | Report-only | `packages/core/src/fixtureSuite.bench.ts` |
| `fake-pixel-720p-single: median cleanup 0.92MP` | Lazy generated 720p fake-pixel single sprite | Full single-sprite fix with manual 8x grid, median downsample, background flood fill, halo cleanup, denoise, and palette cap | `single` / sprite | 1280x720 source -> 160x90 native target | Report-only | `packages/core/src/fixtureSuite.bench.ts` |
| `fake-pixel-1080p-single: grid detection 2.07MP` | Lazy generated 1080p fake-pixel single sprite | Grid candidate detection | `single` / sprite | 1920x1080 source -> 240x135 native target | Report-only | `packages/core/src/fixtureSuite.bench.ts` |
| `fake-pixel-large-sheet: frame-aware cleanup 64 frames` | Lazy generated large fake-pixel animation sheet | Full sheet fix with manual 8x grid, generated frame rects, dominant downsample, and shared palette remap | `spriteSheet` / animation sheet | 2048x2048 source -> 256x256 native sheet, 64 frames | Report-only | `packages/core/src/fixtureSuite.bench.ts` |
| Import/decode preparation | Browser imports, pasted files, and CLI/automation image IO | Decode preparation and source-buffer creation | Any imported asset | Typical source files, including large sprites and sheets | Missing | Needed in web/automation benchmark harness |
| Auto suggest | Imported image plus first-pass grid/sheet/type diagnostics | Suggest asset type and fix settings | `single`, `spriteSheet`, `tileSheet`, or background review | Representative sprite, sheet, tile, and background fixtures | Missing | Needed around web/automation suggestion orchestration |
| Source analysis | Imported image inspection, palette summary, grid candidates, and diagnostics | Source analysis pass before fixing | Any imported asset | Representative sprite, sheet, tile, and background fixtures | Missing | Needed around automation inspect/web analysis flow |
| Quality report | Fixed or source image with frame metadata | Quality diagnostics and warnings | Any exportable asset | Representative fixed outputs and large sheets | Missing | Needed around `analyzeQualityReport` |
| Palette extraction/remap | Fixed output or generated source buffers | Palette extraction and remapping as an isolated operation | `single` and `spriteSheet` | 160x90, 240x135, and 256x256 native outputs | Missing | Needed around palette functions outside full fix benchmarks |
| Export bundle creation | Fixed image, manifest metadata, palettes, and engine targets | ZIP/bundle creation and export sidecar generation | `single` and `spriteSheet` exports | Native PNG plus JSON/palette/engine sidecars | Missing | Needed around `packages/exporters` and automation export flow |

## Draft Performance Budgets

These budgets are advisory draft targets for Milestone 1.1. They do not fail CI, do not block local development, and should be treated as early expectations for measuring noise and regression risk. Convert a draft budget into an enforced budget only after the benchmark is stable across repeated runs on representative developer and CI hardware.

| Status | Operation | Fixture | Target time | Measurement command | Notes |
| --- | --- | --- | --- | --- | --- |
| Blocking-ready | 720p grid detection | `fake-pixel-720p-single` 1280x720 source | <= 200 ms mean | `npm run benchmark:record` then `npm run benchmark:budget` | Covered by `fake-pixel-720p-single: grid detection 0.92MP`; isolated low-noise detector hot path. |
| Blocking-ready | 1080p grid detection | `fake-pixel-1080p-single` 1920x1080 source | <= 400 ms mean | `npm run benchmark:record` then `npm run benchmark:budget` | Covered by `fake-pixel-1080p-single: grid detection 2.07MP`; scales predictably enough to gate detector regressions. |
| Draft | 720p single-sprite full cleanup | `fake-pixel-720p-single` 1280x720 source -> 160x90 native target | <= 300 ms mean | `npm run benchmark:record` | Covered by `fake-pixel-720p-single: full cleanup 0.92MP`. |
| Draft | Large sheet frame-aware cleanup | `fake-pixel-large-sheet` 2048x2048 source, 64 frames | <= 650 ms mean | `npm run benchmark:record` | Covered by `fake-pixel-large-sheet: frame-aware cleanup 64 frames`. |
| Draft | Palette remap on fixed output | Fixed 160x90, 240x135, and 256x256 native outputs | <= 50 ms mean | `npm run benchmark:record` after adding isolated palette benchmark coverage | Budget target exists before the isolated benchmark; current full-fix benchmarks include palette work but do not isolate it. |
| Draft | Export bundle creation | Fixed PNG, JSON manifest, palette file, and engine sidecars | <= 250 ms mean | `npm run benchmark:record` after adding export bundle benchmark coverage | Budget target exists before the export benchmark; no current benchmark isolates bundle creation. |

Budget updates must include before/after benchmark artifacts, the command used to record them, the hardware or CI environment where they were captured, and a short explanation of why the target changed. Raise budgets only when the measured product value justifies the slower path or fixture coverage shows the previous target was unrealistic. Lower budgets when repeated data shows the target has become comfortably achievable.

## Future Benchmarks

Current large-source benchmark metadata is report-only. Future work can add budget checks for:

- Transparent sprite with halos.
- Uneven AI-generated sheet with inconsistent gutters.
- Mobile or low-power hardware profiles.
- Isolated palette extraction and remap passes.
- Import/decode, auto-suggest, source-analysis, quality-report, and export-bundle workflows.

## Web Bundle Budget

The web app keeps Vite's chunk warning aligned with PixelAid's editor reality instead of treating the default 500 kB threshold as the release policy. The current 1.1 budget is:

- Largest emitted web JavaScript chunk: 700 kB.
- Total emitted gzipped web JavaScript: 260 kB.

Run the budget check after a production build:

```sh
npm run build -w @pixelaid/web
npm run bundle:budget
```

The budget script reports the largest JavaScript chunks and fails if either limit is exceeded. Raise these limits only with a short note in this document explaining why the added payload belongs in the first-load editor path. Low-frequency surfaces such as docs, sample walkthroughs, and future sandbox workflows should be lazy loaded or split before increasing the budget.
