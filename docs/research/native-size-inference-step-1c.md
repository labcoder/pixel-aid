# Native-size inference: Step 1C implementation

Status: opt-in core implementation complete on local branch `pixel-bench`

Step 1C adds a robust native-size detector behind an explicit core strategy. It does not change PixelAid's default detector, CLI, web editor, asset classification, background removal, sheet handling, palette behavior, or cleanup defaults.

## Public boundary

The strategy is additive:

```ts
type GridAutoStrategy = "classic" | "robust";
```

Direct detection can request it with:

```ts
detectGridCandidates(image, {
  strategy: "robust",
  maxScale: 32,
  cropToBounds: false
});
```

An eligible core fix can request it with:

```ts
fixImage(image, {
  mode: "single",
  assetType: "sprite",
  maxColors: 32,
  grid: {
    detect: "auto",
    autoStrategy: "robust"
  },
  downscale: "adaptive",
  alpha: "preserve",
  cleanup: {
    removeOrphans: false,
    jaggyCleanup: false,
    preserveSinglePixelDetails: true
  }
});
```

Omitting `autoStrategy` is identical to selecting `classic`. Robust fix routing is limited to explicit single-image `sprite` and `icon` inputs. Excluded asset types fall back to classic detection and retain a diagnostic note. Manual grids, explicit target dimensions, and runtime-supplied candidates continue to win.

## Implementation

The implementation is split into deterministic core stages:

1. Build typed-array X/Y transition, curvature, and quantized color-run evidence.
2. Enumerate independent floating-point period and cell-count hypotheses for each axis.
3. Score boundary coverage, density, active-boundary ratio, run agreement, and fundamental run support.
4. Estimate whether exact run evidence is trustworthy so hard nearest-neighbor blocks and softened boundaries use appropriate evidence weights.
5. Arbitrate divisor harmonics without promoting a coarse period whose reliable run evidence supports a finer fundamental.
6. Pair X/Y hypotheses, allowing non-square scales while using matching periods and conventional canvas sizes only as weak priors.
7. Return at most five candidates with bounded serializable diagnostics and calibrated low/medium/high confidence.

The detector reads the existing crop policy but does not invent a new cleanup decision. It never mutates the source and does not allocate objects inside its pixel loops.

## Acceptance results

All six Step 1B target classes now recover their authored native dimensions through `robust`:

| Class | Result |
| --- | --- |
| Clean harmonic ambiguity | Exact |
| Fractional nearest-neighbor scale | Exact |
| Independent non-square axes | Exact |
| Bilinear softening and blur | Exact |
| Local grid drift | Exact |
| Combined fractional scale, blur, drift, and noise | Exact |

An additional nonstandard-size matrix avoids validating only common 16/24/32-style dimensions. Five cases recover exactly: odd integer scale, fractional scale, non-square scale, softened scale, and local drift. A deliberately stronger combined distortion is not treated as an exact success: its top candidates remain ambiguous, and the contract requires low confidence plus a small candidate margin. That limitation is kept visible instead of tuning a common-size prior until the fixture passes.

Compatibility tests confirm:

- Omitted and explicit `classic` strategies return identical candidates.
- Manual grids, explicit target dimensions, and runtime candidates remain authoritative.
- Robust routing is restricted to eligible single-image sprite/icon fixes.
- Existing sprite classification/background cleanup, presentation-sheet preservation, and tileset preservation gates remain unchanged.
- Candidate output and diagnostics are deterministic and bounded.

## Performance

`fixtureSuite.bench.ts` includes two robust benchmarks:

- The six-image native-size acceptance matrix.
- Sampled robust detection on the existing 0.92 MP fake-pixel fixture.

The local Step 1C verification measured roughly 21 ms mean for the six small images together and 150 ms mean for the 0.92 MP sampled detector. These are development-machine measurements, not release promises; the committed benchmark cases are the durable comparison surface.

## Known limits

- Severe combinations of blur, noise, drift, and weak structural boundaries can remain underdetermined.
- Confidence is not proof of the authored source size; benchmark analysis must still inspect exact-size rates, relative error, and candidate margins.
- Robust inference estimates the global grid. `grid.localCorrection` remains the separate opt-in reconstruction refinement for individual boundary drift.
- Sheets and tiles need frame-aware inference and preservation rules before they can safely use this strategy.
- No CLI or editor control is exposed in Step 1C.

## Next decision

Step 1D should let only the local pixel-bench adapter select `robust`, rerun the unchanged 20-image development corpus, and add a genuinely held-out source set. The result should be compared with the Step 1A baseline by exact size, within-one-cell size, relative size error, confidence calibration, and downstream pixel metrics on exact-size outputs.

Any CLI/editor exposure or default change remains a separate approval after those results.
