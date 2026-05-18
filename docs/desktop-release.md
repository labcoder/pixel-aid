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

## Local Signed Windows Builds

Unsigned desktop packages remain the default. Signed Windows packaging is opt-in:

```sh
npm run desktop:package:windows:signed
```

The signed command reads local Azure Artifact Signing values from `.env` in the repo root, then merges the current shell environment over those values. The `.env` file is ignored by git. Do not commit signing metadata that identifies a real account, private keys, credentials, or generated release artifacts.

Use `.env.example` as the shape for local setup:

```sh
WINDOWS_SIGNING_ENDPOINT="https://REGION.codesigning.azure.net"
WINDOWS_SIGNING_ACCOUNT_NAME="YOUR_ARTIFACT_SIGNING_ACCOUNT"
WINDOWS_SIGNING_CERTIFICATE_PROFILE_NAME="YOUR_CERTIFICATE_PROFILE"
```

The signed Windows command builds the Tauri executable, copies it into `artifacts/desktop/staging/`, signs the staged `PixelAid.exe` with SignTool and the Azure Artifact Signing dlib, verifies the Authenticode signature, and finally creates `artifacts/desktop/PixelAid-<version>-windows-x64-signed-portable.zip`.

Local prerequisites:

- Windows SDK SignTool `10.0.2261.755` or newer.
- .NET 8 runtime for the Artifact Signing dlib.
- `Microsoft.ArtifactSigning.Client` NuGet package available under the user NuGet package cache or `artifacts/tools/`.
- An Azure login method supported by `DefaultAzureCredential`; Azure CLI is the simplest local path.
- `Artifact Signing Certificate Profile Signer` permission for the certificate profile.

Example local Azure CLI setup:

```powershell
winget install -e --id Microsoft.AzureCLI
az login
```

The package script auto-discovers `signtool.exe` from the Windows SDK and `Azure.CodeSigning.Dlib.dll` from common NuGet package locations. If auto-discovery fails, set:

```sh
WINDOWS_SIGNING_SIGNTOOL_PATH="C:\\path\\to\\signtool.exe"
WINDOWS_SIGNING_DLIB_PATH="C:\\path\\to\\Azure.CodeSigning.Dlib.dll"
```

The generated metadata excludes `InteractiveBrowserCredential` by default so local and CI signing cannot hang on a hidden browser prompt. Use Azure CLI, Azure PowerShell, Visual Studio, or another non-interactive `DefaultAzureCredential` source before running the signed package command. If an interactive browser flow is intentionally needed for a local test, set `WINDOWS_SIGNING_ALLOW_INTERACTIVE_BROWSER=1`.

Verify a signed package after extracting it:

```sh
node apps/desktop/scripts/verify-desktop-package.mjs windows C:\path\to\extracted\package --signed
```

## Local Signed macOS Builds

Unsigned desktop packages remain the default. Signed macOS packaging is opt-in:

```sh
npm run desktop:package:macos:signed
```

The signed command reads local Apple signing and notarization values from `.env` in the repo root, then merges the current shell environment over those values. The `.env` file is ignored by git. Do not commit certificates, private keys, API keys, app-specific passwords, or generated notarization archives.

Use `.env.example` as the shape for local setup:

```sh
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
APPLE_API_KEY="YOUR_KEY_ID"
APPLE_API_ISSUER="YOUR_ISSUER_ID"
APPLE_API_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_YOUR_KEY_ID.p8"
```

The signed macOS command builds the Tauri `.app` without Apple signing variables in the build environment, copies the app into `artifacts/desktop/staging/`, signs the staged copy with Developer ID and hardened runtime, submits it to Apple notarization with `notarytool`, staples the notarization ticket, runs local signature/Gatekeeper checks, and finally creates `artifacts/desktop/PixelAid-<version>-macos-<arch>-signed-app.zip`.

Verify a signed package after extracting it:

```sh
node apps/desktop/scripts/verify-desktop-package.mjs macos /path/to/extracted/package arm64 --signed
```

Use `x64` instead of `arm64` for Intel builds.

## GitHub Actions Telemetry Setup

Release and artifact workflows read opt-in telemetry build settings from GitHub Actions secrets and variables. Add these under **Settings -> Secrets and variables -> Actions** before running release-candidate workflows.

Secrets:

```txt
TELEMETRY_POSTHOG_PROJECT_KEY
```

Variables:

```txt
TELEMETRY_PROVIDER=posthog
TELEMETRY_POSTHOG_HOST=https://us.i.posthog.com
TELEMETRY_ENABLED=1
TELEMETRY_BUILD_CHANNEL=release
```

The workflow YAML sets per-artifact distribution labels. Do not add those in the GitHub UI. The current labels are:

```txt
desktop_windows_portable
desktop_macos_app
web_standalone
web_itch
```

The PostHog project key is shipped in client-side web and desktop bundles by design. Treat it as public client configuration, but keep it in GitHub Secrets so workflow logs do not casually print it. Users still need to opt in from `File -> Privacy & Telemetry` before telemetry events are sent.

## GitHub Actions Windows Signing Setup

Signed Windows release-candidate artifacts use the `release-signing` GitHub Environment and Azure Artifact Signing with OpenID Connect. Do not store Azure client secrets for this workflow.

Create a GitHub Environment named:

```txt
release-signing
```

Add these **environment secrets** under **Settings -> Environments -> release-signing**:

```txt
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
WINDOWS_SIGNING_ENDPOINT
WINDOWS_SIGNING_ACCOUNT_NAME
WINDOWS_SIGNING_CERTIFICATE_PROFILE_NAME
```

In Azure, create or reuse a Microsoft Entra app registration for GitHub Actions, then add a federated credential for this repository using:

```txt
Entity type: Environment
Environment name: release-signing
Audience: api://AzureADTokenExchange
```

Grant that app registration/service principal the `Artifact Signing Certificate Profile Signer` role, or the equivalent `Trusted Signing Certificate Profile Signer` role if that is the name shown in the Azure portal. Prefer assigning the role at the certificate profile scope. If the portal does not expose IAM at the profile scope, assign it at the signing account scope.

The workflow installs the Microsoft Artifact Signing client into the GitHub runner's NuGet cache, logs into Azure through OIDC, signs the staged Windows executable, verifies the Authenticode signature, and uploads only the signed portable zip.

## GitHub Actions macOS Signing Setup

Signed macOS release-candidate artifacts use the same `release-signing` GitHub Environment. Add these **environment secrets** under **Settings -> Environments -> release-signing**:

```txt
MACOS_CERTIFICATE_P12_BASE64
MACOS_CERTIFICATE_PASSWORD
MACOS_KEYCHAIN_PASSWORD
APPLE_SIGNING_IDENTITY
APPLE_API_KEY
APPLE_API_ISSUER
APPLE_API_KEY_P8_BASE64
```

The workflow imports the certificate into a temporary runner keychain, writes the App Store Connect API key to a temporary file, signs and notarizes the staged `.app`, verifies the signed package, uploads the zip artifact, and removes temporary signing files.

## GitHub Actions itch.io Publishing Setup

itch.io publishing uses the `release-publishing` GitHub Environment. Add:

```txt
Secret: BUTLER_API_KEY
Variable: ITCH_TARGET
```

When `publish_itch` is enabled, the release workflow publishes:

- `html5`: itch.io browser build.
- `windows`: signed Windows portable package.
- `macos-arm64`: signed Apple Silicon macOS package.
- `macos-x64`: signed Intel macOS package when `macos_x64` is enabled.

Publishing requires `windows_signed` and `macos_signed` to be enabled so public desktop channels receive signed artifacts.

If publishing fails after a release artifact run already built successfully, use the separate `.github/workflows/publish-itch.yml` workflow with the previous run ID. It downloads the existing artifacts and republishes the itch.io channels without rebuilding or resigning the desktop apps.

## Manual CI Artifact Builds

The manual GitHub Actions workflow at `.github/workflows/desktop-artifacts.yml` is artifact-only. It runs on `workflow_dispatch`, builds unsigned Windows and macOS arm64 packages, verifies the package contents, and uploads the resulting zip files as workflow artifacts without wrapping each package in another artifact zip. It does not create a GitHub Release, sign binaries, notarize macOS builds, push to itch.io, or publish anything externally.

This workflow is intentionally kept as the quick unsigned desktop smoke-test path. It can be triggered on any branch from **Actions -> Desktop Artifacts -> Run workflow**.

The workflow currently emits:

- `pixelaid-windows-portable`: Windows x64 portable package.
- `pixelaid-macos-arm64-app`: macOS package for Apple Silicon Macs, including M-series MacBooks.

For public repositories, standard GitHub-hosted runners are free and unlimited. For private repositories, the same workflow consumes the account's included Actions minutes and may incur usage charges after those minutes are exhausted.

To test it:

1. Push the branch containing the workflow.
2. In GitHub, open **Actions**.
3. Choose **Desktop Artifacts**.
4. Select **Run workflow**.
5. Download `pixelaid-windows-portable` and `pixelaid-macos-arm64-app` from the completed run as needed.
6. Inspect each zip and smoke test the app on the matching operating system.

Browser downloads from GitHub apply macOS quarantine metadata. For unsigned and unnotarized CI artifacts, Finder may report that `PixelAid.app` is damaged or corrupted even when the package built correctly. For trusted internal smoke tests only, unzip the macOS package, then remove quarantine before first launch:

```sh
xattr -dr com.apple.quarantine PixelAid.app
```

Do not ask public users to do this. Public macOS artifacts should be Developer ID signed and notarized before distribution.

## Manual Release-Candidate Artifacts

The manual GitHub Actions workflow at `.github/workflows/release-artifacts.yml` is the broader release-candidate artifact path. It runs on `workflow_dispatch`, gates the build with license, typecheck, test, and lint checks, then creates release-candidate artifacts for:

- itch.io HTML5 upload: `pixelaid-web-itch`.
- Windows x64 portable package: `pixelaid-windows-portable`, or `pixelaid-windows-signed-portable` when `windows_signed` is enabled.
- macOS Apple Silicon app package: `pixelaid-macos-arm64-app`, or `pixelaid-macos-arm64-signed-app` when `macos_signed` is enabled.
- Optional macOS Intel app package: `pixelaid-macos-x64-app`, or `pixelaid-macos-x64-signed-app` when `macos_x64` and `macos_signed` are both enabled.

Standalone web packaging remains available locally through `npm run web:package:standalone`, but it is intentionally not part of release-candidate artifacts yet.

Use this workflow when preparing a versioned release candidate after running `npm run version:set` and pushing the release branch or tag. It does not publish a GitHub Release or upload anything outside GitHub Actions artifacts unless `publish_itch` is enabled.

To test it:

1. Push the branch containing the workflow.
2. In GitHub, open **Actions**.
3. Choose **Release Artifacts**.
4. Select **Run workflow**.
5. Leave signing checkboxes off for a normal unsigned release-candidate run, or enable `windows_signed` and `macos_signed` for signed desktop artifacts.
6. Leave `macos_x64` off for the default Apple Silicon macOS package only, or enable it to also build the Intel package.
7. Leave `publish_itch` off for artifact review only, or enable it to publish the web and signed desktop channels to itch.io after the artifacts build.
8. If publishing needs to be retried without rebuilding, run **Publish itch.io** with the release workflow run ID.
9. Download and inspect the web and desktop artifacts from the completed run.
10. Smoke test each desktop artifact on the matching operating system.

For a dry-run release check without secrets, use:

```sh
npm run desktop:release:check -- --allow-unsigned
```

The `--allow-unsigned` flag is for local dry runs only. Public builds should run the same check without that flag. Local release checks read `.env` by default; use `--no-env-file` to validate only the current shell environment.

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
npm run desktop:package:windows:signed
npm run desktop:package:macos:signed
npm run desktop:checksums
```

`npm run desktop:release:check` fails when required signing/notarization environment variables are missing. Signing secrets must come from local secret storage or CI secrets. Never commit certificates, private keys, notarization credentials, update keys, or passwords.

### Windows Signing

Provide one of these signing paths. Azure Artifact Signing is the preferred local and CI path:

- `WINDOWS_SIGNING_ENDPOINT`, `WINDOWS_SIGNING_ACCOUNT_NAME`, and `WINDOWS_SIGNING_CERTIFICATE_PROFILE_NAME` for Azure Artifact Signing.
- `WINDOWS_SIGNING_CERT_PATH` and `WINDOWS_SIGNING_CERT_PASSWORD` for a certificate file managed outside git.
- `WINDOWS_SIGNING_COMMAND` for an external signing command supplied by the release environment.

### macOS Signing And Notarization

Provide:

- `APPLE_SIGNING_IDENTITY`

And one notarization credential set:

- App Store Connect API: `APPLE_API_KEY`, `APPLE_API_ISSUER`, and `APPLE_API_KEY_PATH`.

The current local signed package command uses App Store Connect API credentials. Apple ID password fallback remains deferred so secrets do not need to be passed through command-line arguments.

### Deferred Artifact Types

Installer, DMG, Linux package, Microsoft Store, Mac App Store, auto-update, GitHub Release automation, and itch.io publication flows are deferred until the portable zip and `.app` release-candidate artifacts are stable. Add those paths as separate release phases so signing, notarization, store review, and external publishing can be verified independently.

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
