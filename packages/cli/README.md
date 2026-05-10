# @pixelaid/cli

`@pixelaid/cli` provides the `pixelaid` command-line interface for local and batch PixelAid workflows. It calls `@pixelaid/automation` and emits either human-readable completion text or machine-readable JSON.

## Status

Implemented for local workspace use. The package defines a `pixelaid` binary in `package.json`, but release packaging and external installation are not finalized. For development, build the package and run `node packages/cli/dist/bin.cjs`.

## Commands

From the repo root:

```sh
npm run build -w @pixelaid/cli
npm run test -w @pixelaid/cli
npm run typecheck -w @pixelaid/cli
```

From `packages/cli`:

```sh
npm run build
npm run test
npm run typecheck
```

## Local Usage

Build first:

```sh
npm run build -w @pixelaid/cli
```

Run the compiled CLI:

```sh
node packages/cli/dist/bin.cjs inspect input.png --json
node packages/cli/dist/bin.cjs report input.png more.webp --json
node packages/cli/dist/bin.cjs suggest input.png --asset-type sprite --target 64x64 --json
node packages/cli/dist/bin.cjs fix input.png --out fixed.png --manifest fixed.json --auto --asset-type sprite --json
node packages/cli/dist/bin.cjs fix-sheet sheet.png --out-dir ./out --detect-sheet --json
node packages/cli/dist/bin.cjs palette input.png --max-colors 24 --out palette.hex
node packages/cli/dist/bin.cjs export input.png --out-dir ./bundle --engine godot,unity,phaser --bundle zip
node packages/cli/dist/bin.cjs batch ./inputs --out-dir ./out --recursive --continue-on-error --json
```

## Command Summary

- `inspect`: image metadata, palette counts, alpha stats, grid candidates, sheet detection, and suggestions.
- `report`: quality report for one or more assets.
- `suggest`: normalized fix settings without writing output.
- `fix`: single-sprite cleanup and optional manifest output.
- `fix-sheet`: sheet cleanup with detection or supplied frame metadata.
- `palette`: palette extraction to `.hex` or JSON.
- `export`: fixed output plus manifests, palette files, validation output, and engine sidecars.
- `batch`: repeated `fix` workflow for files, directories, or simple glob patterns.

Use `--json` for stable stdout payloads. Use `--progress-json` to stream progress events to stderr. Use `--diagnostics <path>` to write a redacted diagnostics file.

## Development Notes

- Keep CLI output deterministic and parseable for agent workflows.
- Keep raw image buffers out of JSON stdout.
- Add or update tests in `src/cli.test.ts` when command flags, exit codes, or result shapes change.
- Keep command parsing thin. Shared operation behavior belongs in `@pixelaid/automation`.

## Verification

Run the CLI tests after changing parser behavior, command output, diagnostics, batch handling, or bundled execution:

```sh
npm run test -w @pixelaid/cli
```
