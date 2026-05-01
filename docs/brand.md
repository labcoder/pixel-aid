# PixelAid Brand Assets

PixelAid brand assets are first-party project artwork stored under `docs/brand/pixelaid-c-assets`. The generated web and desktop files are checked in so release builds do not depend on local image tooling beyond the repeatable sync command.

## Source Assets

- `docs/brand/pixelaid-c-assets/source/pixelaid-c-generated-source.png`: square source artwork for generated app icons.
- `docs/brand/pixelaid-c-assets/app-icon/`: 256, 512, and 1024px PNG app icons for web manifest surfaces.
- `docs/brand/pixelaid-c-assets/favicon/`: favicon PNG sizes plus `favicon.ico`.
- `docs/brand/pixelaid-c-assets/header/`: compact and full header logos for light and dark backgrounds.

## Generated Destinations

- `apps/web/public/favicon.ico`
- `apps/web/public/favicon-*.png`
- `apps/web/public/icons/app-icon-*.png`
- `apps/web/public/brand/header-logo-*.png`
- `apps/web/public/site.webmanifest`
- `apps/desktop/src-tauri/icons/`

The web app header uses `header-logo-compact-dark.png`. Browser metadata uses the ICO, PNG favicon sizes, Apple touch icon, and web manifest. Tauri packaging reads the desktop icon list from `apps/desktop/src-tauri/tauri.conf.json`.

## Regeneration

Run this after updating anything in `docs/brand/pixelaid-c-assets`:

```sh
npm run brand:sync
```

The script copies web assets, rewrites `site.webmanifest`, and runs Tauri icon generation from the source PNG:

```sh
npx tauri icon docs/brand/pixelaid-c-assets/source/pixelaid-c-generated-source.png --output apps/desktop/src-tauri/icons
```

After regenerating, run:

```sh
npm run test --workspace @pixelaid/web -- brandAssets.test.ts
npm run build
```

## Licensing

These files are PixelAid first-party brand assets. They are suitable for PixelAid web, desktop, documentation, and release packaging surfaces. Keep project logo and trademark usage separate from third-party dependency licensing and review public trademark language before a broad release.
