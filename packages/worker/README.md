# @pixelaid/worker

`@pixelaid/worker` defines the browser worker protocol and the worker-side cleanup pipeline for PixelAid. It wraps `@pixelaid/core` operations so the editor can run source analysis, quality analysis, fix suggestions, and image fixing away from the main UI thread.

## Status

Implemented and used by the web editor. This package is private and is not meant to be a general worker framework. Use it when working on PixelAid's browser worker protocol, persistent worker jobs, transfer-friendly image payloads, or progress/cancellation behavior.

## Commands

From the repo root:

```sh
npm run test -w @pixelaid/worker
npm run build -w @pixelaid/worker
npm run typecheck -w @pixelaid/worker
```

From `packages/worker`:

```sh
npm run test
npm run build
npm run typecheck
```

## Responsibilities

- Define legacy and persistent worker request/response types.
- Convert transfer-friendly `ArrayBuffer` image payloads into `RGBAImage` data for core operations.
- Run source analysis, quality reports, fix suggestions, and fix jobs.
- Emit coarse progress events from core runtime callbacks.
- Support persistent worker queue policies, stale job handling, health responses, and cancellation messages.

## Important Files

- `src/protocol.ts`: worker message contracts and legacy/persistent protocol adapters.
- `src/pipeline.ts`: synchronous worker-side request dispatcher used by tests and the worker entrypoint.
- `src/fix.worker.ts`: browser worker entrypoint.

## Development Notes

- Transfer image buffers where possible instead of copying large images through React or app state.
- Keep protocol changes backward-aware. Update the adapter tests when adding request or response shapes.
- Cancellation currently works through worker job cancellation and core cancellation signals where supported. Keep long-running algorithm cancellation in `@pixelaid/core`.
- Do not add DOM, React, or Node file IO dependencies here.

## Verification

Run worker tests after protocol or pipeline changes:

```sh
npm run test -w @pixelaid/worker
```

For editor-facing worker changes, also run the web tests and manually verify import, auto-suggest, fix, cancel, and progress display in the web app.
