# Robust Preview Phase 7 release contract

Phase 7 promotes the accepted Step 6S reconstruction work to an opt-in product preview. It does not retune the detector, alter the Step 1Q candidate ranking, or change PixelAid's default output.

## User-facing contract

- **Classic** remains the default reconstruction strategy for new settings, existing settings that omit a strategy, and every unsupported workflow.
- **Robust Preview** is an explicit automatic native-reconstruction choice. Selecting it does not implicitly change background removal, alpha handling, outline cleanup, palette generation, fringe correction, downscale method, or output-canvas packaging.
- Native reconstruction and output packaging remain separate stages. Robust chooses the true source-pixel structure; canvas size, framing, scale, anchor, and padding package that result for export.
- Manual grid values and runtime-supplied candidates remain authoritative.

## Eligibility boundary

Robust Preview is available only for:

1. single sprites;
2. single icons; and
3. backgrounds reconstructed as a full canvas.

Sprite sheets, animation sheets, character sheets, icon sets, tilesets, tilemaps, portraits, and UI elements remain on Classic in Phase 7. Sheet support requires a separate frame-stability design and is not implied by this release.

The executable eligibility rule lives in `packages/core/src/robustEligibility.ts` and is shared by core processing and product surfaces. Unsupported Robust requests return structured fallback diagnostics instead of silently changing the release boundary.

## Safety levels

- **Guarded** is the product default whenever a user selects Robust Preview. It compares Robust and Classic proposals and falls back to Classic when Robust geometry has insufficient support.
- **Warn** keeps the Robust proposal and returns the same structured warning evidence.
- **Raw** (`off` in the serialized/API contract) exposes the frozen proposal without the product guard. It is an expert diagnostic option, not a recommended workflow.

Every non-selected Robust result must expose the requested strategy, used strategy, decision, reason codes, and human-readable message. Product surfaces should present this as `Robust requested -> Classic used` or `Robust used with warning`.

## Frozen evidence baseline

The Phase 7 preview begins from local branch commit `e32030b` (Step 6S). That baseline includes the moderate-anisotropy guard accepted with the Hero Cat golden and preserves the legitimate non-square 32x20 fixture. Phase 7 may change product plumbing, labels, documentation, and diagnostics presentation, but detector thresholds and reconstruction ranking are frozen until a separately approved improvement phase.

## Promotion boundary

Phase 8 evidence is required before considering Robust as the default. Until then:

- no existing project or script is migrated to Robust automatically;
- omitted strategy fields resolve to Classic;
- new UI settings begin on Classic; and
- fallback and warning telemetry remains local and deterministic.
