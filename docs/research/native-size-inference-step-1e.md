# Native-size inference: Step 1E implementation

Status: opt-in core implementation complete on local branch `pixel-bench`;
full pixel-bench rerun pending

Step 1E improves robust native-size inference for blurred and ambiguous
pseudo-pixel inputs. It does not change PixelAid's classic default, expose a new
CLI/editor switch, expand robust eligibility, or alter downstream product
features.

## Product boundary

The implementation remains behind:

```ts
grid: {
  detect: "auto",
  autoStrategy: "robust"
}
```

Only explicit single-image `sprite` and `icon` fixes are eligible. Omitted
strategy, explicit `classic`, excluded asset types, manual grids, explicit
target dimensions, and runtime-supplied candidates retain their previous
authority. Automation normalization continues to omit `autoStrategy`, so the
CLI and web product do not silently select robust inference.

Regression contracts compare output pixels and grid sampling for:

- omitted versus explicit classic;
- every excluded asset class;
- manual, target-size, and runtime-candidate overrides;
- identical supplied grids with background flood fill, palette reduction,
  halo removal, outline repair, morphology, and ordinary cleanup enabled.

The last contract is important: Step 1E may choose a better grid in opt-in
robust mode, but it does not rewrite PixelAid's classification, alpha, palette,
background-removal, outline, or cleanup algorithms.

## Failure diagnosis

The unchanged Step 1D development and prior-validation corpora were replayed
locally before implementation. Each miss was classified by whether the authored
size was absent from five candidates, present but ranked below the incumbent, or
selected exactly with low pixel-match quality.

Candidate absence dominated drift and kitchen-sink failures. Development
soft-bilinear failures often had the correct candidate at ranks 2–5, while
prior-validation soft-bilinear failures more often lacked one or both axes.
That evidence required both additional boundary evidence and reranking; either
mechanism alone was insufficient.

The replay scripts and per-case machine-readable record live outside this
repository under:

```text
C:\dev\Mighty\pixel-aid-benchmark-lab\step1e
```

## Blur-aware evidence

Robust evidence now detects broad transition ramps along each sampled row and
column:

1. Compute the existing alpha-aware adjacent-pixel transition strengths.
2. Find bounded contiguous runs above a line-relative threshold.
3. Reject one-pixel hard edges and implausibly broad/noisy runs.
4. Vote at each accepted ramp's energy-weighted center.
5. Measure how much transition energy belongs to broad ramps.

The ramp signal produces a parallel axis score. It does not replace the
ordinary transition/curvature score. Crisp inputs have zero ramp weight, and a
240-case replay verified that adding the evidence alone changed zero public
candidate lists.

## Provisional reconstruction scoring

Robust mode evaluates at most three hypotheses:

- the detector incumbent;
- the strongest ordinary alternative;
- on measurably softened inputs, the strongest distinct blur-supported
  alternative (otherwise the next ordinary candidate).

Each hypothesis uses bounded typed-array sampling to measure:

- within-cell compactness;
- cross-cell separation;
- blur-tolerant residual fit;
- the detector prior;
- a small over-segmentation/complexity penalty.

Temporary cell representatives exist only for scoring. They are never returned
as image output and never run through palette, alpha, background, halo, outline,
or morphology stages. Once a grid is selected, PixelAid uses the normal
block-aware reconstruction pipeline.

The alternative must lead the incumbent by at least `0.03`. A smaller lead is
reported as ambiguous, keeps the incumbent, and caps confidence at the low
boundary. Diagnostics contain at most three compact score summaries.

## Replay acceptance

The final diagnostic replay covered 120 development and 120 prior-validation
cases from the unchanged Step 1D corpora.

| Cohort | Previously exact retained | New exact selections | Known exact regressions |
| --- | ---: | ---: | ---: |
| Development | 48 / 48 | 16 | 0 |
| Prior validation | 53 / 53 | 3 | 0 |

Development gains were six soft-bilinear, seven non-square, one kitchen-sink,
one drift, and one clean-nearest case. Prior-validation gains were one
soft-bilinear, one non-square, and one fractional case.

These are detector replays against frozen ground-truth dimensions, not the
final public pixel-bench result. The unchanged benchmark must still be rerun to
measure reconstruction, color, placement, timing, and aggregate comparisons
with Pixel Art Fixer.

## Performance

The first implementation measured about 364 ms mean for the 0.92 MP robust
fixture and failed the agreed regression budget. Redundant transition and
curvature rescoring was removed, ramp offsets were scored independently, and
the robust boundary-offset search was reduced from quarter-pixel to half-pixel
steps after the two-corpus replay showed no selection loss.

Final local measurements on the development machine:

| Benchmark | Step 1C reference | Step 1E mean |
| --- | ---: | ---: |
| Six-fixture robust matrix | ~21 ms | 18.3 ms |
| 0.92 MP sampled robust detector | ~150 ms | 103.8 ms |
| Isolated three-hypothesis scorer | n/a | 2.1 ms |

These are local report-only measurements, not release promises. The committed
benchmarks are the durable comparison surface.

## Remaining limits

- Many kitchen-sink and drift cases still lack the authored axes entirely.
- Prior-validation soft-bilinear candidate generation remains substantially
  harder than development softening.
- Exact size does not guarantee ideal reconstruction colors or placement.
- The Step 1D prior-validation corpus is no longer a final holdout after this
  analysis. A genuinely fresh holdout is required after the algorithm freezes
  for any public competitive claim.
- Classic inference and robust product exposure remain separate decisions.
