<img src="docs/brand/pixelaid-c-assets/header/header-logo-dark.png" alt="PixelAid" width="520">

# PixelAid

PixelAid is a deterministic cleanup tool that fixes grids, palettes, alpha, sprite sheets, tiles, and export metadata for pixel-art assets.

The repo currently contains the web editor, a Tauri desktop shell, deterministic image-processing packages, exporter helpers, CLI automation, MCP-ready tooling, and early optional integration packages. The core fixer works offline and does not require API keys.

## Status

PixelAid is under active development. The editor, core cleanup pipeline, worker path, generic and engine-oriented exporters, CLI, MCP stdio server, desktop shell, and fixture suites are implemented enough for local development and validation. Some surfaces are still WIP: the local HTTP package is a lightweight handler layer, `@pixelaid/ai` is an optional adapter package, and public release publishing still needs final distribution automation. The CLI package is prepared for npm packaging as `pixelaid`.

## Requirements

- Node.js 20 or newer.
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

Create an unsigned portable desktop artifact for the current platform:

```sh
npm run desktop:package
```

Use `npm run desktop:package:windows` on Windows to create `artifacts/desktop/PixelAid-<version>-windows-x64-portable.zip`. Use `npm run desktop:package:windows:signed` for the opt-in local Authenticode-signed Windows package. Use `npm run desktop:package:macos` on macOS to create `artifacts/desktop/PixelAid-<version>-macos-<arch>-app.zip`. The manual desktop GitHub Actions workflow uploads Windows and macOS arm64 artifacts by default; release-candidate builds can optionally add Intel macOS artifacts. The generated `artifacts/desktop/` directory is ignored by git.

Signed macOS packages are opt-in after local Apple Developer ID setup:

```sh
npm run desktop:package:macos:signed
```

The signed command reads signing and notarization settings from the ignored repo-root `.env` file, then creates `artifacts/desktop/PixelAid-<version>-macos-<arch>-signed-app.zip`. Unsigned packaging remains the default.

The desktop app wraps the same web editor and adds native open/save dialogs. See [apps/desktop/README.md](apps/desktop/README.md), [docs/desktop.md](docs/desktop.md), and [docs/desktop-release.md](docs/desktop-release.md) for Rust/Tauri requirements, release checks, unsigned package artifacts, signing expectations, and checksums.

## Package Web Releases

Create static web release artifacts from the Vite editor build:

```sh
npm run web:package:itch
npm run web:package:standalone
```

The itch package creates `artifacts/web/PixelAid-<version>-web-itch.zip` with `index.html` at the zip root for HTML5 uploads. The standalone package creates `artifacts/web/PixelAid-<version>-web-standalone.zip` for static hosting. The generated `artifacts/web/` directory is ignored by git. See [apps/web/README.md](apps/web/README.md) and [docs/web-release.md](docs/web-release.md) for package details.

## Telemetry

PixelAid telemetry is opt-in and disabled by default. When enabled for a build and by the user in the app, the editor sends curated anonymous usage and reliability events only. It does not send filenames, file paths, image data, prompts, personal identifiers, autocapture events, or session replay. See [docs/telemetry.md](docs/telemetry.md) for event scope and local `.env` configuration.

## Use The CLI

The CLI package is named `pixelaid` for npm publishing. Once it is published, install it globally or run it through `npx`:

```sh
npm install -g pixelaid
pixelaid inspect input.png --json
npx pixelaid@latest fix input.png --out fixed.png --target 96x96 --json
```

For local workspace development, build the CLI package, then run the compiled binary:

```sh
npm run build -w pixelaid
node packages/cli/dist/bin.cjs inspect input.png --json
node packages/cli/dist/bin.cjs fix input.png --out fixed.png --auto --asset-type sprite --json
```

See [packages/cli/README.md](packages/cli/README.md) for install modes, package checks, the panda sample workflow, JSON output examples, and release notes. See [docs/automation.md](docs/automation.md) for CLI and MCP-ready workflow details.

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
npm run web:package:standalone
npm run mcp:serve
npm run test
npm run lint
npm run typecheck
npm run build
npm run benchmark
npm run license:check
```

## Release Versioning

Use the root version command before cutting a release tag so package metadata stays aligned:

```sh
npm run version:set -- 0.2.0
npm run version:set -- patch
npm run version:set -- minor
npm run version:set -- major
```

The command updates the root package, every `apps/*` and `packages/*` workspace package, internal `@pixelaid/*` dependency versions, `package-lock.json`, the Tauri config, and the desktop Cargo package version. It does not run automatically during builds.

Useful scoped examples:

```sh
npm run test -w @pixelaid/core
npm run test -w @pixelaid/web
npm run test -w pixelaid
npm run build -w @pixelaid/mcp
```

## Project Docs

- [docs/architecture.md](docs/architecture.md) explains the current architecture.
- [docs/algorithms.md](docs/algorithms.md) describes the cleanup algorithms.
- [docs/editor.md](docs/editor.md) covers editor workflows.
- [docs/web-release.md](docs/web-release.md) covers browser release artifacts.
- [docs/telemetry.md](docs/telemetry.md) covers opt-in anonymous telemetry.
- [docs/automation.md](docs/automation.md) covers CLI and MCP-ready workflows.
- [docs/fixtures.md](docs/fixtures.md) covers generated fixtures and benchmarks.
- [docs/performance.md](docs/performance.md) tracks performance expectations.
- [docs/licensing.md](docs/licensing.md) covers licensing and dependency review notes.

## License

PixelAid source code is licensed under the GNU Affero General Public License version 3.0 only. See [LICENSE](LICENSE), [LICENSES.md](LICENSES.md), and [NOTICE](NOTICE).

Assets, images, sprite sheets, palettes, manifests, metadata, and other outputs produced by running PixelAid are not subject to the AGPL solely because they were created with PixelAid.
