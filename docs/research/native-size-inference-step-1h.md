# Native-size inference Step 1H: comparative algorithm study

## Status

Complete on the local `pixel-bench` branch.

Step 1H studied the frozen Retro Diffusion Pixel Art Fixer at a high level,
compared its detection and reconstruction architecture with PixelAid, and
traced both implementations on the same 18 PixelAid-owned diagnostics. It did
not change PixelAid production code, defaults, CLI behavior, or public API.

The external lab, raw traces, visual report, and frozen competitor checkout are
local at:

```text
C:\dev\Mighty\pixel-aid-benchmark-lab\step1h
```

The phone-readable report is served from that lab rather than from the PixelAid
web application.

## Frozen scope

| Component | Frozen revision | Role |
|---|---|---|
| PixelAid | `cb547255c5819918e73bf8794e7e980bfaf7e0fe` | Robust detector and adaptive reconstruction under study |
| Retro Pixel Art Fixer | `ef376e57e1c272633ca2dbf5f29ec3fcf6596465` | Python reference detector and two-stage reconstruction |
| pixel-bench | `200deb9e61ece8685bda500fe906bb6bd8fe6d51` | Context only; Step 1H did not modify or submit to it |

The local lab records the source lock, repository state, licenses, commands,
and instrumentation schemas. Both entrants were run twice. After excluding
wall-clock timings and run identifiers, all diagnostic records and output
image hashes were identical across repeats.

## Clean-room-style boundary

This was a behavioral and algorithm-family study, not a port.

- Retro source remains outside the PixelAid repository.
- No Retro source expressions, comments, function bodies, control flow, tuned
  constants, fixtures, or tests were transferred.
- PixelAid does not depend on the Retro package.
- Candidate techniques are described as mathematical or product objectives
  that require independent PixelAid designs, names, thresholds, tests, and
  ablations.
- Retro's MIT license was recorded. Because Step 1H transferred no code and
  added no dependency, it did not require a PixelAid third-party notice change.

This boundary is an engineering policy for the study, not legal advice.

Primary references:

- [Retro Pixel Art Fixer repository](https://github.com/Retro-Diffusion/pixel-art-fixer)
- [Retro Pixel Art Fixer technical documentation](https://github.com/Retro-Diffusion/pixel-art-fixer/blob/main/docs/HOW_IT_WORKS.md)
- [Kopf, Shamir, and Peers, Content-Adaptive Image Downscaling](https://www.cs.wm.edu/~ppeers/showPublication.php?id=Kopf%3A2013%3ACID)

## Pipeline comparison

### PixelAid robust inference

1. Build alpha-aware per-axis transition, curvature, broad-ramp, and
   quantized-run evidence.
2. Enumerate plausible integer native sizes.
3. Score those sizes through a shared axis path, including blur evidence,
   harmonic arbitration, run support, and over-segmentation controls.
4. Pair retained horizontal and vertical hypotheses.
5. Reconstruct and score a small number of finalist pairs.
6. Keep the incumbent unless an alternative has materially stronger support.

The larger product pipeline then applies explicit target sizing, block-local
downsampling, alpha/background behavior, palette extraction or locking,
cleanup, sheet/tile handling, diagnostics, and export metadata.

### Retro Pixel Art Fixer

1. Let autocorrelation, coherent run spacing, and shift self-similarity propose
   periods independently.
2. Add fused boundary/phase evidence, within-cell variance contrast, and
   reconstruction distillability for difficult arbitration.
3. Pool candidates per axis and preserve harmonic alternatives.
4. Resolve consensus, per-axis choices, cross-axis consistency, phase, and
   local drift.
5. Reconstruct in two stages: choose a globally shared structural label for
   each output cell, then recover a color from original source pixels carrying
   that label.

### Central architectural difference

PixelAid already has many of the same signal *families*. Its weakness is not a
simple absence of edge, run, blur, harmonic, or reconstruction reasoning. The
important difference is decision topology:

- PixelAid's cues feed a mostly shared candidate enumeration and axis scoring
  path, so their errors can remain correlated.
- Only a small finalist set reaches PixelAid's reconstruction scorer.
- Retro has more independently proposing estimators and uses direct
  cell-coherence and reconstruction objectives over the candidate union before
  the final decision.

The dynamic trace supports that explanation.

## Identical-input diagnostic result

The corpus combined:

- the original six robust-acceptance fixtures; and
- the twelve Step 1G visual failure classes.

These are first-party synthetic diagnostics. They support mechanism
attribution, not a public leaderboard or overall product ranking.

| Slice | PixelAid exact | Retro exact | Both exact | PixelAid only | Retro only | Neither |
|---|---:|---:|---:|---:|---:|---:|
| Original six | 6/6 | 4/6 | 4 | 2 | 0 | 0 |
| Step 1G twelve | 5/12 | 7/12 | 3 | 2 | 4 | 3 |
| All 18 | 11/18 | 11/18 | 7 | 4 | 4 | 3 |

The aggregate is tied, but the overlap is small. On Step 1G:

- Retro-only exact: color field, WebP, chroma noise, and blur.
- PixelAid-only exact: native anti-aliasing and cell texture.
- Neither exact: bicubic ringing, mush/warp, and grid softening.
- Both exact: clean nearest-neighbor, cell gradient, and cell noise.

This complementarity is stronger evidence for architecture work than a single
aggregate number.

## Failure attribution

### PixelAid

PixelAid's seven Step 1G misses divide into:

- five axis-candidate-generation failures, where at least one authored axis was
  absent from the retained axis hypotheses;
- two pairing or pruning failures, where both authored axes survived but their
  exact pair did not; and
- zero cases where the exact pair reached the final list but merely lost the
  top rank.

Specific evidence:

- color field retains the authored X axis first but loses authored Y;
- WebP retains authored X only at rank 13 and loses authored Y;
- bicubic, mush/warp, and blur lose both authored axes;
- chroma noise retains the axes at ranks 13 and 9 but not their pair;
- grid softening retains the axes at ranks 13 and 14 but not their pair.

Improving only the existing final reranker cannot repair five of these seven
misses because the required candidate information has already been removed.

### Retro

Retro's seven misses across all 18 divide into:

- five consensus/arbitration failures where at least one independent estimator
  had already returned the exact pair; and
- two candidate-generation failures where no individual estimator returned the
  exact pair.

Individual exact-pair counts across the 18 cases were:

| Retro estimator | Exact pair |
|---|---:|
| Run spacing | 11/18 |
| Autocorrelation | 10/18 |
| Fused evidence | 9/18 |
| Distillability | 7/18 |
| Shift self-similarity | 5/18 |

This validates independent proposal diversity, but it also identifies a failure
mode PixelAid should avoid: correlated votes or a final scalar decision erasing
a credible exact minority hypothesis.

## Reconstruction with the grid held correct

For all twelve Step 1G cases, both implementations were also run at the authored
native dimensions. This separates reconstruction from detector behavior.

| Metric | PixelAid mean | Retro mean | Direction |
|---|---:|---:|---|
| Palette-label accuracy | 0.993280 | 0.998077 | Higher |
| Exact pixel match | 0.344389 | 0.358405 | Higher |
| Alpha-mask IoU | 0.998820 | 0.999643 | Higher |
| Mean absolute channel error | 2.724322 | 1.751911 | Lower |

Retro won exact-pixel match in seven cases, PixelAid won one, and four tied.
Retro won channel error in seven, PixelAid won three, and two tied. The result
supports an experiment with structure/color-separated reconstruction on
damaged inputs.

There is an important counter-result: on the three Step 1G cases where both
automatic detectors selected the exact size, PixelAid had higher mean
exact-pixel match and lower channel error. Those cases are mostly crisp or
contained-artifact controls. PixelAid's current block reconstruction remains a
strong path for clean inputs; the proposed technique should be a separate
robust reconstruction primitive rather than a replacement.

## Technique decisions

### Adopt as independently designed objectives

- Score within-cell coherence earlier, over a broader bounded candidate union.
- Score cheap downscale/reconstruct distillability before final pruning.
- Preserve harmonic candidate families until direct objectives separate them.
- Make arbitration aware of evidence independence and correlated signal
  families.
- Preserve credible minority hypotheses and report ambiguity.
- Record candidate provenance in diagnostics.

### Experiment and ablate

- an autonomous autocorrelation axis proposer;
- an autonomous run-spacing proposer derived from PixelAid's existing run
  evidence;
- shift self-similarity only if it adds unique held-out recall after the first
  two;
- alpha-aware structure labels followed by original-color recovery; and
- phase-free spectral/compression evidence only after a focused corpus proves
  unique value.

### Already covered and protected

- alpha-aware transitions and curvature;
- explicit broad-ramp and blur evidence;
- run evidence and harmonic reasoning;
- non-square grids;
- local correction and mixel handling;
- exact output dimensions and manual grid overrides;
- sprite, character-sheet, sprite-sheet, and tile-sheet behavior;
- background removal and alpha modes;
- palette extraction and locking;
- cleanup and export metadata.

### Reject

- copying Retro thresholds, constants, vote rules, control flow, tests, or
  fixtures;
- adding Retro as a dependency;
- treating “always choose the finer grid” as a product rule;
- overriding an explicit target or manual grid;
- changing the default/classic inference path during Step 1I; and
- tuning against a revealed sealed evaluation set.

## Extension beyond Retro: a candidate provenance graph

PixelAid can extend estimator diversity into a more product-aware architecture.
Represent every candidate axis as a node carrying:

- independent proposer families;
- correlated corroborating signals;
- harmonic parent and child relationships;
- phase and cell-coherence evidence;
- reconstruction evidence;
- source coverage and confidence limits;
- target and manual-control compatibility; and
- asset-context evidence.

The arbitration should not count transition and curvature cues as fully
independent when they arise from the same boundary field. Agreement between
run spacing and reconstruction fit should count more because their failure
mechanisms differ. When two harmonic families remain credible, retain both
until pair formation or report ambiguity instead of manufacturing confidence.

PixelAid can also use product context to resolve genuine ambiguities without
redefining the base image evidence:

- single sprites can protect silhouettes, outlines, and rare highlights;
- character and sprite sheets can favor shared frame size and stable animation
  geometry;
- tile sheets can score exact divisibility, repeated tile periods, and seam
  continuity;
- icon or asset batches can lock native size and palette across the set; and
- explicit targets remain authoritative.

## Step 1I implementation order

Step 1I should remain opt-in through `autoStrategy: "robust"`:

1. Add candidate provenance and diagnostic types without changing output.
2. Extract current run evidence behind an independently testable proposer
   interface.
3. Add a PixelAid-owned autocorrelation proposer.
4. Build a bounded candidate union that preserves harmonic families.
5. Move cheap cell-coherence scoring before final pruning.
6. Add cheap reconstruction/distillability scoring to ambiguous families.
7. Add independence-aware pair arbitration with minority preservation.
8. Add structure/color reconstruction as a separate opt-in experiment.
9. Run the full existing product regression matrix and performance budgets.
10. Freeze the winning algorithm before Step 1J.

Each new proposer must prove unique candidate recall in an ablation. A higher
score on a known fixture is insufficient.

## Product and regression gates

No Step 1I algorithm change is eligible unless it preserves:

- the Step 1G characterization baseline;
- all six original robust acceptances;
- classic/default detection;
- manual and exact target sizing;
- sprite, sheet, character-sheet, and tile-sheet behavior;
- background removal, alpha, palette, cleanup, and export behavior;
- determinism and source-image immutability; and
- current performance budgets or an explicitly reviewed replacement budget.

The default behavior stays unchanged until a newly sealed Step 1J corpus
demonstrates general improvement and the product-surface regression review is
clean.
