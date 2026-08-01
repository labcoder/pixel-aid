# @pixelaid/core

`@pixelaid/core` contains PixelAid's deterministic image-processing algorithms. It operates on plain `RGBAImage` buffers and serializable options from `@pixelaid/shared`; it does not depend on React, the DOM, workers, network calls, or API keys.

## Status

Implemented and used by the web editor, worker package, automation package, CLI, MCP handlers, and tests. The package is private to this workspace today, but it is the closest layer to a reusable library.

Use it directly when you need synchronous, deterministic pixel-art cleanup or analysis inside this repo. Use `@pixelaid/worker` or `@pixelaid/automation` when you need browser worker orchestration or Node file IO.

## Commands

From the repo root:

```sh
npm run test -w @pixelaid/core
npm run test:visual -w @pixelaid/core
npm run benchmark -w @pixelaid/core
npm run build -w @pixelaid/core
npm run typecheck -w @pixelaid/core
```

From `packages/core`:

```sh
npm run test
npm run test:visual
npm run benchmark
npm run build
npm run typecheck
```

## Responsibilities

- Grid candidate detection and local drift planning.
- Classic and opt-in Robust native reconstruction, shared eligibility, Guarded safety, and structured selection diagnostics.
- Block downsampling from fake-pixel sources to real native pixels.
- Palette extraction, remapping, dithering, and drift analysis.
- Alpha cleanup, halo removal, morphology cleanup, outline repair/addition, and contrast expansion.
- Sheet slicing, sheet layout detection, source-frame conditioning, and frame-aware cleanup.
- Tileset seam diagnostics, tilemap grid diagnostics, scene diagnostics, and quality reports.
- Core fix orchestration through `fixImage`.

## Main Entrypoints

- `fixImage(image, options, runtimeOptions?)`
- `detectGridCandidates(image, options?)`
- `resolveRobustInferenceEligibility(input)`
- `downsampleBlocks(image, options)`
- `extractPalette`, `remapToPalette`, and `resolvePalette`
- `detectSheetLayout` and `sliceSheetFrames`
- `suggestFixSettings` and `suggestFixSettingsForAssetType`
- `analyzeQualityReport`

## Development Notes

- Keep algorithms pure and deterministic. Pass options explicitly.
- Keep hot loops allocation-conscious: use typed arrays, index math, and reusable buffers where practical.
- Put cancellation and progress integration behind runtime options. Do not add UI or Node file IO here.
- Add tests next to the algorithm file. Use small fixtures unless a benchmark or golden image needs a larger source.
- Keep new dependencies out of this package unless the license and bundle/runtime cost justify them.

## Verification

Run focused tests after algorithm changes:

```sh
npm run test -w @pixelaid/core
```

Run visual goldens and benchmarks when changing cleanup behavior, palette behavior, sheet detection, or performance-sensitive loops:

```sh
npm run test:visual -w @pixelaid/core
npm run benchmark -w @pixelaid/core
```
