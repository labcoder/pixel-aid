# Robust Preview Phase 7 acceptance record

Phase 7 packages the frozen Step 6S reconstruction work as an opt-in product preview. Classic remains the default until Phase 8 supplies enough product evidence to reconsider that default.

## Candidate boundary

- Frozen algorithm baseline: `e32030b`
- Phase 7 implementation range: `7cdcb0b` through `acbd660`
- Branch: `pixel-bench`
- Distribution state: local only; nothing was pushed
- Detector ranking and safety thresholds: unchanged after the frozen baseline

## Acceptance matrix

| Area | Evidence | Result |
| --- | --- | --- |
| Default behavior | Omitted strategy, new settings, and onboarding samples resolve to Classic. | Pass |
| Single sprite | The first-party robot sample starts in Classic and completes at 102x144. Robust Preview is a first-class alternative. | Pass |
| Guarded fallback | Hero Cat requested Robust with a 128x128 exact canvas; the UI reported `Robust requested -> Classic used` with structured aspect/axis reason codes and retained the 128x128 package. | Pass |
| Single icon | Core eligibility tests admit single icons and exercise the shared release rule. | Pass |
| Full-canvas background | The 1440x810 background sample exposed Robust Preview, ran with a manual 240x135 native canvas, visibly fell back under Guarded safety, and retained a 240x135 exact output canvas. | Pass |
| Cropped background | Core eligibility tests reject a background when subject cropping is enabled. | Pass |
| Animation and sprite sheets | The real animation workflow exposes only sheet controls; the Robust selector is absent. Core tests reject non-single modes. | Pass |
| Other excluded asset types | Portrait, UI, tileset, tilemap, character-sheet, and icon-set paths remain outside the Phase 7 eligibility boundary through the shared core rule. | Pass |
| Reconstruction versus packaging | Web controls keep native reconstruction separate from canvas bounds, framing, scale, and anchor. Exact canvas dimensions remain authoritative after fallback. | Pass |
| Advanced safety | Guarded is selected by default after opting into Robust. Warn and Raw remain available only after expanding Advanced controls. | Pass |
| CLI | `--reconstruction-strategy classic|robust` is first-class; `--grid-strategy` remains compatible; conflicts fail clearly; fallback warnings print in human output. | Pass |
| MCP and HTTP | Strategy, safety, and structured warnings survive the public option and job envelopes. | Pass |
| Desktop | Desktop consumes the same tested web editor controls; its environment check passes. | Pass |
| Responsiveness | Processing remains worker-backed. Manual browser runs reported zero long tasks for the accepted sprite and background paths. | Pass |

## Automated validation

The Phase 7 candidate passed:

- `npm test`: 1,544 passed, 1 skipped;
- `npm run typecheck`;
- `npm run lint`;
- `npm run build`; and
- `npm run desktop:check`.

No pixel-processing hot loop or canvas renderer was changed in Phase 7. The work is eligibility, product plumbing, status presentation, automation exposure, onboarding initialization, tests, and documentation around the already-frozen algorithm.

## Known inherited release debt

- `npm run app-shell:check` exits successfully but warns that `App.tsx` is 11,394 lines against a warn-only budget of 9,800.
- `npm run bundle:budget` still fails the existing aggregate JavaScript budget: approximately 356.9 KiB gzip against 253.9 KiB. Phase 7 added roughly 0.25 KiB gzip to the main web bundle after its onboarding correction; the approximately 103 KiB total overage predates this preview packaging work.

These items are recorded as release debt, not treated as evidence for promoting Robust. They should be addressed independently and must not be used to loosen the Phase 8 quality bar.

## Phase 7 verdict

Robust Preview is acceptable for an opt-in local release candidate with Guarded safety. Classic remains the product default. Phase 8 must gather real user review, fallback frequency, asset-class results, and cross-surface output evidence before any default change is proposed.
