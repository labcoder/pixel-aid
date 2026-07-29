# Native-size inference Step 1M: centered blur-band evidence

## Status

Implemented and frozen locally on the `pixel-bench` branch. Nothing from this
phase has been pushed.

Step 1M adds PixelAid-owned low-evidence fixtures, proposer-provenance
ablations, and a centered blur-band proposer behind the existing opt-in robust
strategy. Classic detection remains the default.

The implementation anchor for the Step 1N entrant is `9a6b3aa`. Later
documentation-only commits do not change its output.

## Product boundary

Step 1M changes only automatic native-size selection when callers explicitly
choose `grid.strategy: "robust"` on eligible single-image inputs. It does not
change:

- omitted or explicit classic detection;
- manual grids, explicit output sizes, or runtime-supplied candidates;
- asset classification or sprite, character-sheet, tile-sheet, portrait,
  background, and UI routing;
- background removal, alpha handling, palette behavior, or cleanup settings;
  or
- editor and CLI defaults.

Dedicated product-surface tests freeze these boundaries, including source-image
immutability and downstream settings.

## PixelAid-owned development corpus

The deterministic 12-case corpus contains no competitor images or code:

| Failure family | Cases | Acceptance |
| --- | ---: | --- |
| Grid soften | 4 | Authored native size |
| Sparse low evidence | 3 | Authored native size |
| Weak axis | 3 | Authored native size |
| Ambiguity/control | 2 | Native size or frozen safe incumbent |

Eleven cases require the authored native size. The deliberately ambiguous
cross control requires the stable conservative `12x12` incumbent.

## Frozen pre-change result

Before the Step 1M algorithm change, robust inference selected the authored
native size in 7 of the 11 native-exact cases. The four failures were:

- softened `24x24` emblem, selected as `12x12`;
- softened `48x16` banner, selected as `24x16`;
- weak-axis `30x18` landscape, selected as `25x18`; and
- weak-axis `42x14` ribbon.

The exact candidates, top alternatives, proposer provenance, and decision
bases remain frozen in `step1mCharacterization.test.ts`.

## Algorithm change

### Centered blur-band proposer

The new independent proposer uses the centers of broad transition ramps rather
than treating the entire softened band as an exact boundary. It:

1. activates only when broad ramps account for at least 40% of transitions;
2. estimates a shared grid phase with a trigonometric recurrence;
3. evaluates only the estimated phase, two nearby offsets, and zero phase;
4. scores boundary coverage, density, and active-boundary ratio; and
5. contributes provenance as `blur-band-center`.

Phase calculations are cached and shared with the existing phase-spectrum
proposer. No image-processing hot loop allocates per-pixel objects.

### Conservative arbitration

A blur-band candidate can replace the incumbent only when:

1. both axes carry integrated and independent blur-band provenance;
2. joint blur-band support is at least `0.84`;
3. support exceeds the incumbent by at least `0.055`;
4. both periods remain at least `3.7` source pixels;
5. local boundary support stays within the fixed tolerance; and
6. full reconstruction evidence is no more than `0.03` worse.

The proposer contributes at most one early scoring alternative. The complete
early reconstruction set is capped at nine candidates.

## Development result and ablation

| Slice | Before Step 1M | Step 1M | Change |
| --- | ---: | ---: | ---: |
| Step 1M native-exact cases | 7/11 | 9/11 | +2 |
| Original six + Step 1G twelve | 14/18 | 15/18 | +1 |
| Step 1K matrix | 8/9 | 8/9 | 0 |

The two Step 1M recoveries attributable to blur-band consensus are:

- `step1m-grid-soften-emblem-24x24`; and
- `step1m-weak-axis-landscape-30x18`.

The same mechanism also recovers the older
`step1g-grid-soften-flat-panel` fixture. Disabling only the blur-band proposer
removes all three recoveries. Disabling it does not alter the low-ramp
ambiguity control.

The remaining authored failures are the `48x16` softened banner and `42x14`
weak-axis ribbon. Their expected axes do not have enough corroborated evidence
for a safe automatic switch. Threshold changes aimed only at those fixtures
were rejected.

## Performance

Local single-worker Vitest measurements after bounding and caching:

| Benchmark | Mean | Advisory budget | Result |
| --- | ---: | ---: | --- |
| Step 1M matrix, 12 sources | 88.82–92.77 ms | 100 ms | Pass |
| Historical robust matrix, 18 sources | 130.30–131.25 ms | 125 ms | Advisory miss |
| Step 1K matrix, 9 sources | 74.03 ms | Diagnostic | Recorded |
| 720p robust sampled detection | 118.28 ms | Diagnostic | Recorded |

The historical matrix is about 4–5% over its advisory ceiling and roughly
7.1% slower than the Step 1K record of 121.62 ms. This is confined to the
opt-in robust path. The budget was not moved to conceal the regression.

## Verification

- Core suite passed with one worker: 61 files and 493 tests.
- Workspace typecheck passed.
- Workspace lint passed with zero warnings.
- Workspace build passed.
- Step 1M targeted matrix passed: 41 tests across six files.
- Product-surface guards passed for classic/default behavior, explicit sizes,
  manual and supplied grids, classification/routing, background removal,
  palettes, cleanup, determinism, and source immutability.

## Step 1N freeze

Step 1N must treat `9a6b3aa` as a sealed PixelAid entrant and must not tune it
against the new results. The evaluation must:

1. register newly sourced real-asset identities and licenses before
   materializing inputs;
2. prove there is no identity overlap with Steps 1F, 1J, or 1L;
3. freeze transforms, metrics, tie rules, and the Retro revision;
4. compare the Step 1K entrant, Step 1M entrant, and Retro with deterministic
   repeats; and
5. publish failures and wins honestly in the local report.
