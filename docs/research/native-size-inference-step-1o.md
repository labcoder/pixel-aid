# Native-size inference Step 1O: campaign baseline

## Status

Completed locally on the `pixel-bench` branch. Nothing from this phase has
been pushed.

Step 1O turns the revealed Step 1N result into selection-invariant diagnostics,
PixelAid-owned mechanism fixtures, and a bounded development contract. It does
not change robust selection, classic/default behavior, the CLI, or the editor.

The diagnostic implementation anchor is `dbdf914`. The Step 1N post-seal
analysis is committed only in the local benchmark lab at `e21def1`.

## Sealed-result integrity

The research entry point executes the same robust detector as production and
copies rank and provenance data only after the detector has selected its
candidates. On all 36 frozen Step 1N inputs:

- the traced selection matched the frozen Step 1M output size;
- exact native-size recovery remained 19/36; and
- no sealed input, output, score, or conclusion was rewritten.

The diagnostic helper is not exported from the core package index and cannot
be selected through `FixOptions`, the CLI, or the editor.

## Candidate-recall result

The 17 Step 1M native-size misses were classified at the earliest stage where
the authored width/height combination was lost:

| Stage | Misses | Interpretation |
| --- | ---: | --- |
| Ranked top five | 3 | Correct pair survived but lost final rank |
| Scoring pair | 11 | Correct pair was scored but omitted from final ordering |
| Axis pair | 2 | Both correct axes existed but were not admitted together |
| Axis missing | 1 | One correct axis was never proposed |

Sixteen of 17 misses already contained both authored axes. Eleven contained
the exact authored pair in the bounded reconstruction-scoring set. Proposal
coverage is therefore a secondary problem; conservative pair admission and
selection are the first campaign target.

The misses span blur, chroma noise, fractional scaling, grid softening, soft
bilinear scaling, and WebP degradation. The result is not confined to one
distortion, role, source site, or asset pack.

## PixelAid-owned mechanism corpus

Step 1O adds 20 deterministic synthetic fixtures created from first-party
motifs and general degradation primitives:

| Mechanism | Cases |
| --- | ---: |
| Harmonic/sparse undersegmentation | 4 |
| Aspect-ratio collapse | 4 |
| One-cell boundary bias | 4 |
| General undersegmentation | 4 |
| Protected controls | 4 |

No fixture is derived from a benchmark image identity. The matrix covers
integer and fractional scaling, nearest and bilinear resampling, transparent
art, broad blur ramps, chroma noise, cell texture, ringing, low-frequency
color drift, local boundary warp, anisotropic periods, non-common dimensions,
and an intentionally ambiguous stable-incumbent control.

The unchanged Step 1M detector recovers 12/20 authored native sizes. The
expected pair stages are:

| Stage | Fixtures |
| --- | ---: |
| Selected | 12 |
| Ranked top five | 1 |
| Scoring pair | 2 |
| Axis pair | 4 |
| Axis missing | 1 |

Three crisp product controls are exact. The ambiguous control freezes its
existing conservative incumbent rather than pretending its authored size is
an automatic acceptance.

## Performance

No optimization was required after the measurement was repeated on the
current tree. Four single-worker Vitest runs of the 18-source historical
robust matrix measured 122.60–124.55 ms mean. The structured budget check
recorded 122.60 ms:

| Benchmark | Current | Advisory budget | Result |
| --- | ---: | ---: | --- |
| Historical robust matrix, 18 sources | 122.60 ms | 125 ms | Pass |

The earlier Step 1M record of 130.30–131.25 ms is retained in its original
report. The budget was not raised, and no output-changing shortcut was added.
Future campaign experiments must keep this matrix within the same ceiling.

## First Step 1P hypothesis

The first experiment will test a bounded multi-proposer consensus challenger.
It addresses the 11 scoring-pair losses without adding a new detector or
special-casing a benchmark family:

1. operate only on pairs already present in the maximum-nine scoring set;
2. require both axes to share integrated evidence plus corroboration from at
   least two independent evidence groups;
3. require a clear consensus advantage over the incumbent;
4. retain minimum source-period and per-axis boundary-support guards;
5. require provisional reconstruction to remain within a fixed conservative
   tolerance; and
6. admit at most one challenger to a final two-candidate comparison.

The experiment succeeds only if it improves multiple independently varied
Step 1O fixtures, has a direct proposer ablation, keeps all protected controls
and historical product-surface tests intact, stays deterministic, and remains
inside the 125 ms budget. Thresholds will be selected from the first-party
fixtures before checking the revealed Step 1N development score.

If the fixture experiment fails those conditions, it will be recorded and
removed rather than accumulated in robust inference.
