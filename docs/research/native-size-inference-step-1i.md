# Native-size inference Step 1I: independent candidate experiments

## Status

Implemented on the local `pixel-bench` branch. Nothing from this phase has
been pushed.

Step 1I adds PixelAid-owned candidate provenance, autocorrelation and
run-spacing proposers, a bounded harmonic-aware candidate union, and
independence-aware arbitration behind the existing opt-in robust strategy.
Classic detection remains the default.

This phase did not implement structure/color-separated reconstruction, change
asset classification, alter background removal, expose robust inference
through automation defaults, or modify sheet/tile routing.

## Clean implementation boundary

The implementation uses standard mathematical objectives and PixelAid's own
image evidence and fixtures.

- No Retro source expression, control flow, constant, test, fixture, or comment
  was copied.
- Retro remains outside the PixelAid dependency graph.
- No dependency or third-party notice was added.
- The Step 1F sealed competitive corpus was not reopened or used for tuning.

## Candidate architecture

Each axis can now receive proposals from three separately identified paths:

| Proposer | Independence group | Main evidence |
|---|---|---|
| Integrated | `integrated-profile` | Boundary, curvature, quantized runs, blur ramps |
| Autocorrelation | `autocorrelation` | Periodic self-agreement of PixelAid axis profiles |
| Run spacing | `run-spacing` | Soft common spacing in PixelAid's quantized run histogram |

The per-axis union is deterministic and capped at 20 candidates. It keeps the
original integrated candidates, admits at most six candidates per independent
proposer, and retains proposal-declared harmonic parents when the cap allows.
Every returned grid candidate records axis proposals, ranks, evidence families,
pair proposers, independence support, and whether harmonic ambiguity survived.

## Arbitration guards

Independent evidence does not replace the established incumbent by a simple
vote. A challenger must satisfy all of these conditions:

1. The same independent proposer supports both axes.
2. The weaker axis proposal score is at least `0.65`.
3. Each proposed cell spans at least three source samples on both axes.
4. Cheap early cell evidence beats the incumbent by at least `0.04`.
5. A full-resolution confirmation pass preserves that `0.04` advantage.

Early scoring is capped at 12 hypotheses, 1,024 sampled cells per hypothesis,
and nine samples per cell. Only one best challenger per independent proposer
can reach the final confirmation, so the existing three-hypothesis full scorer
remains the upper bound.

The three-sample guard came directly from a regression found during
implementation: relative autocorrelation confidence can become misleading at
very small periods. Keeping those candidates diagnostic-only restored all
original robust acceptances.

## Development ablation

The ablation uses the six original native-size fixtures plus the twelve
PixelAid-owned Step 1G cases. It is a development diagnostic, not a public
leaderboard or a replacement for a newly sealed evaluation.

| Slice | Frozen pre-Step-1I | Step 1I | Change |
|---|---:|---:|---:|
| Original six | 6/6 | 6/6 | 0 |
| Step 1G twelve | 5/12 | 8/12 | +3 |
| All 18 | 11/18 | 14/18 | +3 |

New exact top-size passes:

- color-field tall character, recovered by run-spacing plus cell evidence;
- WebP terrain tile, recovered by autocorrelation plus cell evidence; and
- chroma-noise UI glyph, recovered by autocorrelation plus cell evidence.

Previously accepted native-AA, clean-nearest, cell-texture, cell-gradient, and
cell-noise cases remain accepted. The four explicit remaining failures are:

- bicubic micro-tile;
- mush/warp tall character;
- heavy-blur small prop; and
- grid-softened flat panel.

These failures remain named in `step1iAblation.test.ts`; they were not converted
into permissive expectations.

## Performance

On the development machine, the existing
`robust native-size acceptance matrix: 18 sources` benchmark measured:

| Revision | Mean | Advisory budget |
|---|---:|---:|
| Step 1G record | 84.74 ms | 125 ms |
| Step 1I local run | 114.89 ms | 125 ms |

Step 1I remains within budget but costs about 35% on this small-source matrix.
That cost is confined to explicit robust inference. It should be profiled again
before any product-default discussion.

## Product boundaries

The following remain authoritative and are covered by regression tests:

- omitted or explicit `classic` auto strategy;
- explicit output width and height;
- manual grids and runtime-supplied candidates;
- single-image eligibility routing;
- sheet, character-sheet, tile-sheet, portrait, background, and UI fallbacks;
- background/alpha, palette, cleanup, and export behavior outside robust
  candidate selection; and
- deterministic, immutable source handling.

## Next evaluation

Do not update public competitive claims from this development ablation alone.
Freeze this Step 1I algorithm, preregister a newly sourced untouched corpus,
and run the next sealed comparison without tuning against its results.
Structure/color-separated reconstruction remains a separate experiment for a
later approved phase.
