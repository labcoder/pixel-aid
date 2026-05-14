# Desktop Release Checklist

This checklist tracks the current desktop packaging path. It is intentionally explicit about what is automated now, what release owners must provide through secrets, and what remains deferred.

## Supported Release Targets

The next public desktop build should target:

- Windows x64 portable zip containing `PixelAid.exe`, license files, notices, and package notes.
- macOS zipped `.app` bundle containing `PixelAid.app`, license files, notices, and package notes.

Build each platform on its native release machine or CI runner. Do not cross-sign desktop artifacts locally. Installer, DMG, Linux, Microsoft Store, Mac App Store, and auto-update artifacts are deferred until the direct-download zip flow is stable.

## Versioning

Before tagging a release, update all package and desktop metadata from the repo root:

```sh
npm run version:set -- 0.2.0
```

You can also use `patch`, `minor`, or `major` in place of an exact version. The command keeps workspace packages, internal `@pixelaid/*` dependency versions, `package-lock.json`, `apps/desktop/src-tauri/Cargo.toml`, and `apps/desktop/src-tauri/tauri.conf.json` aligned.

## Local Developer Builds

Unsigned local builds are allowed for development and smoke testing:

```sh
npm install
npm run desktop:check
npm run desktop:build
npm run desktop:package
```

`npm run desktop:check` verifies Node, npm, Rust/Cargo, and the Tauri CLI before packaging starts. `npm run desktop:build` runs that prerequisite check and then calls Tauri's packaging command from `apps/desktop`.

`npm run desktop:package` builds an unsigned zip for the current platform. Run `npm run desktop:package:windows` on Windows to create `artifacts/desktop/PixelAid-<version>-windows-x64-portable.zip`. Run `npm run desktop:package:macos` on macOS to create `artifacts/desktop/PixelAid-<version>-macos-<arch>-app.zip`. The generated `artifacts/desktop/` directory is ignored by git.

The Windows portable executable is built as a GUI app, so it should not open a console window when launched normally. The macOS artifact is a normal `.app` bundle inside a zip; opening it from Finder should not open Terminal. The bundle is named `PixelAid.app`, while the internal executable is read from `PixelAid.app/Contents/Info.plist` and may use the Cargo package name, such as `pixelaid-desktop`.

## Manual CI Artifact Builds

The manual GitHub Actions workflow at `.github/workflows/desktop-artifacts.yml` is artifact-only. It runs on `workflow_dispatch`, builds unsigned Windows and macOS packages, verifies the package contents, and uploads the resulting zip files as workflow artifacts without wrapping each package in another artifact zip. It does not create a GitHub Release, sign binaries, notarize macOS builds, push to itch.io, or publish anything externally.

The workflow currently emits:

- `pixelaid-windows-portable`: Windows x64 portable package.
- `pixelaid-macos-arm64-app`: macOS package for Apple Silicon Macs, including M-series MacBooks.
- `pixelaid-macos-x64-app`: macOS package for Intel Macs.

For public repositories, standard GitHub-hosted runners are free and unlimited. For private repositories, the same workflow consumes the account's included Actions minutes and may incur usage charges after those minutes are exhausted.

To test it:

1. Push the branch containing the workflow.
2. In GitHub, open **Actions**.
3. Choose **Desktop Artifacts**.
4. Select **Run workflow**.
5. Download `pixelaid-windows-portable`, `pixelaid-macos-arm64-app`, and `pixelaid-macos-x64-app` from the completed run as needed.
6. Inspect each zip and smoke test the app on the matching operating system.

Browser downloads from GitHub apply macOS quarantine metadata. For unsigned and unnotarized CI artifacts, Finder may report that `PixelAid.app` is damaged or corrupted even when the package built correctly. For trusted internal smoke tests only, unzip the macOS package, then remove quarantine before first launch:

```sh
xattr -dr com.apple.quarantine PixelAid.app
```

Do not ask public users to do this. Public macOS artifacts should be Developer ID signed and notarized before distribution.

For a dry-run release check without secrets, use:

```sh
npm run desktop:release:check -- --allow-unsigned
```

The `--allow-unsigned` flag is for local dry runs only. Public builds should run the same check without that flag.

## Signed Public Builds

Before producing public desktop artifacts:

```sh
npm run license:check
npm run typecheck
npm run test
npm run lint
npm run build
npm run desktop:check
npm run desktop:release:check
npm run desktop:build
npm run desktop:package
npm run desktop:checksums
```

`npm run desktop:release:check` fails when required signing/notarization environment variables are missing. Signing secrets must come from local secret storage or CI secrets. Never commit certificates, private keys, notarization credentials, update keys, or passwords.

### Windows Signing

Provide one of these signing paths:

- `WINDOWS_SIGNING_CERT_PATH` and `WINDOWS_SIGNING_CERT_PASSWORD` for a certificate file managed outside git.
- `WINDOWS_SIGNING_COMMAND` for an external signing command supplied by the release environment.

### macOS Signing And Notarization

Provide:

- `APPLE_SIGNING_IDENTITY`

And one notarization credential set:

- App Store Connect API: `APPLE_API_KEY`, `APPLE_API_ISSUER`, and `APPLE_API_KEY_PATH`.
- Apple ID fallback: `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID`.

### Deferred Artifact Types

Installer, DMG, Linux package, Microsoft Store, Mac App Store, auto-update, and itch.io publication flows are deferred until the unsigned Windows portable zip and macOS `.app` zip are stable in CI. Add those paths as separate release phases so signing, notarization, store review, and external publishing can be verified independently.

## Checksums

Generated Tauri artifacts live under `apps/desktop/src-tauri/target/` and stay ignored. Generated direct-download package zips live under `artifacts/desktop/` and also stay ignored. Release owners should copy package zips into the external release system rather than committing them.

Generate checksums after the artifacts are final:

```sh
npm run desktop:checksums
```

For a copied artifact directory:

```sh
npm run desktop:checksums -- --dir C:\path\to\release-artifacts
```

The checksum script writes a sorted `SHA256SUMS.txt` and skips pre-existing `.sha256` files plus `SHA256SUMS.txt` itself.

## Release Candidate Smoke Test

1. Record the commit SHA, operating system, Node/npm versions, Rust/Cargo versions, and Tauri CLI version.
2. Run the release gate commands above.
3. Launch the packaged app.
4. Confirm the packaged app metadata uses the PixelAid icon from `apps/desktop/src-tauri/icons/`.
5. Import a PNG or JPEG through the native open dialog.
6. Run Auto Suggest and Fix on the sample asset.
7. Export a ZIP bundle through the native save dialog.
8. Confirm the ZIP contains the fixed PNG, manifest, palette files, validation report, frame sequence files when applicable, and selected engine sidecars.
9. Confirm the web app still imports and exports through the browser path.
10. Publish artifact checksums next to the release artifacts.

## Brand Assets

Generated app icons live under `apps/desktop/src-tauri/icons/` and are committed. Regenerate them with `npm run brand:sync` whenever the source brand artwork changes.

## Auto-Update Status

Auto-update delivery is deferred. The 1.1.0 distribution path is manual release publishing with signed artifacts where supported, release notes, and `SHA256SUMS.txt`.

Before enabling in-app updates, add and document:

- Update feed hosting and rollback policy.
- Updater signing key storage through `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- `PIXELAID_UPDATE_ENDPOINT` or equivalent channel-specific feed URLs.
- Release channels for stable/beta/internal builds.
- QA coverage for update install, rollback, checksum/signature failure, and offline launch.
