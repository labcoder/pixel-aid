# Desktop Release Checklist

This checklist tracks the current desktop packaging path. It is intentionally explicit about what is automated now and what still needs release-owner/manual work.

## Build Commands

```sh
npm install
npm run desktop:check
npm run desktop:build
```

`npm run desktop:build` runs the prerequisite check first, then calls Tauri's packaging command from `apps/desktop`.

## Local Prerequisites

- Node.js and npm.
- Rust toolchain with `rustc` and `cargo`.
- Platform-specific Tauri prerequisites, such as WebView2/MSVC on Windows.

The current development machine has Node/npm and Windows WebView/MSVC support, but does not have Rust/Cargo installed. `npm run desktop:check` reports that clearly instead of failing deep inside packaging.

## Release Candidate Smoke Test

1. Run `npm run typecheck`, `npm run test`, `npm run lint`, and `npm run build`.
2. Run `npm run desktop:check`.
3. Run `npm run desktop:build` on a machine with Rust/Cargo installed.
4. Launch the packaged app.
5. Import a PNG through the native open dialog.
6. Run Auto Suggest and Fix on the sample asset.
7. Export a ZIP bundle through the native save dialog.
8. Confirm the ZIP contains the fixed PNG, manifest, palette files, validation report, frame sequence files when applicable, and selected engine sidecars.
9. Confirm the web app still imports and exports through the browser path.

## Artifact Notes

Generated Tauri artifacts live under `apps/desktop/src-tauri/target/` and stay ignored. Release owners should copy installers/bundles into the external release system rather than committing them.

## Signing And Updates

Code signing, notarization, installer naming, and auto-update delivery are not enabled yet. Before a public release, define:

- Signing certificates and secure secret storage per platform.
- Artifact naming and checksum generation.
- Update feed hosting and rollback policy.
- Whether auto-updates are in scope for 1.0 or a later commercial distribution pass.
