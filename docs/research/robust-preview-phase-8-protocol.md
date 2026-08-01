# Robust Preview Phase 8 evidence protocol

Phase 8 measures whether real users benefit from PixelAid's opt-in Robust Preview. It is an evidence campaign, not an algorithm-tuning phase. Classic remains the default for the entire campaign.

## Preregistration

- Campaign ID: `robust-preview-0.2.0-phase8-v1`
- Candidate version: PixelAid `0.2.0`
- Frozen output baseline: `f125d8f`
- Eligible workflows: single sprites, single icons, and backgrounds reconstructed as a full canvas
- Ineligible workflows: sprite/animation/character sheets, icon sets, tilesets, tilemaps, portraits, UI assets, cropped-background reconstruction, and manual-grid comparisons
- Primary unit of analysis: one unique eligible source asset reviewed by one participant
- Default product behavior: Classic
- Robust safety behavior: Guarded

The candidate hash fixes detector ranking, reconstruction behavior, and Guarded thresholds before the first real-user response. Evidence-capture, documentation, and packaging changes may follow without changing pixels. Any output-affecting correction closes the current cohort and requires a new campaign ID; results from different candidate outputs must not be pooled.

## Comparison contract

Each review produces two candidates from the same decoded source image and the same serializable settings. The only intentional setting difference is:

- candidate Classic: `grid.autoStrategy = "classic"`;
- candidate Robust: `grid.autoStrategy = "robust"` and `grid.robustSafety = "guarded"`.

Palette, alpha/background treatment, outline processing, fringe cleanup, downscale method, native-size mode, output canvas, framing, scale, anchor, crop policy, and cleanup settings must be identical. Candidate placement is deterministic per review but hidden and balanced across the campaign. Strategy labels and diagnostics remain concealed until the participant records a judgment.

Guarded fallback is not represented as a second visual result when its output is byte-identical to Classic. The review instead records an identical-output/fallback outcome and asks whether the safe fallback was acceptable.

## Human review fields

The required judgment is:

- preference: candidate A, candidate B, tie, or both failed;
- native geometry: pass, fail, or unsure;
- severity: none, minor, major, or blocking;
- manual override: not needed, helpful, or required; and
- optional failure classes and notes.

After submission, the interface may reveal which candidate was Classic or Robust and show the requested/selected strategy and Guarded reason codes.

## Evidence captured

Every record includes:

- campaign/schema version and a locally generated participant ID;
- PixelAid version, platform, surface, and timestamp;
- source SHA-256, dimensions, asset type, and sharing permission;
- sanitized settings plus a settings hash;
- Classic and Robust output dimensions, output SHA-256, duration, palette count, grid confidence, reconstructed/native canvas dimensions, and packaging dimensions;
- Robust requested/selected strategy, safety decision, reason codes, and candidate summaries;
- concealed A/B assignment and human review fields; and
- validation notes or exclusion reason.

Source bytes, filenames, paths, prompts, API keys, and free-form private metadata are excluded by default. Review notes are sanitized and length-limited. Source assets may accompany a report only through a separate explicit permission choice.

## Privacy and storage

- Evidence export is a deliberate local action; no automatic network submission is added by Phase 8.
- `public`: the participant permits publishing the asset and using it as a regression fixture.
- `private-debug`: PixelAid may inspect the asset privately but may not publish or commit it.
- `metrics-only`: only the sanitized evidence record may be retained.
- `none`: do not retain the review outside the participant's machine.

Real-user records and source assets never enter the PixelAid repository. The campaign owner stores returned bundles outside Git under `C:\dev\Mighty\pixel-aid-phase8-evidence`. Only audited aggregate results may later be added to `docs/research`.

## Internal dry run

Before distribution, run 20–30 permitted first-party or redistributable assets through the complete review/export/import path. The dry run verifies randomization, identity hashing, schema validation, sanitization, fallback representation, deduplication, aggregation, and cross-surface parity. Dry-run judgments are procedural and excluded from promotion statistics.

## Sealed real-user cohort

The first promotion-eligible cohort requires:

- at least 15 independent participants;
- at least 150 valid eligible reviews;
- at least 30 valid assets from each eligible class;
- no participant contributing more than 20% of weighted results;
- no source collection contributing more than 20% of weighted results; and
- duplicate source hashes collapsed within participant and reported across participants.

Assets are excluded before analysis when eligibility fails, the two candidates used different non-reconstruction settings, the record cannot be validated, consent forbids retention, or output-affecting candidate versions differ. `unsure` judgments remain visible but do not count as geometry passes or failures.

## Preregistered promotion gates

Phase 8 can recommend a later default-change proposal only when all gates pass:

1. Robust wins at least 65% of materially different, non-tied comparisons.
2. Robust-or-tie reaches at least 90% of valid reviews.
3. Native geometry passes at least 95% of valid determinate reviews.
4. Major or blocking crop/aspect regressions remain below 2%.
5. Exact-canvas and cross-surface decoded-output parity remain 100%.
6. Guarded fallback is rated appropriate at least 90% of the time.
7. Manual-override demand does not increase relative to Classic.
8. The Robust path stays within existing product performance budgets.
9. A second untouched cohort independently confirms the result.

Missing a gate means Robust remains opt-in. Failure classes may motivate a separately approved, general algorithm-improvement phase, but the current cohort is never used to tune and re-score the same candidate.

## Reporting

The analysis must report raw counts, weighted counts, ties, exclusions, missing fields, per-asset-class results, fallback outcomes, manual-override rates, duration distributions, confidence intervals, participant/source concentration, and sensitivity to deduplication. It must also disclose that Robust Guarded can return Classic output.

Phase 8 itself cannot change the default. Any default change is a separate product decision after both sealed cohorts and explicit review.
