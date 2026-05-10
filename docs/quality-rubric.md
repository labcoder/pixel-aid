# PixelAid Quality Rubric

This rubric gives PixelAid issues, reviews, fixtures, and golden tests a shared vocabulary for output quality. Use it before changing algorithms so defects can be described consistently and measured separately from subjective style preferences.

PixelAid quality has two broad categories:

- **Visual output quality:** what artists see in the fixed sprite or sheet, such as grid alignment, crop, alpha, halos, outlines, and palette behavior.
- **Metadata/export correctness:** what engines and automation consume, such as frame rectangles, pivots, animation tags, durations, palette files, and manifest fields.

A change can improve one category while regressing the other. Reviews should name the affected dimension explicitly.

## Severity labels

| Severity | Meaning | Examples |
| --- | --- | --- |
| Blocker | The asset is unusable or unsafe to export without manual repair. | Output is off-grid, alpha is destroyed, frames are missing, manifest rects point outside the sheet. |
| Major | The asset is usable only with significant manual cleanup or would visibly fail in common engine workflows. | Crop removes important pixels, palette changes between animation frames, pivots wobble, halos remain around most edges. |
| Minor | The output is usable, but a careful artist or engine integration review finds local defects. | A few isolated halo pixels, one frame source rect shifted by 1 px, palette has one avoidable near-duplicate color. |
| Cosmetic | The issue is noticeable but does not affect technical correctness or ordinary use. | Inspector label wording, non-critical warning copy, an optional outline preview could be clearer. |

When in doubt, classify by user impact: whether the user can trust the exported asset without rework.

## Quality dimensions

| Dimension | Category | What good looks like | Fail symptoms | Automatic vs manual review |
| --- | --- | --- | --- | --- |
| Grid alignment | Visual output quality | Every output pixel corresponds to a stable source pseudo-pixel block; no fake enlarged pixels or hidden anti-aliased resampling remain. | Checkerboard edges drift, diagonal lines wobble from block to block, output dimensions imply the wrong source scale, or native pixels contain blended subpixel noise. | Mostly automatic with grid candidate confidence, exact/tolerance golden tests, and block-boundary diagnostics; manual review still needed for ambiguous AI sources. |
| Crop correctness | Visual output quality | The output contains the intended sprite/sheet content with expected padding and no unrelated presentation background. | Important silhouette pixels are clipped, large empty borders remain, poster captions or decorative marks enter the fixed asset, or source bounds are not reproducible. | Both: source rects and output dimensions can be tested, while intent around optional padding often needs manual review. |
| Alpha cleanup | Visual output quality | Transparent areas are actually transparent, alpha thresholds are stable, and intended semi-transparent pixels are handled according to the selected alpha mode. | Baked checkerboards remain opaque, holes appear in solid regions, soft alpha fringe survives binary mode, or transparent RGB contamination causes edge artifacts. | Mostly automatic with alpha histograms, flood-fill expectations, and golden tests; manual review for stylized translucency. |
| Halo removal | Visual output quality | Edge pixels use sprite-local colors or clean transparency without matte contamination from the source background. | White/black/color-key outlines remain around the sprite, edge pixels are visibly desaturated, or halo cleanup erodes intentional detail. | Both: changed-pixel and edge-mask tests can catch regressions, but preserving intentional outlines needs manual review. |
| Subject-color preservation | Visual output quality | Cleanup removes background/matte artifacts without deleting the same hue when it appears inside the foreground subject. | Green eyes, flower stems, gems, buttons, or other small subject details disappear because a similar hue appeared in the matte/background. | Both: foreground-component tests and palette assertions can catch known cases; manual review is needed when the same color appears in both matte and art. |
| Outline preservation/addition | Visual output quality | Existing intentional outlines survive cleanup; optional generated outlines are consistent, native-pixel sized, and use the selected color/alpha/source mode. | Cleanup deletes outline corners, generated outlines are uneven, outline size is not native-pixel accurate, or outline metadata/settings cannot reproduce the result. | Both: outline thickness/colors can be tested; artistic acceptability and intentional-outline detection need manual review. |
| Palette fidelity | Visual output quality | The palette respects max-color or fixed-palette settings while preserving important identity colors and contrast. | Key colors collapse together, near-duplicates waste palette slots, fixed palette is ignored, or output colors are unexpectedly introduced. | Mostly automatic with palette lists, color-count assertions, and golden comparisons; manual review for perceptual style quality. |
| Palette stability across animation frames | Visual output quality | Frames in one animation or sheet share a stable palette unless the user explicitly opts out. | Same material changes color frame-to-frame, palette order drifts, or frame-local quantization causes flicker in playback. | Mostly automatic with per-frame palette equality/remap tests and animation playback diagnostics; manual review for subtle flicker. |
| Sheet frame detection | Metadata/export correctness | Detected rows, columns, frame counts, frame source rects, and row animations match visible cells and ignore labels/gutters/backgrounds. | Frames include captions, miss sprites, overlap incorrectly, use wrong row counts, or warnings are absent for uncertain layouts. | Mostly automatic with expected metadata tests and tolerant rect checks; manual review remains required for irregular AI sheets. |
| Pivot/baseline stability | Metadata/export correctness | Pivots and baselines stay stable across related frames so animation playback does not wobble unless the user chooses otherwise. | Feet slide, attacks jump vertically, pivots differ between frames with identical stance, or normalized frame canvases introduce drift. | Both: pivot/baseline deltas and frame-stability diagnostics can be tested; final motion feel should be reviewed manually. |
| Export metadata correctness | Metadata/export correctness | Manifest, sheet, frame, animation, palette, padding, extrusion, duration, and target-engine sidecar metadata describe the exported files exactly. | Rects point to wrong pixels, frame durations are lost, image filenames mismatch, pivots are missing, palette files differ from output, or engine warnings are omitted. | Mostly automatic with manifest/schema/export bundle tests; manual review for target-engine guidance wording. |

## Testing expectations

Use automatic tests when a defect can be expressed as deterministic data:

- exact or tolerance-based pixel comparison for fixed outputs
- grid candidate scale/phase/confidence assertions
- alpha and palette count assertions
- foreground subject-color preservation checks for matte cleanup cases
- frame rectangle, row count, row animation, and warning assertions
- pivot, baseline, frame duration, and manifest field assertions
- export bundle file lists and sidecar validation

Use manual review when intent or artistic taste matters:

- whether a stylized single-pixel highlight should be preserved
- whether a generated outline looks good for the sprite style
- whether perceptual palette changes are acceptable
- whether ambiguous AI sheet cells should be grouped or split
- whether animation motion feels stable in playback

Manual review should still cite the relevant dimension and severity label so future fixtures can convert repeated defects into automated tests.
