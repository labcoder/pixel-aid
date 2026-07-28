# Native-size inference: Step 1B design

Status: design and regression coverage complete on local branch `pixel-bench`

This step does not change PixelAid's detector, fixer, CLI, web editor, asset classification, background removal, or defaults. It turns the Step 1A findings into deterministic core fixtures, explicit compatibility gates, and a guarded implementation design.

## Decision

The native-size work should become an opt-in core capability before it becomes a product default.

The proposed public control for a later implementation is:

```ts
type GridAutoStrategy = "classic" | "robust";

type FixOptions = {
  // Existing fields omitted.
  grid: {
    detect: "auto" | "manual";
    autoStrategy?: GridAutoStrategy;
  };
};
```

`classic` remains the default. The exact field name is a proposal, not an API added by Step 1B. A future implementation task must review the name and public type before coding.

This split is deliberate:

- `classic` preserves every current product workflow and output by default.
- `robust` may change automatic native dimensions, per-axis scale, phase, confidence, and reconstruction sampling only when explicitly selected.
- Manual target size, scale, phase, crop, and padding controls remain authoritative under either strategy.
- Alpha mode, background detection, asset type, sheet layout, palette choices, and cleanup choices remain outside the robust detector's authority.

## Why this is needed

The deterministic Step 1A pilot used 20 native sources, 6 distortion categories, and 120 distorted inputs. PixelAid core recovered the exact native size for 0.8% of inputs and landed within one cell for 10.0%. Retro Pixel Art Fixer recovered 64.2% exactly and 74.2% within one cell.

The pilot identifies native-size inference as the first blocker:

1. Divisor harmonics can outrank the real block period.
2. Fractional and softened grids fall toward small integer scales.
3. X and Y are forced to share one integer scale.
4. Local drift can create off-by-one native dimensions.
5. Crop and asset classification can compound a scale error.
6. High confidence is sometimes assigned to the wrong candidate.

Palette and cleanup tuning should wait until native size is correct. A reconstruction with the wrong number of cells cannot be rescued by better color reduction.

## Step 1B executable evidence

`@pixelaid/fixtures` now generates six small, deterministic pseudo-pixel sources from authored native sprites:

| Fixture | Failure class | Expected capability |
| --- | --- | --- |
| `harmonic-clean-nearest` | Harmonic ambiguity | Choose the fundamental 8x period instead of a 4x divisor |
| `fractional-nearest` | Fractional scale | Recover native dimensions from alternating source block widths |
| `non-square-nearest` | Independent axes | Infer different horizontal and vertical scales |
| `soft-bilinear` | Softened boundaries | Find the cell period without requiring hard nearest-neighbor edges |
| `row-local-drift` | Local drift | Integrate changing local spacing into the correct global cell count |
| `combined-soft-drift-noise` | Combined damage | Remain stable when several general distortions coexist |

The source art and distortions are procedural, deterministic, dependency-free, and small enough for normal unit tests. They are not copied from Retro, pixel-bench, or the Step 1A corpus.

The current detector misses all six intended native-size assertions. They are encoded as Vitest expected failures. That is an honest red test contract: a future robust implementation must route the table through its explicit strategy and convert recovered rows into ordinary passing tests. An unexpected pass is also reported, preventing stale failure declarations.

Three passing compatibility tests guard the product behavior that native-size work must not disturb:

- The hero-cat golden remains a single `sprite`, uses adaptive `backgroundFloodFill`, and produces the exact current cleaned alpha result.
- The presentation-sheet fixture remains an `animationSheet` on the `spriteSheet` preservation path with its current 2-by-6 layout.
- An explicitly selected `tileset` remains a `tileSheet`, preserves alpha, and does not enable single-sprite matte cleanup.

Existing core tests also continue to cover manual target dimensions, crop-to-bounds overrides, clean integer grids, background analysis, sprite sheets, tilemaps, palettes, and cleanup passes.

## Product behavior boundary

| Area | Step 1B | Later opt-in `robust` | Any future default change |
| --- | --- | --- | --- |
| Automatic native size | No change | May change | Separate approval |
| Independent fractional X/Y scale | No change | Enabled | Separate approval |
| Asset-type classification | No change | Must remain unchanged | Separate design |
| Background detection/removal | No change | Must remain unchanged | Separate design |
| Sheet/tile classification | No change | Excluded initially | Separate approval |
| Foreground crop | No change | Existing explicit setting wins | Separate approval |
| Manual target/scale/phase | No change | Always wins | No change intended |
| Palette and cleanup | No change | Existing settings only | Separate approval |
| CLI/web controls | No change | Explicit opt-in later | Separate approval |

The important distinction is that better grid inference is a core reconstruction feature, not permission to reinterpret the asset or run more destructive cleanup.

## Proposed processing order

The current guided suggestion flow uses grid evidence during classification. Replacing that evidence in place would create the exact regression risk we want to avoid. The first implementation should use two lanes:

1. **Compatibility lane.** Run the current classification, sheet analysis, background analysis, and cleanup recommendation unchanged.
2. **Reconstruction lane.** After asset type and mode are established, run robust grid inference only when it is explicitly requested and the input is eligible.
3. **Authority lane.** Apply manual target size, scale, phase, and crop overrides after automatic inference.
4. **Existing fix lane.** Feed the selected grid into the existing downsampling, palette, alpha, and cleanup pipeline without changing their options.

Initial robust eligibility:

- Direct core calls with an explicit single-image `sprite` or `icon` asset type.
- Guided single-image inputs already classified as `sprite` or `icon`.
- The pixel-bench adapter, which declares the task-level asset type as `sprite`, preserves alpha, and disables crop.

Initially excluded:

- `animationSheet`, `characterSheet`, `iconSet`, `tileset`, and `tilemap`.
- `background`, `portrait`, and `ui` classifications.
- Any manual grid.

Exclusion is a rollout guard, not a claim that robust inference can never help those assets. Sheets and tiles need frame-aware evidence and preservation rules before their defaults can safely change. If auto-classification selects an excluded type incorrectly, the user can still explicitly choose `sprite`; classification improvements remain their own workstream.

Background cleanup must not be moved into the detector. Robust inference may inspect alpha-aware edge or color-label views of whichever image the caller already supplies, but it must not choose alpha mode, mutate the source, flood-fill a matte, or change the classification result.

## Proposed robust detector

### 1. Build deterministic evidence views

Build a small set of typed-array views without changing the source:

- Alpha-aware luminance and color-transition strength.
- Coarsely quantized color labels used only for structural evidence.
- Horizontal and vertical edge profiles.
- Optional foreground mask supplied by the existing caller, never invented as a new cleanup decision.

Do not allocate objects per pixel. Reuse buffers inside one detection call. No new dependency is needed.

### 2. Infer each axis independently

For X and Y separately, generate candidate periods from several evidence channels:

- Distances between strong transition peaks.
- Color-run length distributions.
- Self-similarity or autocorrelation over a bounded period range.
- Windowed local period estimates for drifted images.

Candidate periods are floating-point values. `GridCandidate` already stores numeric `scaleX` and `scaleY`, so fractional scales do not require rounding at the API boundary.

### 3. Arbitrate harmonic families

Group candidates near `s / 2`, `s`, `2s`, and other plausible divisors or multiples. Score each interpretation using:

- Boundary energy at predicted cell boundaries.
- Low within-cell variation after accounting for softened edges.
- Agreement across run, edge, and self-similarity evidence.
- Stability across spatial windows.
- A penalty for over-segmentation that explains broad color blocks using tiny cells.
- A penalty for implausible output size only as weak prior evidence, never as the deciding signal.

A candidate must win on reconstructability, not merely on the number of periodic edges it can explain. This is the general fix for the clean 8x-to-4x harmonic failure.

### 4. Integrate local drift into cell count

Windowed estimates should distinguish a stable fractional grid from a slowly changing grid. Use a robust weighted aggregate for the global period, retain the dispersion as diagnostics, and derive native cell count from integrated boundary evidence rather than one rounded scale.

The existing `grid.localCorrection` remains a later sampling refinement. Robust inference estimates the correct global count and nominal scale; local correction may then adjust interior boundaries without changing the selected native dimensions.

### 5. Pair axes and estimate phase

Pair the strongest X and Y candidates and score them jointly. Square cells can receive a small tie-break preference only when independent evidence is otherwise equal. Strong non-square evidence must win.

Estimate phase after period selection. Report crop-relative and full-canvas phase clearly so disabling crop cannot silently change the native dimensions.

### 6. Calibrate confidence

Confidence should combine:

- Margin over the next non-harmonic candidate.
- Agreement between independent evidence channels.
- Spatial stability or explained drift.
- Pair consistency.

A fallback or scale-1 result should be capped at low confidence unless several channels independently support a native-resolution input. Diagnostics should expose the runner-up and the reasons for selecting one harmonic family over another.

## Result and diagnostics contract

The robust strategy should still return ranked `GridCandidate[]`. Additive diagnostics may include:

```ts
type RobustGridDiagnostics = {
  strategy: "robust";
  axisX: AxisPeriodDiagnostics;
  axisY: AxisPeriodDiagnostics;
  candidateMargin: number;
  detectorAgreement: number;
  harmonicDecision: string;
  fullCanvasCellCount: { columns: number; rows: number };
};
```

The exact diagnostic type belongs in the implementation plan. It must remain serializable, bounded in size, and useful in the editor's existing confidence display. Do not expose large edge profiles or per-pixel buffers.

## Acceptance gates for implementation

A later implementation is ready for an opt-in core release only when:

1. The six Step 1B target cases pass through `robust` as ordinary tests.
2. Existing clean integer-grid tests still pass through both `classic` and `robust`.
3. The hero-cat background-cleanup checksum and classification remain unchanged.
4. Presentation-sheet and tileset compatibility tests remain unchanged.
5. Explicit target size, per-axis scale, phase, crop, and manual-grid tests pass.
6. The full core test, typecheck, lint, and build suites pass.
7. Detection remains deterministic and stays within a separately measured performance budget.
8. The unchanged Step 1A pilot improves across all six distortion categories, not only one tuned case.
9. A held-out source set, not used to tune thresholds, confirms the improvement.

Benchmark reporting should prioritize exact size, within-one-cell size, relative size error, and grid alignment. Color and pixel metrics should be compared on exact-size results so over-segmentation cannot make a wrong-sized reconstruction look competitive.

The competitive objective is to exceed Retro's paired result on a held-out corpus with uncertainty reported, not merely to exceed one aggregate on the 20 development images. A merge should also require product regression gates; pixel-bench performance alone is not enough.

## Rollout

1. **Step 1B — complete here:** fixtures, expected-failure targets, compatibility tests, and design.
2. **Step 1C — separate approval:** implement the pure opt-in robust detector in `packages/core`; do not expose it in CLI or web defaults.
3. **Step 1D — separate approval:** let the local PixelAid pixel-bench adapter explicitly select `robust`, then rerun the unchanged development corpus and a held-out corpus.
4. **Step 1E — separate approval:** expose an advanced CLI/editor control if the core results and performance are good.
5. **Default decision — separate approval:** consider changing a preset or default only after broader real-asset testing, migration notes, and explicit product review.

This sequence lets PixelAid improve its automatic reconstruction without risking the broader feature set that already differentiates it: asset classification, matte removal, exact sizing controls, palettes, sheets, manifests, exporters, and automation surfaces.
