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
npm run desktop:package
npm run desktop:package:windows
npm run desktop:package:windows:signed
npm run desktop:package:macos
npm run desktop:package:macos:signed
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

`npm run desktop:package` builds an unsigned portable artifact for the current platform. On Windows, `npm run desktop:package:windows` creates `artifacts/desktop/PixelAid-<version>-windows-x64-portable.zip` with `PixelAid.exe`, license files, notices, and a short `README.txt`. On macOS, `npm run desktop:package:macos` creates `artifacts/desktop/PixelAid-<version>-macos-<arch>-app.zip` containing `PixelAid.app` plus the same release text files. Run each platform package command on its matching operating system.

`npm run desktop:package:windows:signed` is the local opt-in Windows signing path. It reads Azure Artifact Signing values from the repo-root `.env`, signs a staged `PixelAid.exe` with SignTool and the Artifact Signing dlib, verifies the Authenticode signature, and writes `artifacts/desktop/PixelAid-<version>-windows-x64-signed-portable.zip`. The unsigned Windows package command remains the default.

`npm run desktop:package:macos:signed` is the local opt-in signing path. It reads Apple signing and notarization values from the repo-root `.env`, signs a staged copy of `PixelAid.app` with Developer ID and hardened runtime, notarizes it, staples the ticket, verifies the result, and writes `artifacts/desktop/PixelAid-<version>-macos-<arch>-signed-app.zip`. The unsigned macOS package command remains the default and strips Apple signing variables from its build environment.

On Windows, the desktop npm scripts run Tauri through the Visual Studio C++ toolchain environment. This avoids a common Git Bash collision where `link.exe` resolves to Git's GNU utility instead of Microsoft's MSVC linker. Prefer these npm scripts over raw `cargo` or `tauri` commands from Git Bash.

The manual desktop artifact workflow builds Windows x64, macOS arm64, and macOS x64 packages. Use the arm64 artifact for Apple Silicon Macs such as M-series MacBooks. Because these CI packages are unsigned and not notarized, macOS may report a downloaded app as damaged or corrupted during smoke testing. Only for trusted internal artifacts, remove quarantine after unzipping the package:

```sh
xattr -dr com.apple.quarantine PixelAid.app
```

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
- `scripts/package-desktop-artifacts.mjs`: unsigned Windows portable, opt-in signed Windows portable, unsigned macOS `.app`, and opt-in signed macOS `.app` artifact packaging.
- `scripts/verify-desktop-package.mjs`: smoke verification for extracted Windows, unsigned macOS, and signed/notarized macOS packages.

## Release Notes

See [../../docs/desktop.md](../../docs/desktop.md) for desktop setup and [../../docs/desktop-release.md](../../docs/desktop-release.md) for release packaging, signing variables, checksums, and smoke-test expectations.
