# Robust Preview

Robust Preview is PixelAid's opt-in native reconstruction strategy for difficult pseudo-pixel images. Classic remains the default. Robust changes how PixelAid estimates the true source-pixel grid; it does not choose the palette, remove a background, repair an outline, clean alpha fringes, or decide the exported canvas size.

## When to use it

Try Robust Preview when an AI-generated sprite, icon, or full-canvas background has blurred block boundaries, uneven apparent pixels, ambiguous native dimensions, or different horizontal and vertical evidence. Leave Classic selected for already-correct pixel art or when you want the established reconstruction path.

Phase 7 eligibility is intentionally narrow:

| Asset | Robust Preview |
| --- | --- |
| Single sprite | Available |
| Single icon | Available |
| Full-canvas background | Available when subject cropping is off |
| Sprite, animation, or character sheet | Classic only |
| Tileset, tilemap, icon set, portrait, or UI element | Classic only |

Unsupported workflows stay on Classic even if an older saved setting or automation request asks for Robust.

## Two independent stages

PixelAid treats reconstruction and packaging separately.

1. **Reconstruction** finds or accepts the true native pixel canvas. Classic and Robust are choices in this stage.
2. **Output canvas** places that reconstruction into exported bounds using the selected framing, scale, and anchor.

A reconstructed 90x113 sprite can therefore remain 90x113 inside a 128x128 output. Preserve source composition keeps proportional source padding, Pack subject removes surrounding space, and Fit subject scales the subject according to the selected canvas-scale policy. Background preservation or removal changes pixels, not this geometry.

Choosing a manual native size bypasses automatic strategy selection. The manual dimensions are authoritative; Classic and Robust should package the same reconstruction when every other setting is equal.

## Safety policies

Selecting Robust Preview in the editor or automation defaults to **Guarded** safety:

- **Guarded** compares Robust with Classic and falls back when the proposed geometry has weak supporting evidence.
- **Warn** keeps the Robust proposal but returns the same structured warning.
- **Raw** (`off` in CLI/API settings) keeps the frozen proposal without the product guard. It is intended for expert diagnosis, not routine export.

The editor keeps Warn and Raw inside Advanced controls. Automation uses `guarded`, `warn`, and `off`.

## Reading the result

After Fix, the Pixel pipeline reports one of these outcomes:

- **Classic selected**: the stable default was requested.
- **Robust Preview used**: Guarded accepted the Robust geometry.
- **Robust requested -> Classic used**: Guarded rejected the proposal and returned the Classic result.
- **Robust used with warning**: Warn retained geometry that Guarded would question.
- **Classic required for this asset**: the asset is outside the current eligibility boundary.

Fallback and warning results include deterministic reason codes. Preserve those diagnostics when reporting an issue.

## Automation examples

```sh
pixelaid fix generated.png \
  --out generated-fixed.png \
  --native-size auto \
  --canvas 128x128 \
  --framing preserve \
  --canvas-scale native \
  --reconstruction-strategy robust \
  --robust-safety guarded \
  --json
```

MCP and HTTP-style requests use `options.gridStrategy: "robust"` and `options.robustSafety: "guarded"`. `--grid-strategy` remains a CLI compatibility alias for `--reconstruction-strategy`.

## Reporting a failure

Include the PixelAid version, asset type, requested native-size mode, output-canvas settings, requested and used strategies, Guarded reason codes, and a sanitized Diagnostics export. Do not share private source assets without permission. A reduced or synthetic reproduction is preferred.

Robust Preview remains opt-in until the Phase 8 evidence campaign measures real-world preference, geometry accuracy, fallback frequency, performance, and cross-surface output parity.
