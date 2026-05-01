# Onboarding And Release Demo Samples

PixelAid release demos use deterministic first-party fixtures from `@pixelaid/fixtures`. They are generated in TypeScript from simple drawing primitives, not downloaded, scraped, or AI-generated from third-party prompts. They are safe to redistribute with PixelAid release artifacts as first-party sample assets.

The canonical sample metadata lives in `packages/fixtures/src/onboardingSamples.ts` as `releaseOnboardingSamples`. Use that registry for first-run UI wiring, release QA, and demo scripts so settings stay reproducible.

## Reproduction

Run the fixture metadata tests:

```sh
npm run test -w @pixelaid/fixtures
```

Use sample metadata from code:

```ts
import { cleanupFixtureCatalog, releaseOnboardingSamples } from "@pixelaid/fixtures";

const sample = releaseOnboardingSamples.find((candidate) => candidate.id === "demo-fake-grid-robot");
const fixture = cleanupFixtureCatalog.find((candidate) => candidate.id === sample?.sourceFixtureId);
const sourceImage = fixture?.createImage();
```

The generated `sourceImage` is an `RGBAImage`. Browser UI wiring can convert it to a preview/importable image through a canvas without adding PNG fixtures to git.

## Samples

| Sample ID | Source fixture | Asset type | Failure mode | Suggested settings | Expected output |
| --- | --- | --- | --- | --- | --- |
| `demo-fake-grid-robot` | `single-robot-6x` | Sprite | High-resolution art only appears pixelated; the native sprite is hidden inside a 6x pseudo-pixel grid. | Auto grid, crop to bounds, adaptive downscale, background flood-fill alpha, 24 colors. | 102x144 native sprite with 6x grid metadata, transparent background, and no smoothed preview pixels. |
| `demo-halo-checker-icon` | `checkerboard-baked-alpha-matte` | Icon | Checkerboard transparency and pale matte are baked into opaque pixels. | Manual 1x grid, dominant downscale, background flood-fill alpha, halo removal, transparent RGB `#000000`, 8 colors. | 64x64 icon with transparent corners, removed checkerboard cells, and no near-white fringe. |
| `demo-palette-drift-walk` | `palette-drift-walk-4f` | Animation sheet | Per-frame color drift can make animation palettes flicker. | Manual 1x grid, 24x32 frames, 1 row, 4 columns, sheet-locked auto palette, no dithering, 12 colors. | 96x32 four-frame walk sheet with one stable palette and consistent pivots. |
| `demo-broken-tileset-seams` | `tileset-broken-seams-2x2-16` | Tileset | Adjacent tile edges have mismatched colors and lighting discontinuity. | Manual 1x grid, 16x16 frames, 2 rows, 2 columns, preserve alpha, conservative cleanup, 16 colors. | Diagnostic tileset with repeat-preview warnings for `edge-mismatch` and `lighting-discontinuity`. |
| `demo-background-preservation` | `large-landscape-bands` | Background | Large scenic art should not be cropped like a foreground sprite. | Auto grid review, crop-to-bounds disabled, adaptive downscale, preserve alpha, no halo cleanup, 64 colors. | 240x135 preservation-oriented review with full scene bounds and metrics visible. |

## Reviewer Workflow

1. Open the sample from `releaseOnboardingSamples`.
2. Generate the source with the linked `cleanupFixtureCatalog` fixture.
3. Apply `sample.suggestedSettings`.
4. Confirm the viewport reports native output size, zoom, grid confidence where applicable, palette count, frame size, alpha mode, and export metadata.
5. Compare the result to `sample.expectedOutput` and the sample-specific `reproduction.verification` notes.

## Integration Notes

- Do not hard-code sample settings in app UI. Import `releaseOnboardingSamples` or copy the registry into an app-level adapter so docs and first-run UI stay aligned.
- First-run UI should expose sample ID, source fixture ID, expected output, and provenance before importing a generated source.
- If future release packaging needs PNG files, add a deterministic exporter script that reads this registry and writes generated PNGs from `RGBAImage` buffers. Keep generated binary assets small and regenerate them from the registry.

## Provenance And Licensing

All samples in `releaseOnboardingSamples` use:

- Origin: first-party generated.
- Author: Mighty Games.
- Generator: `@pixelaid/fixtures` deterministic TypeScript generators.
- License label: PixelAid first-party sample asset.
- Redistribution: safe for release.

These sample assets are PixelAid project materials. They do not add third-party asset obligations and are not evidence that user outputs are subject to PixelAid source-code licensing.
