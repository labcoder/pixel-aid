# Phase 8 internal beta reviewer guide

This kit distributes PixelAid's **Robust Preview strictly as an opt-in preview**. Classic remains the default. The kit is for private evidence gathering and does not authorize publication, redistribution, or a default change.

## Choose a package

- **Web standalone**: unzip and serve the directory through any local static server. Do not open `index.html` directly from `file://`, because workers require an HTTP origin.
- **Windows desktop**: unzip and run `PixelAid.exe`. This internal package is unsigned, so Windows may show a trust warning. Do not use it as a public download.
- **CLI**: install the bundled tarball with `npm install -g ./pixelaid-0.2.0.tgz`, or run it from an isolated test project.

Verify package integrity against `SHA256SUMS.txt` before testing.

## Run a human review

1. Use a real sprite, icon, or full-canvas background that you have permission to evaluate. Do not use private prompts or assets that you cannot share at the permission level you select.
2. Keep **Native size** on automatic detection. The Blind A/B entry is disabled for manual reconstruction and ineligible asset types.
3. Select **Blind A/B** under Pixel pipeline. PixelAid creates both candidates locally with identical cleanup, palette, alpha, framing, and canvas settings.
4. Judge each concealed candidate independently: geometry, severity, manual-override need, and failure class. Then choose A, B, tie, or both failed.
5. Lock the review before revealing Classic and Robust Guarded.
6. Choose the narrowest sharing permission and an opaque collection ID. Download the evidence JSON only if you intend to share it.

PixelAid does not upload the source or evidence automatically. The JSON contains hashes and sanitized metadata, not source pixels, source filename, path, URL, prompt, or email address.

## CLI parity checks

`pixelaid compare-robust` writes `classic.png`, `robust.png`, and `evidence.json`. That record is marked `proceduralDryRun: true`; it verifies deterministic cross-surface behavior but contains no human judgment and cannot count toward promotion gates.

## Current preview boundary

- Eligible: automatic single sprites, icons, and full-canvas backgrounds.
- Not eligible: sheets, animations, character sheets, tilesets, portraits, UI elements, or manual native-size reconstruction.
- Guarded may select the Classic fallback; that is expected safety behavior, not a hidden Robust result.
- Output canvas, framing, background removal, alpha, palette, outline, fringe cleanup, and downscale remain independent of reconstruction strategy.

The authoritative cohort rules, exclusions, privacy contract, and promotion gates are in `PROTOCOL.md`.
