# Desktop App

PixelAid's desktop app is a Tauri shell around the existing Vite web editor. The web app remains the primary UI surface, and the pure image-processing packages stay independent from desktop APIs.

## Commands

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
```

The desktop build commands require the Rust toolchain and Cargo to be installed. `npm run desktop:check` reports missing prerequisites before packaging starts. The normal root `npm run build` command intentionally stays focused on the TypeScript workspaces so web/core verification can pass on machines that do not have Rust installed yet.

On Windows, the desktop npm scripts automatically enter the Visual Studio C++ toolchain environment before running Tauri. This keeps Git Bash compatible even when `link.exe` would otherwise resolve to Git's GNU utility at `C:\Program Files\Git\usr\bin\link.exe`. If you run raw `cargo` or `tauri` commands from Git Bash, launch the shell through `VsDevCmd.bat` or ensure the MSVC linker directory is before Git's `usr\bin` on `PATH`.

Unsigned local builds can use `npm run desktop:build`. Unsigned portable artifacts use `npm run desktop:package` for the current platform, `npm run desktop:package:windows` on Windows, or `npm run desktop:package:macos` on macOS. The package commands write ignored zip files under `artifacts/desktop/`.

Signed packages are opt-in. `npm run desktop:package:windows:signed` reads Azure Artifact Signing settings from the repo-root `.env` file, signs a staged `PixelAid.exe`, verifies the Authenticode signature, and creates `artifacts/desktop/PixelAid-<version>-windows-x64-signed-portable.zip`. `npm run desktop:package:macos:signed` reads Apple Developer ID and App Store Connect notarization settings from `.env`, signs a staged copy of `PixelAid.app`, notarizes and staples it, verifies the signature, and creates `artifacts/desktop/PixelAid-<version>-macos-<arch>-signed-app.zip`. Unsigned packaging remains the default even when signing variables exist in `.env` or the shell environment.

Windows packages contain `PixelAid.exe`, license files, notices, and a short `README.txt`. Release Windows executables use the Windows GUI subsystem, so launching the portable app should not open an extra console window. macOS packages contain a zipped `PixelAid.app` bundle and the same release text files; opening the `.app` from Finder should not open Terminal. The `.app` bundle name and internal executable name are separate; CI verification reads `CFBundleExecutable` from `Info.plist` instead of assuming the binary is named `PixelAid`.

The manual desktop GitHub Actions workflow builds the Windows x64 portable zip plus the macOS arm64 `.app` zip. Release-candidate builds can optionally add Intel macOS artifacts and signed macOS artifacts. Unsigned CI macOS packages are not notarized; after downloading from GitHub, Gatekeeper may call the app damaged or corrupted. For trusted smoke-test artifacts only, unzip the package and run `xattr -dr com.apple.quarantine PixelAid.app` before launching. Public macOS downloads should be signed and notarized instead of asking users to remove quarantine.

Public builds should also run `npm run desktop:release:check` without `--allow-unsigned` so missing signing/notarization secrets fail before artifacts are published. Local release checks read `.env` by default and never print secret values. After packaging, `npm run desktop:checksums` writes a sorted `SHA256SUMS.txt` for the generated bundle directory or a copied artifact directory.

## Structure

```txt
apps/desktop/package.json           Tauri CLI workspace
apps/desktop/src-tauri/             Rust desktop shell
apps/desktop/src-tauri/tauri.conf.json
artifacts/desktop/                  Ignored unsigned package output
```

The Tauri config runs the existing web dev server in development and builds `@pixelaid/web` before packaging. The packaged app loads `apps/web/dist`.

See `docs/desktop-release.md` for the release packaging checklist, artifact notes, signing prerequisites, checksum generation, and update policy.

## Current Scope

The desktop shell wraps the web editor and enables native image import plus ZIP bundle export through the operating system's open/save dialogs. Drag/drop and paste still use the browser path, and the browser build still uses the web file picker and download behavior.

Editor settings and user presets persist through the same local preference store used by the web app. App icons are generated from the first-party PixelAid brand source and referenced by the Tauri bundle config. Signing, notarization, checksum generation, and installer artifact publication are release-owner steps documented in `docs/desktop-release.md`.

GitHub Release publication remains deferred until the signed artifact workflow has been verified end to end.

## Filesystem Permissions

The desktop shell registers Tauri's dialog and filesystem plugins. The open/save dialogs temporarily add selected paths to the filesystem scope, and the app enables read-file and write-file permissions for those selected paths. PixelAid does not grant broad recursive filesystem access by default.

## Brand Icons

Desktop app icons live in `apps/desktop/src-tauri/icons/` and are regenerated with `npm run brand:sync`. See `docs/brand.md` for source files, generated outputs, and verification commands.

## License Notes

The direct desktop dependencies added for the shell are `@tauri-apps/cli`, `@tauri-apps/plugin-dialog`, and `@tauri-apps/plugin-fs`, all licensed `Apache-2.0 OR MIT` or `MIT OR Apache-2.0`. Tauri Rust crates and plugins are also used by the desktop shell and should be included in the generated third-party license report before release.
