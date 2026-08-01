# pixelaid CLI

`pixelaid` is the command-line PixelAid workflow for local fixes, batch jobs, game build scripts, and agent tools. It calls the shared automation package and writes either human-readable text or stable JSON.

## Status

Implemented and prepared for npm packaging as `pixelaid@0.1.0`. The package builds a single Node binary at `dist/bin.cjs`, publishes the `pixelaid` executable, and keeps docs-only sample images out of the packed package.

The CLI is usable from this workspace today. Published install commands work after a maintainer publishes the package to npm.

## Install

Global install, once published:

```sh
npm install -g pixelaid
pixelaid --help
```

One-off usage without a global install:

```sh
npx pixelaid@latest inspect panda-test.png --json
```

Project-local install:

```sh
npm install --save-dev pixelaid
npx pixelaid fix panda-test.png --out panda-fixed.png --target 96x96 --json
```

`pixelaid fix` and `pixelaid batch` use PixelAid's guided suggestion as the default base settings, matching the web "recommended fix" flow. Explicit flags such as `--target`, `--max-colors`, `--alpha`, or grid/cleanup controls are applied as overrides on top of that suggestion. Pass `--no-auto` to restore the fully manual legacy path that uses only explicit flags plus algorithm defaults. `--auto` and `--auto-suggest` remain accepted for older scripts but are now redundant.

Robust native-size inference is available as an explicit experiment while Classic remains the default:

```sh
pixelaid fix generated.png \
  --out generated-fixed.png \
  --native-size auto \
  --canvas 128x128 \
  --framing preserve \
  --canvas-scale native \
  --grid-strategy robust \
  --robust-safety guarded \
  --json
```

Sizing now has two explicit stages for single images. `--native-size auto|WIDTHxHEIGHT` controls the true reconstructed pixel-art dimensions. `--canvas content|native|WIDTHxHEIGHT` then packages that reconstruction without changing its native pixels unless `--canvas-scale integer|resample` requests scaling. `--framing preserve` retains proportional source padding, `pack` removes it, and `fit` scales the subject to the selected canvas; `--anchor` controls placement.

For example, a reconstructed `90x113` subject can remain `90x113` inside a `128x128` output while preserving its source-relative position. Background removal does not change that geometry. Robust safety modes are `guarded` (the automation default), `warn`, and `off`; fallback/warning details are returned in the normal JSON diagnostics and warnings. Robust background processing also requires `--full-canvas`. These controls do not implicitly change alpha removal, outlines, palettes, fringe cleanup, or downscale selection.

Existing scripts can continue using `--output-size source|detected|exact` and `--target WIDTHxHEIGHT`. Those flags retain the legacy combined sizing contract; new workflows should prefer `--native-size` plus `--canvas` so reconstruction and packaging cannot be confused.

Palette strategies accepted by `--palette-strategy`/`--quantizer` are `medianCut`, `frequency`, `perceptual`, `wu`, `kmeans`, and `familyFirst` (`median-cut` remains a CLI alias for `medianCut`). `familyFirst` seats perceptual color families first, adds nested ramps as the color budget grows, and is the guided default for single sprites/icons.

Local workspace usage:

```sh
npm run build -w pixelaid
node packages/cli/dist/bin.cjs --help
```

## Panda Example

The docs sample is stored at `packages/cli/docs/panda-test.png`. It is a repository docs asset only. `package.json` does not include `docs/` in the npm package `files` list, so `npm pack` leaves the sample image and generated example outputs out of the published tarball.

| Source | 96px fixed output |
| --- | --- |
| <img src="./docs/panda-test.png" alt="Panda source asset" width="192"> | <img src="./docs/panda-test-fixed-96.png" alt="PixelAid 96px panda output" width="192" style="image-rendering: pixelated;"> |

Inspect the source before writing output:

```sh
pixelaid inspect panda-test.png \
  --asset-type sprite \
  --target 96x96 \
  --max-colors 24 \
  --alpha preserve \
  --denoise-strength 20 \
  --outline-mode none \
  --json
```

Generate the 96px example. Bare `fix` starts from the guided recommendation; these flags override the target size and cleanup choices for the docs sample: width `96`, keep background, light noise cleanup, no outline, and max colors `24`.

```sh
pixelaid fix panda-test.png \
  --out panda-test-fixed-96.png \
  --manifest panda-test-fixed-96.manifest.json \
  --asset-type sprite \
  --target 96x96 \
  --max-colors 24 \
  --alpha preserve \
  --denoise-strength 20 \
  --outline-mode none \
  --overwrite \
  --json
```

For sprites on a chroma or matte background, pair background removal with matte cleanup so exterior color fringes are peeled before export:

```sh
pixelaid fix cat-source.png \
  --out cat-fixed.png \
  --asset-type sprite \
  --target 128x128 \
  --max-colors 64 \
  --alpha backgroundFloodFill \
  --matte-cleanup \
  --overwrite
```

Trimmed JSON output from that run:

```json
{
  "ok": true,
  "command": "fix",
  "result": {
    "result": {
      "image": { "width": 96, "height": 96, "dataByteLength": 36864 },
      "metrics": {
        "sourceWidth": 1008,
        "sourceHeight": 1059,
        "outputWidth": 96,
        "outputHeight": 96,
        "paletteCount": 24
      },
      "settings": {
        "assetType": "sprite",
        "targetWidth": 96,
        "targetHeight": 96,
        "maxColors": 24,
        "alpha": "preserve",
        "cleanup": {
          "denoiseStrength": 20,
          "outlineMode": "none"
        }
      }
    },
    "files": [
      { "kind": "image", "relativePath": "panda-test-fixed-96.png" },
      { "kind": "manifest", "relativePath": "panda-test-fixed-96.manifest.json" }
    ],
    "warnings": []
  }
}
```

Extract a palette from the same source:

```sh
pixelaid palette panda-test.png --max-colors 24 --out panda-test.palette.hex --json
```

Create an engine bundle from a fixed image:

```sh
pixelaid export panda-test-fixed-96.png \
  --out-dir ./panda-export \
  --engine godot,unity,phaser \
  --bundle zip \
  --overwrite \
  --json
```

## Commands

- `inspect`: image metadata, palette counts, alpha stats, grid candidates, sheet detection, and suggestions.
- `report`: quality report for one or more assets.
- `suggest`: normalized fix settings without writing output.
- `fix`: single-sprite cleanup and optional manifest output.
- `fix-sheet`: sheet cleanup with detection or supplied frame metadata.
- `palette`: palette extraction to `.hex` or JSON.
- `export`: fixed output plus manifests, palette files, validation output, and engine sidecars.
- `batch`: repeated `fix` workflow for files, directories, or simple glob patterns.

Use `--json` for stable stdout payloads. Use `--progress-json` to stream progress events to stderr. Use `--diagnostics <path>` to write a redacted diagnostics file. Use `--no-auto` on `fix` or `batch` only when you intentionally want the manual legacy path instead of the guided web-equivalent default.

## Development

From the repo root:

```sh
npm run build -w pixelaid
npm run test -w pixelaid
npm run typecheck -w pixelaid
```

From `packages/cli`:

```sh
npm run build
npm run test
npm run typecheck
```

Keep CLI output deterministic and parseable for agent workflows. Keep command parsing thin; shared operation behavior belongs in `@pixelaid/automation`. Add or update tests in `src/cli.test.ts` when command flags, exit codes, diagnostics, batch handling, or result shapes change.

## Packaging Checks

Use the repo-wide version command before a release so package versions stay aligned. Keep the current version at `0.1.0` until the release target changes:

```sh
npm run version:set -- 0.1.0
```

Run the focused package checks:

```sh
npm run test -w pixelaid
npm run typecheck -w pixelaid
npm pack --dry-run -w pixelaid --json
npm publish --dry-run -w pixelaid
```

The dry-run pack should include only the built binary, package manifest, README, and legal notice files. It should not include `packages/cli/docs/`.

When a maintainer is ready to release for real, publish from the workspace:

```sh
npm publish -w pixelaid
```
