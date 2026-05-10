# @pixelaid/fixtures

`@pixelaid/fixtures` contains generated source images, fixture metadata, golden signatures, benchmark catalogs, quality-failure cases, onboarding samples, and small helper primitives used by PixelAid tests.

## Status

Implemented as an internal test and development support package. It is private and not meant to be used independently by end users. The package keeps fixtures programmatic where possible so the repo avoids large binary test assets unless a visual golden needs one.

## Commands

From the repo root:

```sh
npm run test -w @pixelaid/fixtures
npm run build -w @pixelaid/fixtures
npm run typecheck -w @pixelaid/fixtures
```

From `packages/fixtures`:

```sh
npm run test
npm run build
npm run typecheck
```

## Fixture Areas

- High-resolution pseudo-pixel sprites.
- Transparent matte and halo sprites.
- Palette-drift animation frames.
- Uneven and presentation-style sprite sheets.
- Tileset seam cases.
- Large background fixtures.
- Quality failure corpus entries.
- Release onboarding samples.
- Visual regression case metadata.
- Benchmark fixture catalog.

## Development Notes

- Prefer generated fixtures over committed binaries when the generated version covers the behavior.
- Keep goldens small unless a larger image is needed to protect quality or performance.
- Include metadata for expected cleanup settings, target size, quality category, privacy classification, license provenance, and review status when adding quality fixtures.
- Do not add third-party image assets without license and provenance review.
- Update `docs/fixtures.md` when fixture categories or benchmark expectations change in a user-visible way.

## Verification

Run fixture tests after adding, renaming, or changing fixture metadata:

```sh
npm run test -w @pixelaid/fixtures
```

Run the core fixture/golden tests when a fixture is used by cleanup behavior:

```sh
npm run test -w @pixelaid/core
```
