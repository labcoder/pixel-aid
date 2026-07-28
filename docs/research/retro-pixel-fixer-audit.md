# PixelAid and Retro Pixel Art Fixer: Step 0 audit

Date: 2026-07-27

Status: completed on local branch `pixel-bench`

Scope: interface, algorithm, and qualitative output audit

## Decision

The open-source release changes the benchmark plan in three ways:

1. We can run Retro's own Rust implementation through the adapter that pixel-bench already ships. We do not need to infer its web-tool settings or reproduce its algorithm.
2. We need two PixelAid evaluation profiles. The pixel-bench profile must test automatic single-image reconstruction with no target-size, palette, or asset hints. A separate product-workflow profile can test explicit sizing, palette controls, alpha cleanup, sheets, manifests, and exports.
3. PixelAid's current goldens can support smoke tests and visual review. They cannot produce a competitive score because most lack native 1x ground truth, and three sources contain whole sprite sheets. Pixel-bench expects native still images and generates each damaged input from those sources.

PixelAid covers much more of the asset workflow. Retro has the stronger published automatic grid-recovery design at the overlap point: native-size detection and reconstruction from one damaged image. PixelAid needs measured improvements in that core path before product breadth can support a claim that it beats Retro at pixel fixing.

## Versions and evidence

This audit pinned each external repository before inspection:

| Component | Version |
| --- | --- |
| PixelAid | `0.2.0`, commit `36e993b`, branch `pixel-bench` |
| Retro Pixel Art Fixer | commit [`ef376e5`](https://github.com/Retro-Diffusion/pixel-art-fixer/tree/ef376e57e1c272633ca2dbf5f29ec3fcf6596465) |
| pixel-bench | commit [`779cfc2`](https://github.com/Retro-Diffusion/pixel-bench/tree/779cfc2548ac0da5957514e76d77d8f878ecb513) |

Primary sources:

- PixelAid: [`packages/core/README.md`](../../packages/core/README.md), [`packages/cli/README.md`](../../packages/cli/README.md), [`docs/algorithms.md`](../algorithms.md), and the implementation under `packages/core/src`.
- Retro: [project README](https://github.com/Retro-Diffusion/pixel-art-fixer/blob/ef376e57e1c272633ca2dbf5f29ec3fcf6596465/README.md), [Rust core README](https://github.com/Retro-Diffusion/pixel-art-fixer/blob/ef376e57e1c272633ca2dbf5f29ec3fcf6596465/rust/README.md), and the Rust implementation.
- pixel-bench: [README](https://github.com/Retro-Diffusion/pixel-bench/blob/779cfc2548ac0da5957514e76d77d8f878ecb513/README.md), [metrics](https://github.com/Retro-Diffusion/pixel-bench/blob/779cfc2548ac0da5957514e76d77d8f878ecb513/docs/METRICS.md), [contribution contract](https://github.com/Retro-Diffusion/pixel-bench/blob/779cfc2548ac0da5957514e76d77d8f878ecb513/CONTRIBUTING.md), and [Retro's built-in adapter](https://github.com/Retro-Diffusion/pixel-bench/blob/779cfc2548ac0da5957514e76d77d8f878ecb513/pixelbench/methods/pixelfixer.py).

Both external repositories use the MIT license. We kept their source and build output outside the PixelAid repository. Future PixelAid code should call Retro as an external executable for comparisons. Copying implementation code would require license and attribution review.

## Interface and feature comparison

The table compares released or implemented behavior. It does not count roadmap items.

| Capability | PixelAid | Retro Pixel Art Fixer |
| --- | --- | --- |
| Offline deterministic core | Yes, pure TypeScript core | Yes, Python reference and Rust core |
| Web tool | Full editor workflow | Single-purpose hosted fixer |
| Command-line interface | `inspect`, `report`, `suggest`, `fix`, `fix-sheet`, `palette`, `export`, `batch` | Detect, process, reconstruct, and batch-folder paths |
| Machine-readable diagnostics | Stable JSON, candidates, settings, warnings, quality report | JSON detection result, consensus path, size, steps, and timings |
| Automatic grid detection | Edge energy, run scores, Sobel tile voting, crop and phase scoring | Autocorrelation, run lengths, shift self-similarity, consensus, and full arbitration |
| Automatic fractional cell size | No. Current candidate search tests integer scales | Yes |
| Automatic non-square cells | No. Current candidate search assigns one scale to both axes | Yes |
| Manual non-square or fractional scale | Yes, through `--scale-x`, `--scale-y`, or exact target dimensions | Low-level `recon` accepts steps, columns, and rows |
| Manual phase control | Yes | No public phase override in the process interface |
| Local grid correction | Core supports boundary-offset planning for single sprites | Full detector handles drift and non-uniform cases |
| Exact output-size control | Yes, `--target WIDTHxHEIGHT` | Low-level reconstruction can set columns and rows; the standard process chooses them |
| Downsampling choices | Dominant, median, adaptive, detail-preserving, contrast, centroid, nearest, and averaging paths | Two-stage packing or legacy mode pooling |
| Final palette cap | Auto or explicit limits | No final palette cap in the standard Rust process |
| Fixed and named palettes | Custom palette files plus built-in palettes | No |
| Palette locking across a sheet or batch | Yes | No |
| Dithering control | None, ordered, Bayer, Floyd, and error diffusion | No public final-output control |
| Transparency controls | Preserve, binary, flood fill, color key, thresholds, RGB decontamination | Per-cell majority from source alpha |
| Matte and halo cleanup | Yes | No matte-background removal in the classical process |
| Orphan, jaggy, line, outline, and contrast cleanup | Yes | Structural packing, with an optional dark-stroke path |
| Sprite-sheet detection and normalization | Yes | Treats the sheet as one image |
| Frame metadata, pivots, tags, and durations | Yes | No |
| Engine and bundle exports | Godot, Unity, Phaser, TexturePacker, Tiled, LDtk, manifests, palettes, ZIP | PNG output |
| Worker, batch, API, and MCP surfaces | Yes | Batch and server API; no engine workflow |

PixelAid wins the interface comparison for production asset work. Pixel-bench scores a narrower contract: one damaged RGBA image enters, and one recovered native image leaves. Most PixelAid features sit outside that contract.

## Algorithm comparison

### Grid recovery

PixelAid's automatic detector scans integer scales from 2 through a configured maximum. For each scale it scores edge periodicity, repeated color runs, Sobel votes, crop coverage, phase, and plausible output size. It returns five candidates with confidence and diagnostic notes. PixelAid can apply local boundary offsets after choosing a candidate.

The current automatic search assigns the same integer scale to both axes. Manual settings support separate fractional scales, but pixel-bench forbids methods from reading the ground truth or distortion specification. Manual support cannot improve the official score.

Retro runs three independent detectors, adds a fused voter, then arbitrates disagreements per axis with more evidence channels. Its documented failure handling covers harmonic traps, content scale, fractional and non-square cells, JPEG blocks, and grid drift. The detector predicts fractional `step_x` and `step_y` values.

This gap maps to pixel-bench's highest-value metrics: exact native size, within-one-cell size, relative size error, and grid alignment.

### Reconstruction

PixelAid samples each selected source block with configurable dominant, median, adaptive, perceptual, and detail-preserving methods. It then applies optional palette remapping, alpha handling, morphology, cleanup, and output conditioning.

Retro's default two-stage pack uses an adaptive quantized label image to choose cell structure. It colors the winning label from the original pixels, which protects source colors from the structural quantizer. Its Rust README states that the final `palette_snap` option has not been ported.

PixelAid exposes more artistic control. Retro couples its detector to a reconstruction method designed around the pixel-bench contract. We need ground-truth scores to compare color and placement quality.

## Qualitative golden run

### Method

We built PixelAid's current CLI and Retro's release-mode Rust binary. The runner normalized each source to one PNG, then passed the same file bytes to both tools.

For each source, the runner produced four views:

1. Normalized input.
2. PixelAid `fix` with guided defaults and no hints.
3. PixelAid with the workflow suited to the known asset.
4. Retro `process INPUT OUTPUT full`.

The asset-aware PixelAid run used:

| Source | PixelAid workflow |
| --- | --- |
| Hero cat | `fix --target 128x128 --colors 24 --alpha backgroundFloodFill --matte-cleanup --outline-mode none` |
| Samurai | `fix-sheet` with automatic sheet detection |
| Hollow Knight | `fix-sheet` with automatic sheet detection |
| Astro | `fix-sheet` with automatic sheet detection |
| Robot processed golden | `fix --target 104x146 --colors auto --alpha preserve --outline-mode none` |

The local lab contains the full result:

```text
C:\dev\Mighty\pixel-aid-benchmark-lab\audit\report.html
C:\dev\Mighty\pixel-aid-benchmark-lab\audit\report.png
C:\dev\Mighty\pixel-aid-benchmark-lab\audit\summary.json
C:\dev\Mighty\pixel-aid-benchmark-lab\audit\metadata\
```

The lab also contains `run-audit.mjs`, both pinned repositories, normalized inputs, exact outputs, SHA-256 hashes, command results, and wall-clock observations. Git does not track the lab.

### Results

| Source | Input | PixelAid guided `fix` | PixelAid asset-aware | Retro full |
| --- | ---: | ---: | ---: | ---: |
| Hero cat | 1254×1254, 58,568 RGBA colors | 879×1107, 25 colors | 90×113, 25 colors | 102×101, 1,587 colors |
| Samurai sheet | 1491×1055, 287,710 colors | 1360×872, 29 colors | 1450×1005, 24 colors | 59×40, 645 colors |
| Hollow Knight sheet | 1536×1872, 158,307 colors | 1536×1872, 27 colors | 1536×1872, 27 colors | 44×54, 396 colors |
| Astro sheet | 1536×1872, 239,733 colors | 1536×1872, 29 colors | 1536×1872, 29 colors | 24×45, 174 colors |
| PixelAid robot golden | 104×146, 16 colors | 51×73, 23 colors | 104×146, 19 colors | 13×18, 26 colors |

Color counts include transparent RGBA as one exact value. They measure output structure, not quality.

### Observations

#### Hero cat

PixelAid removed the magenta matte, created binary transparency, and enforced a 24-color palette. The configured run produced the cleanest asset-ready output in this review. Its 90×113 output came from the user's 128×128 target plus foreground crop.

Retro recovered a size near PixelAid's 104×103 grid candidate and preserved more source color variation. It left the magenta background opaque because its classical process pools source alpha and does not remove a baked matte.

The test lacks the original native cat, so neither 90×113 nor 102×101 counts as the correct size. We can credit PixelAid's workflow cleanup and Retro's automatic downscale attempt. We cannot name a reconstruction winner.

#### Sprite sheets

PixelAid preserved the separate frames and removed baked or soft backgrounds. It capped the sheet palette and produced frame manifests. Retro treated each complete sheet as one pixel-art image, then collapsed the Samurai, Hollow Knight, and Astro sheets to 59×40, 44×54, and 24×45.

This result shows PixelAid's product advantage on sheet inputs. It does not predict pixel-bench performance because pixel-bench passes still images to each method.

The run also exposed two PixelAid sheet issues:

- `fix-sheet` reduced the Hollow Knight and Astro layout metadata to one frame, while `suggest` had identified their 8×9 layouts.
- The Samurai `fix-sheet` result reported a 384×192 target in its settings but wrote a 1450×1005 sheet.

These are interface and orchestration defects. Grid improvements alone will not fix them.

#### Processed robot control

The robot file is a PixelAid output golden with known 104×146 dimensions. PixelAid's guided run classified its repeated structure as a 2× grid and reduced it to 51×73. Retro reduced it to 13×18. The configured PixelAid run kept 104×146 but changed the color count from 16 to 19.

PixelAid needs a native-output guard or an explicit no-op decision. A user who runs a fixed asset through the default CLI twice should not lose half its dimensions.

### Timing caution

The report shows one wall-clock observation per command so we can spot gross workflow costs. It includes Node or process startup, PNG IO, and different feature sets. We did not warm up the tools, repeat trials, isolate algorithm time, or control CPU state. These numbers cannot support a speed claim.

## Conclusions from Step 0

### PixelAid leads in product scope

PixelAid handles matte removal, palettes, exact sizing, cleanup, sheets, metadata, engine exports, batch jobs, and automation surfaces. Retro's open-source fixer focuses on one damaged image and one recovered PNG.

### Retro sets the current target for automatic core reconstruction

Retro's detector searches fractional and independent axis steps and arbitrates several independent signals. PixelAid's automatic candidate search uses one integer scale for both axes. The first pixel-bench run should show the size of that gap by category.

### PixelAid's internal workflow needs consistency fixes

The golden run found disagreement between `inspect`, `suggest`, `fix`, and `fix-sheet`. The native-output control also changed under guided defaults. These defects affect normal users and should qualify for improvement work even if they do not move a benchmark score.

## Step 1 entry criteria

### Build a trustworthy native corpus

pixel-bench ships no images. Each source must provide the ideal output because the distortion engine treats it as ground truth.

Accept a source if it meets all of these checks:

- A license and provenance record permits benchmark use and publication of aggregate results.
- The stored file is native 1x pixel art. Zoom inspection shows one stored pixel per intended art pixel, and `pixelbench validate` reports no upscale warning.
- The image has no resampling blur. Any alpha edges reflect intentional pixel values.
- A reviewer records the native width, height, palette count, alpha mode, artist or source, license, and SHA-256 hash.
- Hash and perceptual checks remove duplicates and near-duplicates.
- The set covers small and large sprites, wide and tall aspect ratios, low and high palette counts, transparency, flat regions, line art, texture, and dithering.

Start with 20 cleared sources for adapter validation. Freeze a development set and an untouched holdout before tuning. Expand to at least 100 sources before publishing a competitive table.

### Freeze fair PixelAid profiles

The official PixelAid method receives pixel-bench's distorted RGBA array. It cannot use the source filename, ground-truth dimensions, category, distortion parameters, or hand-written per-image settings.

Test these candidate profiles on the development split:

1. `pixelaid-guided`: guided automatic detection with `--colors auto`, `--alpha preserve`, and no forced outline. This avoids an arbitrary palette cap and matches pixel-bench's RGB-composited ground truth.
2. `pixelaid-core`: grid reconstruction with palette, alpha, and artistic cleanup disabled. This isolates detector and block-reconstruction quality.

Choose one primary profile before running the holdout. Publish secondary profiles under distinct method names if they answer a clear product question. Do not choose settings per distortion category or per source.

Exact target size must remain unset. A target taken from the source would leak the answer and violate pixel-bench's contribution rules.

### Build the adapter outside PixelAid first

Keep the first Python adapter and its environment in:

```text
C:\dev\Mighty\pixel-aid-benchmark-lab\pixel-bench\
```

The pilot adapter can spawn the built CLI for correctness work. A scored runtime comparison needs a resident Node JSONL bridge, one process per pixel-bench worker, so Node startup does not dominate each sample.

Keep these items outside the PixelAid repository:

- Retro and pixel-bench clones
- Python virtual environment and Rust target directory
- Native corpus and license records
- Distorted images, reports, JSON results, previews, and failure galleries

After the adapter stabilizes, PixelAid can track a thin integration under `integrations/pixel-bench/`. That directory should contain PixelAid-owned bridge code, tests, and run instructions. It should not contain the pixel-bench source, competitor code, corpora, generated images, or result files.

### Validate before trusting scores

Require all of these checks before analysis:

- The adapter passes synthetic dimension, channel-order, alpha, and failure-path tests.
- Three runs produce identical output hashes and scores.
- The runner records zero crashes or reports each failure rate.
- PixelAid and Retro receive identical input arrays.
- Pinned commits, suite version, profile name, command, seed, platform, and worker count appear in the result metadata.
- The report includes per-category sample counts and separate metrics. Do not reduce the run to one rank.
- A reviewer inspects random samples plus the worst failures for each method.
- The holdout stays closed until the team freezes the profile.

Trust resolution and grid metrics first. Interpret raw color error with pixel-bench's warning: over-segmented outputs can receive favorable color scores. Use color comparisons conditioned on exact-resolution samples.

## Recommended next step

Approve Step 1A as a small integration task:

1. Create a local Python `pixelaid` method adapter in the external pixel-bench clone.
2. Create deterministic adapter tests with tiny synthetic native images.
3. Assemble and validate a 20-image licensed development corpus.
4. Run a small matrix for `pixelaid-guided`, `pixelaid-core`, and Retro `fixer`.
5. Save the raw JSON, category tables, output hashes, and failure gallery outside the repo.

Step 1A should not change PixelAid algorithms and should not create an upstream contribution. Its result will tell us whether the adapter and corpus deserve a full run.
