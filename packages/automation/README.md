# @pixelaid/automation

`@pixelaid/automation` is the Node-safe operation layer for PixelAid. It wraps the core fixer and exporter packages with file IO, option normalization, progress events, cancellation, safe output planning, image decoding/encoding, and stable JSON-friendly result envelopes.

## Status

Implemented and used by the CLI, MCP package, and HTTP handler package. This package is private to the workspace. It is useful inside PixelAid automation code, but it is not packaged as a public SDK yet.

Use this package when you need local Node operations without the web editor. Use `@pixelaid/core` for pure in-memory algorithms, and use `@pixelaid/cli` or `@pixelaid/mcp` for user-facing automation surfaces.

## Commands

From the repo root:

```sh
npm run test -w @pixelaid/automation
npm run build -w @pixelaid/automation
npm run typecheck -w @pixelaid/automation
```

From `packages/automation`:

```sh
npm run test
npm run build
npm run typecheck
```

## Operations

- `inspectImage`: decode a source image and report dimensions, format metadata, palette data, grid candidates, sheet detection, and suggestions.
- `createQualityReport`: create non-destructive quality findings for one or more assets.
- `suggestFixSettings`: normalize fix settings for an input image without writing output files.
- `fixSprite`: fix one image and optionally write a manifest.
- `fixSpriteSheet`: fix a sheet with detected or supplied frame metadata.
- `extractPaletteFile`: write `.hex` or JSON palette files.
- `exportEngineBundle`: write fixed output, manifest, palette files, validation output, and engine helper files.

## Image Formats

Automation can read PNG, JPEG/JPG, and WebP inputs. PNG is the canonical encoded output format. JPEG inputs decode to opaque RGBA, while WebP alpha is preserved when present.

## Result Model

Operations return `AutomationResult<T>`:

```ts
type AutomationResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; error: AutomationError };
```

Errors use stable codes and exit-code metadata so CLI, MCP, HTTP, and agent workflows can handle failures without parsing prose.

## Development Notes

- Keep filesystem operations explicit and overwrite-safe. Use `planOutputFile` and related helpers for writes.
- Redact secret-like diagnostic fields through the diagnostics helpers.
- Keep raw RGBA buffers out of user-facing JSON summaries.
- Keep API-provider calls out of this package. Optional generation belongs in `@pixelaid/ai`.
- Add tests for path safety, option normalization, diagnostics, image IO, and operation envelopes when changing behavior.

## Verification

Run the automation suite after changing operations, paths, image IO, diagnostics, option parsing, progress, or result handling:

```sh
npm run test -w @pixelaid/automation
```
