# Robust Preview Phase 8 internal dry run

The Phase 8 evidence pipeline passed its preregistered internal dry run on 24 deterministic, first-party synthetic fixtures. This was an instrumentation exercise only. Its procedural tie reviews, visual outputs, and geometry diagnostics are excluded from promotion statistics and do not support changing PixelAid's default from Classic.

## Run identity

- Campaign: `robust-preview-0.2.0-phase8-v1`
- Pixel-output baseline: `f125d8f`
- Frozen corpus and runner: `d22a9c2`
- Runner packaging correction: `34dcde1`
- Completed: `2026-08-02T00:54:58.274Z`
- Local evidence root: `C:\dev\Mighty\pixel-aid-phase8-evidence\dry-run-v1`
- Corpus: 24 first-party synthetic assets: 17 icons, 5 sprites, and 2 backgrounds

The first launch stopped while importing the temporary runner bundle, before the output root was created or any fixture was processed. Commit `34dcde1` changed only that temporary bundle from ESM to CommonJS so the existing PNG dependency could load. The untouched run then executed once against the same frozen candidate behavior and corpus.

## Instrumentation result

| Check | Result |
| --- | ---: |
| Imported records valid against the shared schema | 24 / 24 |
| Records free of forbidden private metadata fields | 24 / 24 |
| Unique decoded source hashes | 24 / 24 |
| Unique assignment tokens | 24 / 24 |
| Candidate A placement | 12 Classic / 12 Robust |
| Decoded source hashes matching records | 24 / 24 |
| Decoded candidate hashes matching records | 48 / 48 |
| Duplicate source groups | 0 |
| Complete source / Classic / Robust / evidence packets | 24 / 24 |

The dry run also exercised Guarded fallback representation, deduplication, per-class and per-collection aggregation, and generation of a local visual report. Cross-surface decoded-output hashing uses the same shared byte contract already covered by the web, CLI, and automation parity tests; the 48/48 result above specifically verifies PNG export/import parity for this run.

## Descriptive diagnostics

These counts diagnose the frozen synthetic corpus; they are not human quality judgments and are not promotion-gate scores.

| Diagnostic | Classic | Robust Guarded |
| --- | ---: | ---: |
| Expected native geometry exact | 1 / 24 | 10 / 24 |
| Median processing time | 4.58 ms | 11.55 ms |
| p95 processing time | 83.41 ms | 253.48 ms |
| Maximum processing time | 93.48 ms | 259.18 ms |

Robust selected its own candidate on 17 assets and selected the Classic fallback on 7. Eight candidate pairs were identical. Exact Robust geometry occurred on 8 of 17 icon fixtures and 2 of 5 sprite fixtures; neither of the two background fixtures matched the synthetic expected native dimensions, and both safely fell back to Classic with identical output.

Observed Guarded reason-code counts were:

- `robust-selected`: 17
- `weak-axis-evidence`: 7
- `classic-aspect-disagreement`: 5
- `lower-confidence-than-classic`: 5
- `severe-anisotropy`: 5
- `moderate-anisotropy`: 2
- `moderate-classic-aspect-disagreement`: 2
- `preserved-ambiguity`: 2

## Interpretation and limits

- The run confirms that the beta evidence workflow is operational and locally reviewable.
- It does not validate preference, outline quality, palette quality, alpha/fringe quality, manual-override demand, or fallback appropriateness with real users.
- The fixture collection is intentionally synthetic and overrepresents known native-size mechanisms. Geometry counts must not be treated as an unbiased benchmark or reused as Phase 8 cohort evidence.
- No detector thresholds, processing options, outputs, or defaults were changed in response to these results.
- Classic remains the default and Robust remains an opt-in preview.

The next eligible action is distribution of the already-built local beta kit to the sealed real-user cohort under the preregistered protocol. Returned records and source assets stay outside Git; only an audited aggregate may be committed later.
