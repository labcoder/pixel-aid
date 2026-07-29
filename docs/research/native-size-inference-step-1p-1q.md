# Native-size inference Steps 1P–1Q: guarded reranking

## Status

Implemented and frozen locally on the `pixel-bench` branch. Nothing from this
phase has been pushed.

The Step 1Q algorithm anchor is `f8bbade`. It reaches 25/36 exact native sizes
on the revealed Step 1N development corpus, passing the preregistered 24/36
gate. This is development evidence, not the final 65% claim.

## Product boundary

All changes remain inside explicit opt-in robust inference for eligible
single-image inputs. They do not change:

- classic detection or the omitted default;
- explicit output dimensions, manual grids, or supplied candidates;
- asset classification, sheet and tile routing, or background removal;
- alpha, palette, cleanup, and export behavior; or
- CLI and editor defaults.

The three new decisions are bounded rerankers over candidates and provisional
reconstruction evidence already computed by robust inference. They do not add
network calls, dependencies, model training, or benchmark identities.

## Cycle 1: multi-proposer consensus

The Step 1O diagnosis showed that 11 of 17 misses already had the exact
authored pair in the maximum-nine scoring set. The first cycle allows one
scored pair to challenge the established selection when:

1. integrated evidence and at least two independent proposer groups agree on
   both axes;
2. consensus support clearly exceeds the incumbent;
3. both source periods remain safely resolved;
4. detector and per-axis boundary support stay within fixed tolerances; and
5. cached reconstruction evidence remains within a conservative tolerance.

It improved two independently varied PixelAid-owned fixtures and changed no
other case in that 20-case matrix. Its direct ablation proves both recoveries.

On Step 1N development it improved:

- blur: `17x18` to `18x18`;
- chroma noise: `16x8` to `16x16`; and
- WebP: `17x8` to `16x16`.

The result moved from 19/36 to 22/36 with no exact-to-miss regression.

## Cycle 2: adjacent period coherence

One-cell boundary errors often preserved multiple candidate counts but chose
the count that made horizontal and vertical source periods disagree. The
second cycle considers only a one-cell neighbor already in the scoring set.
It requires:

1. a near-coherent candidate period pair;
2. either stronger independent support or equally strong multi-proposer
   support with a larger coherence gain;
3. minimum source periods;
4. bounded detector, boundary, and reconstruction deltas; and
5. no forced isotropy on protected anisotropic controls.

It recovered all three owned one-cell fixtures while preserving two
intentionally anisotropic controls and a fractional small-icon control.

On Step 1N it corrected the WebP `16x17` output to `16x16`. The cumulative
result reached 23/36 with no regression.

## Cycle 3: harmonic-axis period coherence

The remaining aspect-collapse class included outputs where exactly one axis
was halved even though a phase-corroborated doubled-axis candidate restored a
shared source period. The third cycle considers only that exact 2:1
relationship and requires:

1. the challenger to double exactly one incumbent cell count;
2. phase-spectrum corroboration on both axes;
3. a large period-coherence gain to a high-coherence pair;
4. minimum support and source periods; and
5. bounded detector, boundary, and reconstruction deltas.

It recovered two separately authored PixelAid fixtures and preserved wide,
tall, and crisp controls. On Step 1N it recovered:

- grid soften: `16x32` to `32x32`; and
- chroma noise: `8x16` to `16x16`.

The cumulative result reached 25/36. The harmonic-only ablation reproduces
the prior 23/36 entrant on all 36 cases.

## Attribution and development result

| Entrant | Exact native size | Change |
| --- | ---: | ---: |
| Frozen Step 1M | 19/36 | — |
| Multi-proposer consensus | 22/36 | +3 |
| Adjacent period coherence | 23/36 | +1 |
| Harmonic-axis period coherence | 25/36 | +2 |

There are no exact-to-miss regressions between these entrants. Ablating all
three rerankers reproduces the frozen Step 1M output size on 36/36 cases.

The final per-distortion development result is:

| Distortion | Exact |
| --- | ---: |
| Blur | 4/6 |
| Chroma noise | 4/6 |
| Fractional | 3/6 |
| Grid soften | 4/6 |
| Soft bilinear | 5/6 |
| WebP | 5/6 |

## Performance

The final 18-source historical robust matrix measured 122.61–124.72 ms over
three single-worker runs:

| Benchmark | Current range | Advisory budget | Result |
| --- | ---: | ---: | --- |
| Historical robust matrix, 18 sources | 122.61–124.72 ms | 125 ms | Pass |

The rerankers reuse the existing bounded scoring set and cached provisional
reconstruction scores. Candidate scans are bounded loops with no per-pixel
object allocation.

## Step 1R boundary

Step 1N is revealed and cannot support the final success claim. Step 1R must
freeze `f8bbade` as its PixelAid entrant and evaluate it on a newly sourced,
preregistered 60-case CC0 corpus with at least 20 previously unused packs.

Success requires at least 39/60 exact native sizes. If the sealed result is
below 39, that result remains frozen and the campaign returns to owned
mechanism work before sourcing another untouched proof corpus.
