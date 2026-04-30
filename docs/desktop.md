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

The first desktop shell only wraps the web editor. Native filesystem import/export, persisted desktop preferences, app icons, signing, and installer artifacts are tracked as separate 0.4.0 follow-up issues.

## License Notes

The direct desktop dependency added for the shell is `@tauri-apps/cli`, licensed `Apache-2.0 OR MIT`. Tauri Rust crates are also used by the desktop shell and should be included in the generated third-party license report before release.
