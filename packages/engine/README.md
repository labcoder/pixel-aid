# @pixelaid/engine

`@pixelaid/engine` contains PixelAid's serializable editor state model, command types, reducer helpers, job records, dirty-state checks, and adapter contracts. It keeps editor state logic testable outside React and outside the browser.

## Status

Implemented and used by the web app. This package is private to the workspace and is not meant to be used independently from PixelAid yet. It is a state and orchestration model, not an image-processing package.

## Commands

From the repo root:

```sh
npm run test -w @pixelaid/engine
npm run build -w @pixelaid/engine
npm run typecheck -w @pixelaid/engine
```

From `packages/engine`:

```sh
npm run test
npm run build
npm run typecheck
```

## Responsibilities

- Define the `EngineState` shape for assets, selection, document metadata, diagnostics, jobs, runtime buffers, sheet state, and timeline state.
- Define command and event contracts used by app-level orchestration.
- Provide `createEngineStore`, `reduceEngineState`, and focused helpers for selection, jobs, analysis cache, defaults, and dirty-state snapshots.
- Define adapter interfaces for file access, image decode/encode, job execution, preferences, diagnostics, and timing.

## Important Files

- `src/state.ts`: serializable engine state types.
- `src/commands.ts`: command and event types.
- `src/store.ts`: minimal store and reducer entrypoint.
- `src/adapters.ts`: app-provided capability interfaces.
- `src/defaults.ts`: default fix settings.
- `src/jobModel.ts`: job lifecycle helpers.

## Development Notes

- Keep state serializable. Runtime image buffers should stay behind buffer references.
- Keep reducers deterministic and easy to test.
- Add commands when user intent needs to cross package boundaries. Keep UI-only details in `apps/web`.
- Keep image algorithms in `@pixelaid/core` and worker execution in `@pixelaid/worker`.
- Keep the engine's editor defaults explicit and serializable: eligible new/reset editor settings request guarded Robust, while low-level/core callers retain their omitted Classic compatibility behavior.

## Verification

Run engine tests after changing state, commands, reducers, defaults, jobs, adapters, or cache behavior:

```sh
npm run test -w @pixelaid/engine
```
