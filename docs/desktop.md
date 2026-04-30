# Desktop App

PixelAid's desktop app is a Tauri shell around the existing Vite web editor. The web app remains the primary UI surface, and the pure image-processing packages stay independent from desktop APIs.

## Commands

```sh
npm run desktop:dev
npm run desktop:build
npm run desktop:info
```

The desktop commands require the Rust toolchain and Cargo to be installed. The normal root `npm run build` command intentionally stays focused on the TypeScript workspaces so web/core verification can pass on machines that do not have Rust installed yet.

## Structure

```txt
apps/desktop/package.json           Tauri CLI workspace
apps/desktop/src-tauri/             Rust desktop shell
apps/desktop/src-tauri/tauri.conf.json
```

The Tauri config runs the existing web dev server in development and builds `@pixelaid/web` before packaging. The packaged app loads `apps/web/dist`.

## Current Scope

The desktop shell wraps the web editor and enables native image import plus ZIP bundle export through the operating system's open/save dialogs. Drag/drop and paste still use the browser path, and the browser build still uses the web file picker and download behavior.

Persisted desktop preferences, app icons, signing, and installer artifacts are tracked as separate 0.4.0 follow-up issues.

## Filesystem Permissions

The desktop shell registers Tauri's dialog and filesystem plugins. The open/save dialogs temporarily add selected paths to the filesystem scope, and the app enables read-file and write-file permissions for those selected paths. PixelAid does not grant broad recursive filesystem access by default.

## License Notes

The direct desktop dependencies added for the shell are `@tauri-apps/cli`, `@tauri-apps/plugin-dialog`, and `@tauri-apps/plugin-fs`, all licensed `Apache-2.0 OR MIT` or `MIT OR Apache-2.0`. Tauri Rust crates and plugins are also used by the desktop shell and should be included in the generated third-party license report before release.
