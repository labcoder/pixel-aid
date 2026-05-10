# @pixelaid/web

The web app is the main PixelAid editor. It provides the Vite and React UI for importing images, reviewing source and fixed output in pixel-perfect canvases, editing cleanup/export settings, playing sprite-sheet timelines, saving `.pixelaid` working documents, and exporting PNG/manifest bundles.

## Status

Implemented and ready for local development. This package is a private workspace app, not a standalone published library. It depends on the workspace packages for core processing, worker execution, exporter output, fixtures, shared types, and editor-state helpers.

The app can run by itself through Vite, but normal development starts from the repo root so workspace dependencies resolve consistently.

## Commands

From the repo root:

```sh
npm run dev
npm run build -w @pixelaid/web
npm run test -w @pixelaid/web
npm run typecheck -w @pixelaid/web
npm run preview -w @pixelaid/web
```

From `apps/web`:

```sh
npm run dev
npm run build
npm run test
npm run typecheck
npm run preview
```

`npm run dev` starts Vite. `npm run build` runs TypeScript first, then builds the production web bundle. `npm run preview` serves the built bundle after `npm run build`.

## Development Notes

- Visual preview work belongs in canvas components and canvas helper modules. Do not render image pixels as React nodes.
- Pixel-art previews must use `imageSmoothingEnabled = false` and integer draw positions where practical.
- Expensive cleanup work should stay off the main thread through `@pixelaid/worker` or engine job adapters.
- Keep inspector, preset, and document state serializable. `.pixelaid` working documents rely on portable settings and metadata.
- Desktop-specific file open/save paths should go through `src/lib/desktopBridge.ts` so the browser build keeps using web file picker and download flows.

## Important Areas

- `src/App.tsx`: editor shell composition.
- `src/components/`: canvas views, asset browser, docs page, and playback controls.
- `src/lib/`: editor state helpers, worker clients, export helpers, document handling, timeline logic, and focused testable UI models.
- `public/`: favicons, web manifest, brand assets, and app icons shared with the desktop package.

## Verification

Use focused package tests while editing UI logic:

```sh
npm run test -w @pixelaid/web
npm run typecheck -w @pixelaid/web
```

For UI or canvas changes, run the Vite app and check import, auto-suggest, fix, viewport zoom/pan, timeline playback, and export manually. Use the root `npm run build` before release-oriented changes.
