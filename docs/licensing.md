# Licensing

This document is a working engineering note, not legal advice. A software attorney should review the final public license, attribution language, and commercial licensing path before release.

## Intended Project Strategy

- Public source license: GNU Affero General Public License version 3.0 only (`AGPL-3.0-only`).
- PixelAid outputs are not subject to the AGPL solely because they were produced by PixelAid.
- Attribution is requested, not required, for games and projects that use PixelAid-produced or PixelAid-cleaned assets.
- Optional commercial/proprietary license path for customers needing closed-source embedding, white-labeling, hosted commercial service terms, private integrations, support, or redistribution without AGPL obligations.
- Project names, logos, and marks should be handled separately through trademark guidance.

## Dependency Policy

Allowed by default:

- MIT
- Apache-2.0
- BSD-2-Clause / BSD-3-Clause
- ISC
- Zlib/libpng

Avoid by default:

- GPL
- AGPL
- LGPL
- SSPL
- Commons Clause
- Business Source License
- Non-commercial or no-derivatives licenses

Exception: PixelAid's own public source license is AGPL-3.0-only by product-owner decision. Avoid adding GPL/AGPL dependencies unless the project intentionally accepts their obligations.

## Direct Dependencies Added

Runtime:

- `react` 19.2.5, MIT: UI rendering.
- `react-dom` 19.2.5, MIT: browser React renderer.
- `lucide-react` 1.11.0, ISC: compact editor icons.
- `fflate` 0.8.2, MIT: browser ZIP bundle generation.

Build/test/dev:

- `vite` 8.0.10, MIT: web dev server and bundler.
- `@vitejs/plugin-react` 6.0.1, MIT: React transform for Vite.
- `typescript` 6.0.3, Apache-2.0: strict TypeScript compiler.
- `vitest` 4.1.5, MIT: package unit tests.
- `eslint` 10.2.1, MIT: linting.
- `typescript-eslint` 8.59.0, MIT: TypeScript lint rules.
- `@eslint/js` 10.0.1, MIT: ESLint JavaScript rules.
- `@types/react` 19.2.14, MIT: React type definitions.
- `@types/react-dom` 19.2.3, MIT: React DOM type definitions.

No image quantization, Three.js, AI SDK, native image-processing, or WASM dependency has been added in this milestone. The desktop shell uses Tauri packages and Rust crates that should receive a separate crate notice report before signed desktop release artifacts.

MIG-8 palette workflows add no new runtime or build dependency. The quantizer and safe palette presets are implemented in-repo to avoid GPL/AGPL/LGPL, commercial licensing, attribution, and bundle-size risk. Third-party named palettes should be added only after license/attribution review.

MIG-14 engine adapters add no dependencies. Godot, Unity, and Phaser files are generated text/JSON helpers maintained in-repo.

## First-Party Brand Assets

PixelAid logo, favicon, header, and desktop app icon assets in `docs/brand/pixelaid-c-assets`, `apps/web/public`, and `apps/desktop/src-tauri/icons` are first-party project artwork. Keep logo and trademark permissions separate from dependency licensing, and review final public trademark/brand usage language before release.

## Release Files

- `LICENSE`: AGPL-3.0-only license text.
- `NOTICE`: PixelAid copyright, output clarification, attribution request, commercial licensing note, and brand notice.
- `ATTRIBUTION.md`: plain-language attribution and output guidance for users.
- `LICENSES.md`: release-facing summary of source, output, attribution, commercial, trademark, and dependency-notice policy.
- `THIRD_PARTY_NOTICES.md`: curated release-facing dependency notice table.
- `docs/third-party-license-report.md`: generated npm lockfile report.

Generate and check the npm dependency report with:

```sh
npm run license:report
npm run license:check
```
