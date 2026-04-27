# Licensing

This document is a working engineering note, not legal advice. A software attorney should review the final public license, attribution language, and commercial licensing path before release.

## Intended Project Strategy

- Public source license target: CPAL-1.0 with attribution terms filled out.
- Optional commercial/proprietary license path for customers needing different terms, private integrations, support, or redistribution without public attribution.
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

No image quantization, Three.js, desktop, AI SDK, native, or WASM dependency has been added in this milestone.

MIG-8 palette workflows add no new runtime or build dependency. The quantizer and safe palette presets are implemented in-repo to avoid GPL/AGPL/LGPL, commercial licensing, attribution, and bundle-size risk. Third-party named palettes should be added only after license/attribution review.
