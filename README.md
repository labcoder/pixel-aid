# PixelAid

PixelAid is a Vite, React, and TypeScript editor for turning AI-generated images that only look like pixel art into real, grid-aligned, palette-limited, engine-ready pixel assets.

The repo currently contains the web editor, a Tauri desktop shell, deterministic image-processing packages, exporter helpers, CLI automation, MCP-ready tooling, and early optional integration packages. The core fixer works offline and does not require API keys.

## Status

PixelAid is under active development. The editor, core cleanup pipeline, worker path, generic and engine-oriented exporters, CLI, MCP stdio server, desktop shell, and fixture suites are implemented enough for local development and validation. Some surfaces are still WIP: the local HTTP package is a lightweight handler layer, `@pixelaid/ai` is an optional adapter package, and publishing/install flows for CLI, MCP, and desktop artifacts still need release packaging.

## Requirements

- Node.js 20 or newer.
- npm workspaces. This repo uses npm because pnpm is not required in the current working environment.
- Rust and Cargo only when running or packaging the desktop app.

Install dependencies from the repo root:

```sh
npm install
```

## Run Locally

Run the web editor:

```sh
npm run dev
```

This starts the Vite app from `apps/web`. See [apps/web/README.md](apps/web/README.md) for app-specific commands, browser preview notes, and UI development details.

## Build And Run Desktop

Run the Tauri desktop shell during development:

```sh
npm run desktop:dev
```

Check desktop prerequisites and build a local desktop package:

```sh
npm run desktop:check
npm run desktop:build
```

The desktop app wraps the same web editor and adds native open/save dialogs. See [apps/desktop/README.md](apps/desktop/README.md), [docs/desktop.md](docs/desktop.md), and [docs/desktop-release.md](docs/desktop-release.md) for Rust/Tauri requirements, release checks, signing expectations, and checksums.

## Use The CLI

Build the CLI package, then run the compiled binary:

```sh
npm run build -w @pixelaid/cli
node packages/cli/dist/bin.cjs inspect input.png --json
node packages/cli/dist/bin.cjs fix input.png --out fixed.png --auto --asset-type sprite --json
```

The package exposes a future `pixelaid` binary for installed/package-managed use, but this repo currently documents direct local execution from `packages/cli/dist/bin.cjs`. See [packages/cli/README.md](packages/cli/README.md) and [docs/automation.md](docs/automation.md) for commands, JSON result envelopes, exit codes, and batch workflow notes.

## Use The MCP Server

Run the local stdio MCP server:

```sh
npm run mcp:serve
```

Or build and run it directly:

```sh
npm run build -w @pixelaid/mcp
node packages/mcp/dist/server.cjs
```

The MCP server reads content-length-framed JSON-RPC messages from stdin and writes responses to stdout. It does not open a network port. See [packages/mcp/README.md](packages/mcp/README.md) for tool names, direct handler usage, and client configuration notes.

## Other Use Paths

- **Local HTTP handlers:** `@pixelaid/http` contains an in-process HTTP-style handler layer over automation operations. It is useful for tests and future local service work, but it is not a standalone server yet. See [packages/http/README.md](packages/http/README.md).
- **ComfyUI integration:** `integrations/comfyui-pixelaid` contains thin Python nodes that call the PixelAid CLI. See [integrations/comfyui-pixelaid/README.md](integrations/comfyui-pixelaid/README.md).
- **Library packages:** `@pixelaid/core`, `@pixelaid/exporters`, `@pixelaid/automation`, and related packages can be used inside this workspace. Most packages are private and are not published as standalone libraries yet. Start with the package README for the layer you need.
- **Optional AI adapters:** `@pixelaid/ai` is separate from the offline fixer and remains optional. See [packages/ai/README.md](packages/ai/README.md).

## Workspace Packages

```txt
apps/web              Vite + React editor UI
apps/desktop          Tauri desktop shell around the web editor
packages/core         Pure TypeScript image-processing algorithms
packages/worker       Web Worker protocol and cleanup pipeline wrapper
packages/engine       Serializable editor state and command model
packages/exporters    Manifest, palette, sheet, and engine sidecar exporters
packages/automation   Node-safe automation operations and image IO
packages/cli          PixelAid command-line interface
packages/mcp          MCP tool definitions, handlers, and stdio server
packages/http         Local HTTP-style handler layer over automation
packages/ai           Optional AI-provider adapters and provenance helpers
packages/shared       Shared types, constants, and metadata contracts
packages/fixtures     Generated fixtures, goldens, and benchmark sources
```

## Common Commands

```sh
npm run dev
npm run desktop:dev
npm run mcp:serve
npm run test
npm run lint
npm run typecheck
npm run build
npm run benchmark
npm run license:check
```

Useful scoped examples:

```sh
npm run test -w @pixelaid/core
npm run test -w @pixelaid/web
npm run test -w @pixelaid/cli
npm run build -w @pixelaid/mcp
```

## Project Docs

- [docs/architecture.md](docs/architecture.md) explains the current architecture.
- [docs/algorithms.md](docs/algorithms.md) describes the cleanup algorithms.
- [docs/editor.md](docs/editor.md) covers editor workflows.
- [docs/automation.md](docs/automation.md) covers CLI and MCP-ready workflows.
- [docs/fixtures.md](docs/fixtures.md) covers generated fixtures and benchmarks.
- [docs/performance.md](docs/performance.md) tracks performance expectations.
- [docs/licensing.md](docs/licensing.md) covers licensing and dependency review notes.

## License

PixelAid source code is licensed under the GNU Affero General Public License version 3.0 only. See [LICENSE](LICENSE), [LICENSES.md](LICENSES.md), and [NOTICE](NOTICE).

Assets, images, sprite sheets, palettes, manifests, metadata, and other outputs produced by running PixelAid are not subject to the AGPL solely because they were created with PixelAid.
