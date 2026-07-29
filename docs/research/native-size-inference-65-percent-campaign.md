# Native-size inference 65% campaign

## Status

Approved for continuous local work on the `pixel-bench` branch. Nothing in
this campaign may be pushed or merged to `main` without separate approval.

The campaign starts from the frozen Step 1M detector implementation at
`9a6b3aa`. Step 1N evaluated that implementation on 36 newly sourced CC0
assets:

| Entrant | Exact native size |
| --- | ---: |
| PixelAid Step 1K | 17/36 (47.2%) |
| PixelAid Step 1M | 19/36 (52.8%) |
| Retro Pixel Art Fixer | 29/36 (80.6%) |

Step 1M recovered two cases that Step 1K missed and introduced no exact-size
regressions on the sealed corpus. Its improvement over Step 1K was
statistically unresolved. Retro's lead over Step 1M was statistically
resolved.

## Success definition

The campaign succeeds only when a frozen PixelAid entrant recovers the exact
authored native size for at least 39 of 60 cases (65%) on a newly sourced,
untouched, preregistered corpus.

The final corpus must:

- contain 60 human-authored CC0 pixel-art assets;
- use at least 20 source packs that have not appeared in an earlier PixelAid
  development or sealed corpus;
- contain no prior selected asset or decoded-pixel identity;
- cap each source pack at three selected assets;
- balance the six pixel-bench distortion families at ten cases each;
- balance sprite/prop, environment/tile, and icon/UI roles at 20 cases each;
- freeze assets, transformations, entrants, metrics, and claims before any
  entrant runs; and
- run each entrant twice without comparative inspection between repeats.

Exact native-size recovery remains the primary endpoint. Within-one-cell,
relative dimension error, candidate recall, reconstruction quality,
determinism, and runtime are diagnostics and cannot be combined into a
replacement score.

## Development gate

Step 1N is revealed and therefore becomes a labeled development corpus. It may
be used to understand mechanisms and measure progress, but it cannot provide
the final unbiased 65% claim.

Before a new sealed attempt, the current development entrant must:

- reach at least 24/36 exact cases on Step 1N;
- retain every protected product-surface behavior;
- introduce no unexplained exact-to-miss regression across the historical
  native-size matrices;
- pass deterministic repeat checks;
- restore the 18-source robust matrix to its 125 ms advisory budget; and
- document proposer ablations for every accepted selection change.

If a sealed attempt misses 65%, it remains permanently frozen and labeled.
Its results may become development evidence, but that corpus cannot be
resealed. A later proof must use a new untouched corpus.

## Product boundary

Classic automatic grid detection remains the product default. Existing
explicit target sizes, manual grids, runtime-supplied candidates, asset
classification, background removal, alpha handling, palettes, cleanup,
sheet routing, exports, and source-image immutability remain authoritative.

Step 1O diagnostics do not change selection. Later experiments must remain
internal or opt-in until the sealed target is met. A public default, CLI, or UI
promotion requires a separate product decision after the campaign succeeds.

## No-benchmax rules

An experiment may be retained only when:

1. it addresses a named image-processing mechanism rather than a case ID;
2. it improves multiple independently varied fixtures or multiple real source
   packs;
3. an ablation proves which evidence caused the recovery;
4. it produces no unexplained protected regression;
5. it remains deterministic and bounded;
6. its hot loops avoid per-pixel object allocation; and
7. it stays inside the restored performance budget.

Failed experiments must be recorded and removed rather than accumulated into
the production detector.

## Continuous execution

One approval covers Steps 1O through 1R and repeated general-improvement
cycles. Work proceeds through semantic local commits without approval for each
fixture, experiment, download, or benchmark run.

The campaign pauses only for:

- a proposed classic/default or public product-surface change;
- a new dependency with material licensing or distribution implications;
- an upstream contribution, push, publication, or merge;
- destructive work outside the PixelAid and benchmark-lab scope; or
- evidence that reaching the target would require benchmark-specific behavior.

## Step sequence

1. **Step 1O:** add selection-invariant ranked-candidate diagnostics, classify
   proposal versus ranking failures, build mechanism-owned fixtures, and
   restore the robust performance budget.
2. **Step 1P:** run one guarded, ablatable general algorithm hypothesis at a
   time.
3. **Step 1Q:** repeat the development matrix until Step 1N reaches at least
   24/36 with all protected guards intact.
4. **Step 1R:** freeze the entrant and run the 60-case sealed proof. If the
   result is below 39/60, return to Step 1P using the revealed mechanisms and
   reserve a new corpus for the next proof.
