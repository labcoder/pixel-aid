# App Shell Migration Checklist

PixelAid's `apps/web/src/App.tsx` is still the main editor shell, but the optimization branch now has an engine package that can own orchestration rules. This checklist records what remains in the app shell, where it should move, and the safest migration order.

## Ownership Targets

| Area | Current owner | Target owner | Notes |
| --- | --- | --- | --- |
| Asset list identity, selection, deletion | `App.tsx`, `apps/web/src/lib/assets.ts` | `packages/engine` | Selection/delete transitions already route through engine helpers and dispatch. Continue by making engine state the source of truth for asset order and selection. |
| Source image buffers and preview surfaces | `App.tsx`, `previewSurfaceCache` | Web adapter plus renderer/canvas components | Engine should reference buffers by ID only. Browser image objects and canvas surfaces stay in web adapters. |
| Fix settings defaults | `apps/web/src/lib/editorPreferences.ts` | `packages/engine` | Output-affecting defaults now come from `createDefaultFixSettings()`. Web preferences still own UI-only defaults. |
| Per-asset session snapshots | `App.tsx` refs and document helpers | `packages/engine` for state, web adapter for document IO | Dirty-state snapshot logic is engine-owned. Document archive encode/decode can migrate later behind adapters. |
| Dirty-state comparison | `apps/web/src/lib/assetSessionDirty.ts` | `packages/engine` | Web file is now a compatibility re-export. |
| Worker job lifecycle | `App.tsx`, worker clients | `packages/engine` job model plus web worker adapters | Fix/source/quality jobs now emit engine job records. Persistent workers come in milestone 3. |
| Import decoding and thumbnail preparation | `App.tsx`, `imageDecode.ts`, preview cache | Web adapter now, worker/offscreen adapter later | Keep browser decode details out of engine. Move expensive prep off main thread in milestone 4. |
| Auto Suggest orchestration | `App.tsx`, `fixSuggestions.ts`, core detectors | Engine job orchestration plus worker adapter | Current logic still runs from the app shell. Move scheduling/caching before changing algorithms. |
| Quality report scheduling and caching | `App.tsx`, `assetAnalysisCache.ts` | Engine job orchestration plus web adapter | Cache keys can stay pure helpers; scheduling belongs outside React render/effects. |
| Frame layout editing and history | `App.tsx`, frame/sheet libs | `packages/engine` for commands/state, renderer components for gestures | Keep canvas pointer math in renderer components; move state transitions to engine. |
| Timeline playback and selection | `App.tsx`, timeline libs | Engine for timeline state, React component for playback controls | Playback animation loops should avoid engine churn per frame. Use engine for committed state only. |
| Export bundle creation | `App.tsx`, exporters package, web download helpers | `packages/exporters` plus engine command adapter | Engine should orchestrate export commands; file download remains web/desktop adapter work. |
| Preferences storage | `editorPreferences.ts` | Web adapter implementing engine preferences interface | Engine defines shape; web owns localStorage/Tauri persistence. |
| Editor layout state | `App.tsx`, panel libs | React component state | UI-only toggles can stay in React unless needed for documents/presets. |
| Viewport drawing and canvas caches | canvas components and web libs | Renderer/canvas components | Do not move canvas or DOM objects into engine. |

## Safe Migration Order

1. Keep engine type and adapter contracts stable.
2. Move pure state constructors and reducers before changing UI behavior.
3. Make one state domain at a time engine-owned, starting with asset selection/order, then dirty/session state, then job state.
4. Add compatibility wrappers in `apps/web/src/lib` while `App.tsx` is being reduced.
5. Replace direct `App.tsx` state writes with engine commands only after tests cover the existing behavior.
6. Extract UI panels after their state dependencies have a stable engine selector or minimal prop shape.
7. Move worker scheduling into engine adapters before milestone 3 changes worker lifecycle.
8. Move expensive import/analysis/render-prep scheduling after job ownership is stable.
9. Keep document serialization and export downloads in web adapters until engine commands can describe the operation without browser objects.
10. Add guardrails so new orchestration code goes to engine or adapters, not back into `App.tsx`.

## Candidate Follow-Up Slices

- Asset browser shell: own asset list rendering, menu state, deletion prompts, and selection dispatch.
- Inspector shell: receive selected asset/settings state and dispatch fix-setting commands.
- Timeline shell: own playback controls, frame selection display, and timeline-specific command dispatch.
- Metrics/log shell: consume engine diagnostics/job snapshots and editor performance reports.
- Export shell: collect export options and dispatch export commands through an adapter.

Each slice should keep image buffers out of React props where possible. Prefer asset IDs, frame IDs, cache keys, and selector-derived summaries over passing full `RGBAImage` objects through new component boundaries.
