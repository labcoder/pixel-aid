# @pixelaid/desktop

The desktop app is a Tauri shell around the PixelAid web editor. It packages the same UI from `@pixelaid/web` and adds native open/save dialogs for image import and bundle export.

## Status

Implemented for local desktop development and packaging checks. This package is private and is not meant to be used independently from the repo. It expects the web app to build first and uses Tauri's Rust project under `src-tauri`.

Public desktop release work still requires platform-specific signing, notarization, artifact publishing, and checksum handling by the release owner. Auto-update delivery is deferred.

## Requirements

- Node.js 20 or newer.
- npm dependencies installed from the repo root.
- Rust and Cargo installed locally.
- Tauri CLI dependency installed through this workspace.

## Commands

From the repo root:

```sh
npm run desktop:dev
npm run desktop:check
npm run desktop:build
npm run desktop:info
npm run desktop:release:check
npm run desktop:checksums
npm run test -w @pixelaid/desktop
```

From `apps/desktop`:

```sh
npm run dev
npm run check
npm run desktop:build
npm run info
npm run release:check
npm run checksums
npm run test
```

`npm run desktop:dev` launches Tauri in development mode and uses the web dev server. `npm run desktop:build` runs the desktop prerequisite check and then calls Tauri packaging.

On Windows, the desktop npm scripts run Tauri through the Visual Studio C++ toolchain environment. This avoids a common Git Bash collision where `link.exe` resolves to Git's GNU utility instead of Microsoft's MSVC linker. Prefer these npm scripts over raw `cargo` or `tauri` commands from Git Bash.

## Development Notes

- The desktop shell should stay thin. Put editor behavior in `apps/web` or shared workspace packages.
- Native dialogs and filesystem access should remain scoped to user-selected files.
- Do not commit packaged installers, release bundles, signing keys, certificates, notarization credentials, or generated checksum files for local artifacts.
- Regenerate committed icon assets with `npm run brand:sync` when the source brand artwork changes.

## Important Areas

- `src-tauri/tauri.conf.json`: app metadata, build hooks, bundle config, icons, and capabilities.
- `src-tauri/src/`: Rust shell entrypoint and desktop commands.
- `src-tauri/capabilities/`: Tauri permission scope.
- `scripts/check-desktop-prereqs.mjs`: local prerequisite check.
- `scripts/check-desktop-release-env.mjs`: signing and notarization environment validation.
- `scripts/create-desktop-checksums.mjs`: release artifact checksum generation.

## Release Notes

See [../../docs/desktop.md](../../docs/desktop.md) for desktop setup and [../../docs/desktop-release.md](../../docs/desktop-release.md) for release packaging, signing variables, checksums, and smoke-test expectations.
