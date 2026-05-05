# Engineering Principles

This note defines the migration rules for engine-first PixelAid work. It is intentionally short enough to cite from issues, pull requests, and follow-up plans.

PixelAid should evolve toward this ownership chain:

```txt
React editor UI -> PixelAid engine runtime -> optimized TypeScript kernels -> optional Rust/C++/GPU accelerators
```

The goal is not to rewrite working behavior for its own sake. The goal is to keep the editor shippable while moving product orchestration out of React-only surfaces and into reusable runtime layers that can later serve the web app, desktop shell, CLI, local API, MCP server, and test harnesses.

## Core migration rule

New product behavior must not be added directly to `apps/web/src/App.tsx` unless the change is presentation-only. `App.tsx` may compose panels, pass serialized state into presentational components, wire browser events, and display runtime results. It should not become the owner of job orchestration, document rules, asset mutations, export planning, undo history, or image-processing decisions.

When a change requires product decisions or reusable workflow logic, prefer this path:

1. Define or reuse serializable contracts in `packages/shared` when more than one package needs the data shape.
2. Keep deterministic image algorithms and validation rules in `packages/core`.
3. Put worker protocols, cancellation, progress, and transfer boundaries in worker packages.
4. Put editor/product orchestration in the future `packages/engine` runtime once that package exists.
5. Keep React focused on presentation, user input, accessibility, and canvas host elements.

Until `packages/engine` exists, isolate new orchestration behind small modules that can be moved there later instead of growing `App.tsx`.

## Target ownership boundaries

| Concern | Target owner | Boundary rule |
| --- | --- | --- |
| Editor session state | `packages/engine` | Owns selected asset, active tool, panel-visible workflow state, current mode, and transient editor commands. React observes and renders it. |
| Asset state | `packages/engine`, with shared contracts in `packages/shared` | Owns imported asset records, generated variants, provenance, palettes, frame metadata, and operation settings. Source pixel buffers remain immutable unless a new asset variant is created. |
| Document serialization | `packages/engine` using `packages/shared` schemas | Owns save/load shape, versioning, migration, and validation for project documents and presets. React should call serializer APIs, not hand-roll document payloads. |
| Analysis jobs | Worker packages for execution; `packages/core` for deterministic analysis kernels; `packages/engine` for scheduling | Grid detection, palette analysis, sheet diagnostics, and classification run outside React orchestration. The engine schedules jobs and records results; workers define progress/cancellation boundaries. |
| Fix jobs | Worker packages for execution; `packages/core` for algorithms; `packages/engine` for job lifecycle | Pixel fixing, alpha cleanup, palette remapping, and frame-aware processing stay deterministic in core and run through worker boundaries when they may exceed a frame budget. |
| Export jobs | `packages/exporters` for manifests and target adapters; `packages/engine` for export planning; worker/automation packages for heavy packaging | Export metadata, frame rects, pivots, animation tags, padding, extrusion, and target warnings are produced by reusable packages, not one-off React handlers. |
| Canvas rendering state | React web panels own canvas elements; rendering helpers own draw state | Viewport zoom, pan, grid overlays, checkerboards, split views, and playback drawing stay in canvas-oriented modules/hooks. React must not render individual pixels or drive animation loops with high-frequency state updates. |
| Undo/redo history | `packages/engine` | Owns command history over serializable editor operations. React dispatches user intentions; it does not mutate multiple state slices ad hoc and then try to reconstruct history. |

## Acceptable changes

- Add a presentational toolbar, inspector row, or status badge in React that reads existing serialized state and dispatches an existing command.
- Add a canvas overlay renderer module that receives native image dimensions, viewport transform, and grid metadata, then draws with `imageSmoothingEnabled = false`.
- Add a pure helper in `packages/core` for palette scoring or grid candidate ranking with deterministic Vitest coverage.
- Add a worker message type that wraps a core algorithm with coarse progress and cancellation checks.
- Add an export adapter in `packages/exporters` that consumes existing frame and manifest contracts without reaching into React state.
- Add an interim web-side orchestration helper only when it has a narrow API and an obvious future home in `packages/engine`.

## Unacceptable changes

- Add a new fix, analysis, or export workflow directly inside `apps/web/src/App.tsx` because it is convenient to access local React state there.
- Store the only copy of source image data in mutable component state and destructively edit it during cleanup or export.
- Recompute grid candidates, palette extraction, frame slicing, or manifest validation during React render.
- Render sprite pixels, frame boxes, tile repeats, or animation playback as large sets of React DOM nodes.
- Add browser-only assumptions to deterministic core algorithms, such as `document`, `canvas`, `ImageBitmap`, timers, or network access.
- Bypass worker boundaries for operations that can exceed one animation frame on large sprites or sheets.
- Add undo/redo by snapshotting arbitrary React component state without serializable commands or document migrations.

## Pull request checklist for engine-first work

Before opening a PR that changes product behavior, answer these questions in the PR body:

1. Is this presentation-only? If not, why is the logic outside `App.tsx` or ready to move to `packages/engine`?
2. Which package owns the deterministic behavior, orchestration, execution boundary, and presentation?
3. Are state changes serializable and compatible with future document save/load and undo/redo?
4. Could the work block the main thread on a large sprite or sheet? If so, where is the worker/progress/cancellation boundary?
5. Does the change preserve pixel-perfect rendering and avoid React nodes for per-pixel or per-frame hot paths?
