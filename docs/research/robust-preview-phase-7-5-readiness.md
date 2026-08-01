# Robust Preview Phase 7.5 release-readiness record

Phase 7.5 hardens the accepted Phase 7 Robust Preview for a public opt-in release. It does not change detector ranking, safety thresholds, or product defaults. Classic remains the default and Robust remains limited to eligible single sprites, icons, and full-canvas backgrounds.

## Candidate boundary

- Date: 2026-08-01
- Branch: `pixel-bench`
- Distribution state: local only; nothing was pushed or published
- Phase 7 acceptance baseline: `5141fe7`
- Phase 7.5 implementation commits: `77bc1c3`, `c4936ad`, `d530dcb`, `cd5fd0e`, `f1de65c`, and `2d0f5a9`
- Algorithm state: unchanged from the frozen Phase 7 candidate

## Public surface matrix

| Surface | Phase 7.5 state | Result |
| --- | --- | --- |
| Web editor | Robust Preview is first-class for eligible assets, Guarded is its safety default, and Classic remains the application default. Canonical guidance is available in the in-app Docs page. | Ready |
| Desktop editor | Uses the same tested web editor and settings contract. The unsigned Windows portable package was built and independently extracted and verified. | Ready unsigned on Windows |
| CLI | Documents and exposes reconstruction strategy, safety, native reconstruction, and canvas packaging separately. Its npm tarball passes `npm publish --dry-run`. | Ready to publish explicitly |
| ComfyUI | Fix Sprite exposes Classic/Robust, Guarded/Warn/Raw safety, and full-canvas background eligibility while retaining Classic defaults. | Ready |
| MCP and HTTP-style automation | Strategy, safety, fallback diagnostics, and warnings survive the shared automation envelopes. These remain local integration surfaces rather than separately hosted services. | Ready for documented local use |
| Saved projects and export manifests | Dedicated round-trip coverage preserves strategy, safety, selected-strategy provenance, and Guarded fallback diagnostics. | Ready |
| Release documentation | Root, web, desktop, CLI, automation, core/worker/engine, release notes, troubleshooting, and launch-QA guidance describe the preview boundary and defaults. | Ready |

## Release gates

The exact candidate passed:

- `npm run license:check`;
- `npm run typecheck`;
- `npm test`: 1,550 passed and 1 intentionally skipped;
- `npm run lint`;
- `npm run build`;
- `npm run bundle:budget`;
- `npm run app-shell:check`; and
- `npm run desktop:check`.

The bundle gate now distinguishes initial JavaScript from deferred worker and Docs code. The accepted build measured 208.9 KiB of initial gzipped JavaScript, 150.4 KiB deferred, and 359.4 KiB total. The largest individual JavaScript chunk was 519.6 KiB uncompressed. All enforced budgets passed.

`App.tsx` remains 11,394 lines against the existing warn-only 9,800-line maintainability budget. This is recorded debt, not a distribution blocker, and the release workflow surfaces the warning on every candidate.

## Artifact smoke results

The following ignored local artifacts were built from this candidate and verified by extraction or npm packaging inspection:

| Artifact | SHA-256 | Verification |
| --- | --- | --- |
| `PixelAid-0.2.0-web-standalone.zip` | `7E1A03526355A66F6515882C4FE06B11314C68B5205112FBBCCD9AE870410DEC` | Root `index.html`, README, release notes, and static assets present |
| `PixelAid-0.2.0-web-itch.zip` | `55B5BA8B3359639991870A306BD8A36D9CDFB5CB2F7B08C723D867490DFDF21C` | Root `index.html`, README, release notes, and static assets present |
| `PixelAid-0.2.0-windows-x64-portable.zip` | `E1F49D32FB1A8B7FCB24FD47D36BA0D38A43A7DD89D7094EAE03D589F73844F4` | Extracted package passed the Windows executable verifier and contained every required legal/release file |
| `pixelaid-0.2.0.tgz` | `158DF1F44EDFB9F8330ACCCA44F9EB7D9238E1F88A2272E36B2BB4A9AAAFDB9B` | npm contents inspected; `npm publish --dry-run` passed |

The first real CLI pack exposed that `LICENSES.md` was absent from the npm allowlist. Phase 7.5 fixed the allowlist, added a regression test, rebuilt the tarball, and repeated the publication dry run successfully.

## Product smoke result

The built CLI processed `hero-cat-ai.png` with Robust requested, Guarded safety, automatic native reconstruction, preserved composition, and an exact 128x128 output canvas. Guarded safety selected Classic because the Robust proposal had moderate anisotropy, aspect disagreement, lower confidence, and weak axis evidence. The output remained exactly 128x128 and the manifest preserved both the requested and selected strategy plus reason codes. This is the intended safe-preview behavior.

## Actions still owned by the releaser

- Merge or otherwise promote the local branch before relying on public documentation links.
- Use the credentialed release environment for an Authenticode-signed Windows artifact.
- Build, sign, notarize, and verify macOS artifacts on the native macOS runners.
- Select `publish_itch` or `publish_npm` explicitly. Neither a normal local build nor an unqualified tag publishes npm automatically.
- Supply the existing itch.io, npm, Azure signing, and Apple signing secrets only through their protected release environments.

No signing, upload, origin push, itch.io publication, or npm publication occurred during Phase 7.5.

## Verdict

PixelAid 0.2.0 is ready to proceed as an opt-in Robust Preview release candidate, with Classic still the default. The locally verifiable web, Windows, CLI, ComfyUI, automation, persistence, export, documentation, and bundle requirements pass. Credentialed Windows/macOS signing and external publication remain deliberate release-owner operations, not engineering gaps in the candidate.

Phase 8 should now gather real-world preference, fallback, warning, override, performance, and cross-surface parity evidence before any proposal to change the default. Its preregistered methodology lives in [the Phase 8 evidence protocol](./robust-preview-phase-8-protocol.md).
