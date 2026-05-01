# Quantization Adapter Evaluation

Status: deferred dependency, adapter-ready architecture.

## Context

PixelAid already includes three in-house auto-palette strategies:

- `frequency`: exact/frequency ranking with coarse color bucketing for noisy inputs.
- `medianCut`: deterministic weighted median-cut boxes.
- `perceptual`: median-cut boxes with medoid color selection and a luma-weighted distance.

Those strategies are pure TypeScript, deterministic, dependency-free, and work in the web editor, worker, CLI, MCP, local HTTP, and desktop shell. The 0.9.0 question was whether to add an optional advanced quantization adapter such as `image-q`, especially because similar cleanup tools use WuQuant-style quantization for AI pixel-art outputs with thousands of accidental colors.

## Candidate

Package: `image-q@4.0.0`

Source: `https://github.com/igor-bezkrovny/image-quantization`

License: MIT, confirmed from the package `LICENSE` file via `npm pack image-q@4.0.0`.

Package metadata at evaluation time:

- Tarball size: about 168 KB.
- Unpacked size: about 845 KB.
- Files: 140.
- Runtime dependency metadata lists `@types/node@16.9.1`, which appears type-oriented but should still be reviewed before bundling.
- Algorithms include WuQuant, RGBQuant, NeuQuant, perceptual color distance helpers, image quantizers, and dithering paths.

## Quality And Determinism

`image-q` is attractive because it provides mature WuQuant-style palette extraction and perceptual distance options. That may improve images with very high accidental color counts, smooth generated gradients, or sources where current median-cut boxes produce muddy average colors.

The tradeoff is that PixelAid's current pipeline needs deterministic, frame-stable behavior more than maximum photographic quantization quality. Animation sheets are especially sensitive: a slightly better per-frame palette can be worse than a stable shared palette if it introduces shimmer. Any adapter must therefore run through the same `resolvePalette` contract, obey `lockScope`, return stable colors, and avoid exposing adapter-specific behavior in public settings until fixture results prove it is better.

The 0.9.0 fixture extension keeps an extreme accidental-color case covered by the current in-house perceptual strategy. That test verifies high input color count, capped output palette size, deterministic repeated extraction, and frame diagnostics.

## Performance And Bundle Impact

Adding `image-q` directly to the browser/core path would add a relatively large amount of quantization code compared with PixelAid's focused in-house implementation. That may be reasonable later if fixture evidence shows a clear quality win, but it should not become the default in the editor without benchmark proof.

Recommended future adapter shape:

- Keep `packages/core` fallback strategies as the default.
- Add an adapter interface that accepts `RGBAImage`, `maxColors`, reserved colors, and lock-scope context.
- Implement optional dynamic import for advanced adapters outside hot startup paths.
- Keep adapter output normalized to PixelAid hex palettes and diagnostics.
- Add benchmark comparisons for 720p/1080p fake-pixel sprites and large animation sheets before enabling in UI presets.

## License And Distribution

MIT is compatible with PixelAid's dependency policy. If `image-q` is added later:

- Add it to `package.json` only after benchmark/fixture approval.
- Add copyright and license text to `THIRD_PARTY_NOTICES.md`.
- Confirm whether source maps/source files are bundled into web or desktop artifacts.
- Re-check transitive dependency metadata and generated license reports.

No dependency was added in 0.9.0, so no third-party notice update is required in this change.

## Decision

Defer adding `image-q` as a runtime dependency for 0.9.0.

Reasons:

- The existing in-house palette system is deterministic, already integrated across all surfaces, and covered by fixture tests.
- The candidate package is permissively licensed but relatively broad for the current need.
- No fixture in the current suite proves a strong enough quality improvement to justify default bundling yet.
- The highest-value next step is an adapter boundary plus benchmark fixture comparison, not switching public behavior.

## Follow-Up Implementation Notes

1. Add an optional quantization adapter interface under `packages/core` or a future `packages/quantization-adapters` package.
2. Add golden comparisons for extreme-color AI sprites, gradient-heavy portraits/backgrounds, and palette-drift animation sheets.
3. Compare `medianCut`, `perceptual`, WuQuant, and RGBQuant on palette quality, stable remap output, runtime, and memory.
4. Only expose an advanced adapter setting after deterministic fixture results and bundle-size review.
5. Keep palette locking and reserved outline colors enforced outside the adapter so all strategies share the same production constraints.
