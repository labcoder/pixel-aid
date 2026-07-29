# Native-size inference Step 1K: boundary and phase consensus

## Status

Implemented and frozen on the local `pixel-bench` branch. Nothing from this
phase has been pushed.

Step 1K adds PixelAid-owned regression fixtures, an independent
phase-spectrum proposer, adjacent-count boundary arbitration, and guarded
phase/boundary consensus behind the existing opt-in robust strategy. Classic
detection remains the default.

The implementation does not change asset classification, background removal,
manual target sizes, palettes, cleanup behavior, sheet routing, or automation
defaults.

## Clean implementation boundary

- The nine Step 1K fixtures are deterministic, first-party TypeScript art.
- They abstract three general mechanisms: adjacent-count ambiguity, sparse
  harmonic collapse, and anisotropic/weak-axis collapse.
- No Step 1J image, competitor output, Retro source expression, control flow,
  constant, test, or comment is present in PixelAid.
- Retro remains outside PixelAid's dependency graph.
- The Step 1J corpus and results were not reopened during implementation.

## Frozen pre-change characterization

The Step 1J implementation selected the authored native size in three of the
nine Step 1K cases.

| Mechanism | Cases | Exact before Step 1K |
| --- | ---: | ---: |
| Adjacent count | 3 | 1 |
| Sparse harmonic | 3 | 1 |
| Anisotropic collapse | 3 | 1 |
| **Total** | **9** | **3** |

The full pre-change selections and top-five alternatives remain recorded in
`packages/core/src/step1kCharacterization.test.ts`. Passing controls are live
non-regression tests rather than baselines that preserve an incorrect result.

## Algorithm changes

### Phase-spectrum candidate proposer

Each axis now has a third independent proposal path. It measures Fourier phase
concentration in PixelAid's transition and curvature profiles. A clipped-energy
variant prevents a few strong silhouette edges from drowning out repeated weak
cell boundaries.

The calculation uses a trigonometric recurrence, so each candidate frequency
requires two trigonometric calls instead of two calls per source position.
Phase-spectrum proposals broaden the bounded candidate union but cannot switch
the selected grid on spectral strength alone.

### Adjacent-count final decision

When two independently proposed candidates differ by one row or column, the
final decision can prefer the neighboring count only when:

1. both counts have strong independent proposal scores;
2. the preferred axis has a clear local boundary-evidence advantage;
3. the proposal-score loss stays within a fixed tolerance; and
4. a full reconstruction pass is not materially worse.

This resolves the two authored off-by-one failures without introducing a
general larger-grid preference.

### Guarded phase and boundary consensus

A phase candidate can switch the result only when:

1. both axes have strong phase-spectrum proposals;
2. both source-cell periods remain above the existing independent-resolution
   floor;
3. both axes retain minimum boundary coverage;
4. the candidate preserves local boundary support or adds substantial
   independent support;
5. the incumbent is not already strongly corroborated by multiple independent
   proposers; and
6. a full reconstruction pass remains within the fixed tolerance.

This keeps spectral harmonics diagnostic-only when stronger integrated and
independent evidence already supports the incumbent.

## Development ablation

| Slice | Frozen Step 1J implementation | Step 1K | Change |
| --- | ---: | ---: | ---: |
| Step 1K adjacent-count cases | 1/3 | 3/3 | +2 |
| Step 1K sparse-harmonic cases | 1/3 | 3/3 | +2 |
| Step 1K anisotropic cases | 1/3 | 2/3 | +1 |
| **Step 1K matrix** | **3/9** | **8/9** | **+5** |
| Original six | 6/6 | 6/6 | 0 |
| Step 1G twelve | 8/12 | 8/12 | 0 |
| **Historical 18** | **14/18** | **14/18** | **0** |

The remaining explicit failure is
`step1k-anisotropic-banner-48x20`. Its weak horizontal phase proposal is
surfaced in the candidate union, but it does not meet the evidence threshold
for an automatic switch. Lowering the global guard to make that one fixture
pass would be benchmark-specific and was rejected.

## Product boundaries

The following remain authoritative and are covered by the existing regression
suite:

- omitted or explicit `classic` auto strategy;
- explicit output width and height;
- manual grids and runtime-supplied candidates;
- single-image eligibility routing;
- sheet, character-sheet, tile-sheet, portrait, background, and UI fallbacks;
- background/alpha, palette, cleanup, and export behavior outside robust
  candidate selection; and
- deterministic, immutable source handling.

Robust inference remains opt-in. Step 1K does not expose a new CLI or editor
setting and does not make robust inference the product default.

## Performance

Local Vitest benchmark results on the development machine:

| Benchmark | Mean | Advisory budget |
| --- | ---: | ---: |
| Historical robust matrix, 18 sources | 121.62 ms | 125 ms |
| Step 1K regression matrix, 9 sources | 69.94 ms | diagnostic |
| 720p robust sampled grid detection | 113.82 ms | diagnostic |

The historical matrix remains inside its advisory budget. Compared with the
Step 1I record of 114.89 ms, Step 1K adds about 5.9% to this opt-in path.

## Verification

- Workspace typecheck passed.
- Workspace lint passed with zero warnings.
- Workspace build passed.
- Core suite passed with one worker: 56 files and 440 tests.
- All other workspace suites passed in the standard workspace run.
- The standard highly parallel core run pushed one existing 5-second atlas
  test slightly over its timeout; that file and the complete core suite passed
  when run without CPU contention.
- The original six, Step 1G, Step 1I, default/classic, manual control,
  classification, background-removal, palette, and cleanup gates passed.

## Step 1L freeze

Step 1K is now the entrant to freeze for Step 1L. Step 1L must:

1. record the exact PixelAid commit and unchanged local Retro entrant;
2. source a newly licensed real-art corpus with no identity overlap against
   Steps 1F or 1J;
3. preregister identities, distortions, metrics, and the no-tuning rule before
   materializing benchmark inputs;
4. seal corpus hashes and run deterministic duplicate evaluations; and
5. report the outcome honestly without changing PixelAid against Step 1L
   results.
