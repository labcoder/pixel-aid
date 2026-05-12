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

Generate the 96px example. These flags match the guided setup choices: width `96`, keep background, light noise cleanup, no outline, and max colors `24`.

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

Use `--json` for stable stdout payloads. Use `--progress-json` to stream progress events to stderr. Use `--diagnostics <path>` to write a redacted diagnostics file.

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
