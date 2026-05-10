# @pixelaid/shared

`@pixelaid/shared` contains common PixelAid constants, serializable types, asset-type definitions, cleanup presets, and quality-profile metadata. It is the contract layer shared by the editor, core algorithms, worker, exporters, automation, CLI, MCP, and optional AI adapters.

## Status

Implemented and actively used across the workspace. This package is private and should be treated as an internal contract package until PixelAid has a public package API policy.

## Commands

From the repo root:

```sh
npm run test -w @pixelaid/shared
npm run build -w @pixelaid/shared
npm run typecheck -w @pixelaid/shared
```

From `packages/shared`:

```sh
npm run test
npm run build
npm run typecheck
```

## Responsibilities

- `RGBAImage`, `FixOptions`, `PixelFixResult`, and image-transfer contracts.
- Asset types, asset modes, support levels, and type-to-mode mapping.
- Palette, alpha, grid, cleanup, sheet, animation, pivot, tilemap, tileset, and manifest types.
- Quality profile definitions and helpers.
- Application constants such as `PIXELAID_APP_NAME` and `PIXELAID_VERSION`.

## Development Notes

- Keep exported types serializable unless the type explicitly represents runtime data such as `Uint8ClampedArray`.
- Treat changes here as cross-package contract changes. Update dependent tests in core, exporters, worker, automation, CLI, MCP, and web when needed.
- Avoid importing implementation packages from this package. Shared should remain the lowest-level contract layer.
- Keep user-facing enum/string additions reflected in UI controls, CLI validation, MCP schemas, and manifest/export tests.

## Verification

Run shared tests and at least one dependent package test after contract changes:

```sh
npm run test -w @pixelaid/shared
npm run test -w @pixelaid/core
```
