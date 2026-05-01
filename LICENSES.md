# Licenses

This document summarizes PixelAid licensing for release planning. It is not legal advice; the final public release should still receive legal review.

## PixelAid Source Code

PixelAid source code is licensed under the GNU Affero General Public License version 3.0 only (`AGPL-3.0-only`). See `LICENSE` for the full license text.

The AGPL applies to PixelAid software copies, modified versions, distribution, and network-accessible modified versions. It is intended to keep improvements to PixelAid itself open when the software is shared or offered as a service.

## PixelAid Outputs

Assets, images, sprite sheets, palettes, manifests, metadata, export bundles, and other outputs produced by running PixelAid are not subject to the AGPL solely because they were created with PixelAid.

PixelAid outputs may be used in personal, commercial, open-source, or proprietary projects.

## Attribution

Attribution is requested, but not required, for games and projects that use PixelAid-generated or PixelAid-cleaned assets.

Suggested credit:

```txt
Asset cleanup powered by PixelAid by Mighty Games.
```

Redistributors of PixelAid itself must preserve copyright, license, and notice files as required by the AGPL and `NOTICE`.

## Commercial Licensing

Mighty Games may offer separate commercial terms for teams that need to:

- Embed PixelAid code in a closed-source product.
- Distribute proprietary modified versions of PixelAid.
- Offer PixelAid as part of a closed hosted commercial service.
- White-label PixelAid or remove AGPL obligations from their PixelAid software distribution.
- Receive support, private integrations, or custom licensing terms.

## Brand And Trademarks

The PixelAid name, logos, icons, and brand assets are not licensed by the AGPL except as needed to identify the software truthfully and preserve required notices. See `TRADEMARKS.md`.

## Dependency Notices

Third-party npm dependency notices are tracked in:

- `THIRD_PARTY_NOTICES.md` for release-facing notices.
- `docs/third-party-license-report.md` for the generated lockfile report.

Regenerate the report with:

```sh
npm run license:report
npm run license:check
```

Rust/Tauri crate notices should be generated separately before signed desktop release artifacts.
