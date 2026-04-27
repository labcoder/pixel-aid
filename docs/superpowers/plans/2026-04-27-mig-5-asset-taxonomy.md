# MIG-5 Asset Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define PixelAid's 0.1.0 asset-type taxonomy, store the selected type in settings and manifests, and make Auto Suggest plus manual editor controls use that taxonomy without turning animation into a separate image-processing mode.

**Architecture:** Keep `AssetMode` as the low-level processing mode used by core algorithms (`single`, `spriteSheet`, `characterSheet`, `tileSheet`) and add a separate serializable `AssetType` taxonomy for product intent (`sprite`, `animationSheet`, `portrait`, etc.). Auto Suggest should classify an `AssetType`, derive the compatible processing mode, return confidence/reason/warnings, and allow the editor's manual selector to override that category per imported asset while still using sheet/frame metadata and cleanup presets.

**Tech Stack:** TypeScript, React, Vite, Vitest, npm workspaces, existing `@pixelaid/shared`, `@pixelaid/core`, `@pixelaid/web`, and `@pixelaid/exporters` packages.

---

## Current Context

- The shared contract currently has `AssetMode = "single" | "spriteSheet" | "characterSheet" | "tileSheet"` in `packages/shared/src/types.ts`.
- `FixOptions.mode` is the only persisted classification field today. It is too coarse for MIG-5 because `sprite`, `portrait`, `icon`, `uiElement`, and `background` all map to the current `single` processing path.
- `apps/web/src/lib/fixSuggestions.ts` owns Auto Suggest. It currently returns `mode`, grid candidates, target size, sheet layout, confidence, and a single reason string.
- `apps/web/src/App.tsx` owns editor state, imports, `applyFixSuggestion`, the `Mode` selector, fix option construction, and manifest export orchestration.
- Imported assets are stored in `apps/web/src/App.tsx` as `ImportedImageAsset[]`; MIG-5 should add per-asset asset-type metadata there rather than treating the user's manual type choice as a global setting.
- `packages/exporters/src/manifest.ts` stores `result.settings` inside `manifest.meta.operation.settings`, so adding `assetType` to `FixOptions` will persist it there. MIG-5 should also expose the selected asset type directly at `manifest.meta.assetType` for quick exporter/engine inspection.
- `docs/editor.md`, `docs/architecture.md`, and `README.md` already describe the editor mode workflow and should be updated to distinguish asset type from processing mode.
- No new runtime dependency is needed for MIG-5.

## Taxonomy Decision

Use this `AssetType` union for 0.1.0 contracts:

```ts
export type AssetType =
  | "sprite"
  | "spriteSheet"
  | "animationSheet"
  | "characterSheet"
  | "tileset"
  | "tilemap"
  | "portrait"
  | "icon"
  | "uiElement"
  | "background";
```

Represent animation as metadata attached to sheets or frame sequences:

- `animationSheet` and `characterSheet` both use sheet/frame processing and timeline metadata.
- Do not add a separate `"animation"` processing mode.
- Continue using `SpriteFrame`, `AnimationTag`, `SpriteAnimation`, `sheetFrames`, and `animations` manifest metadata for timeline behavior.

Recommended support matrix for 0.1.0:

| Asset type | Processing mode | 0.1.0 support | Notes |
| --- | --- | --- | --- |
| `sprite` | `single` | Fully supported | Default for standalone characters, props, and objects. |
| `icon` | `single` | Fully supported | Uses crisper alpha/palette defaults. |
| `spriteSheet` | `spriteSheet` | Fully supported | Generic sheet/frame workflow. |
| `animationSheet` | `spriteSheet` | Fully supported | Timeline metadata represents animation. |
| `characterSheet` | `spriteSheet` | Fully supported as sheet workflow | Character semantics remain user-edited row/tag metadata. |
| `tileset` | `tileSheet` | Inspect-only in 0.1.0 | Existing tile sheet controls work, but seam diagnostics and tile exports are milestone 0.2+. |
| `portrait` | `single` | Inspect-only in 0.1.0 | Fix pipeline works; defaults are preservation-oriented and no engine portrait exporter exists. |
| `uiElement` | `single` | Inspect-only in 0.1.0 | Fix pipeline works; preserve alpha/effects more conservatively. |
| `background` | `single` | Inspect-only in 0.1.0 | Large scenes should avoid aggressive cleanup by default. |
| `tilemap` | `tileSheet` | Future milestone | Needs map-data semantics before it can be engine-ready. |

## Likely Files

Shared contracts:

- Modify `packages/shared/src/types.ts`: add `AssetType`, `AssetTypeSupport`, `AssetTypeWarning`, `AssetTypeClassification`, and `assetType` fields on `FixOptions` and `PixelAssetManifest.meta`.
- Modify `packages/shared/src/index.ts`: export the new types and taxonomy helpers.
- Create `packages/shared/src/assetTypes.ts`: central taxonomy definitions, labels, support matrix, and `assetTypeToMode`.
- Create `packages/shared/src/assetTypes.test.ts`: Vitest coverage for support matrix and processing-mode mapping.
- Modify `packages/shared/package.json`: add `"test": "vitest run"` so shared taxonomy tests run from root.

Web classification and presets:

- Modify `apps/web/src/lib/fixSuggestions.ts`: classify `AssetType`, derive `AssetMode`, return `categoryConfidence`, `categoryReason`, and `categoryWarnings`.
- Modify `apps/web/src/lib/fixSuggestions.test.ts`: cover sprite/icon/portrait/animation sheet/tileset/background or UI element suggestions.
- Modify `apps/web/src/lib/assets.ts` and `apps/web/src/lib/assets.test.ts`: support per-import asset-type metadata when assets are selected, removed, or replaced.
- Create `apps/web/src/lib/assetTypePresets.ts`: type-specific default cleanup/settings presets.
- Create `apps/web/src/lib/assetTypePresets.test.ts`: cover preset defaults and manual override behavior.
- Modify `apps/web/src/lib/presets.ts` and `apps/web/src/lib/presets.test.ts`: include `assetType` in `EditorSettingsState` and existing presets where helpful.
- Modify `apps/web/src/lib/guidedFix.ts` and `apps/web/src/lib/guidedFix.test.ts`: include asset type label and warnings in recommendation summaries without making the card verbose.
- Modify `apps/web/src/lib/timelineState.ts` and `apps/web/src/lib/bottomPanelLayout.ts` only if the worker chooses to route timeline visibility through `AssetType`; otherwise leave them using `AssetMode`.

Editor UI:

- Modify `apps/web/src/App.tsx`: add asset-type state, Auto/Manual selector behavior, warning display, type preset application, `FixOptions.assetType`, and export logs/readouts.
- Modify `apps/web/src/styles.css`: style the selector and warning text using existing inspector/control patterns.

Exporter:

- Modify `packages/exporters/src/manifest.ts`: copy `settings.assetType` into `manifest.meta.assetType`.
- Modify `packages/exporters/src/manifest.test.ts`: assert manifest asset type and operation settings asset type.

Docs:

- Modify `docs/editor.md`: add taxonomy/support table and clarify "Asset Type" vs processing "Mode".
- Modify `docs/architecture.md`: update data flow for classification and manifest persistence.
- Modify `README.md`: update current workflow, implemented features, limitations, and roadmap lines affected by MIG-5.

## Task 1: Add Shared Taxonomy Contracts

**Files:**

- Create: `packages/shared/src/assetTypes.ts`
- Create: `packages/shared/src/assetTypes.test.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json`

- [ ] **Step 1: Define the taxonomy helpers**

Create `packages/shared/src/assetTypes.ts` with the central definitions. The worker may adjust wording, but keep the identifiers stable:

```ts
import type { AssetMode, AssetType, AssetTypeSupport } from "./types";

export type AssetTypeDefinition = {
  type: AssetType;
  label: string;
  shortLabel: string;
  support: AssetTypeSupport;
  processingMode: AssetMode;
  description: string;
  defaultWarnings: string[];
};

export const assetTypeDefinitions: readonly AssetTypeDefinition[] = [
  {
    type: "sprite",
    label: "Sprite",
    shortLabel: "Sprite",
    support: "full",
    processingMode: "single",
    description: "Standalone character, prop, object, or creature sprite.",
    defaultWarnings: []
  },
  {
    type: "spriteSheet",
    label: "Sprite sheet",
    shortLabel: "Sheet",
    support: "full",
    processingMode: "spriteSheet",
    description: "Multiple frames arranged as cells without guaranteed animation semantics.",
    defaultWarnings: []
  },
  {
    type: "animationSheet",
    label: "Animation sheet",
    shortLabel: "Animation",
    support: "full",
    processingMode: "spriteSheet",
    description: "Frame sheet whose animation is represented by timeline metadata.",
    defaultWarnings: []
  },
  {
    type: "characterSheet",
    label: "Character sheet",
    shortLabel: "Character",
    support: "full",
    processingMode: "spriteSheet",
    description: "Character poses or directions represented as editable frame rows and clips.",
    defaultWarnings: []
  },
  {
    type: "tileset",
    label: "Tileset",
    shortLabel: "Tileset",
    support: "inspectOnly",
    processingMode: "tileSheet",
    description: "Tile images where grid alignment matters; seam diagnostics are a future milestone.",
    defaultWarnings: ["Tileset seam diagnostics and tile-engine metadata are not fully supported in 0.1.0."]
  },
  {
    type: "tilemap",
    label: "Tilemap",
    shortLabel: "Tilemap",
    support: "future",
    processingMode: "tileSheet",
    description: "Placed map data or map screenshots that need map-aware import before export.",
    defaultWarnings: ["Tilemap data import/export is not supported in 0.1.0."]
  },
  {
    type: "portrait",
    label: "Portrait",
    shortLabel: "Portrait",
    support: "inspectOnly",
    processingMode: "single",
    description: "Character portrait or bust image with preservation-oriented cleanup defaults.",
    defaultWarnings: ["Portrait export uses the generic PNG and manifest workflow in 0.1.0."]
  },
  {
    type: "icon",
    label: "Icon",
    shortLabel: "Icon",
    support: "full",
    processingMode: "single",
    description: "Small UI/game icon with crisp alpha and a limited palette.",
    defaultWarnings: []
  },
  {
    type: "uiElement",
    label: "UI element",
    shortLabel: "UI",
    support: "inspectOnly",
    processingMode: "single",
    description: "Button, badge, frame, effect, or other interface element.",
    defaultWarnings: ["UI effects use conservative cleanup defaults to preserve gradients and glow edges."]
  },
  {
    type: "background",
    label: "Background",
    shortLabel: "Background",
    support: "inspectOnly",
    processingMode: "single",
    description: "Scene or backdrop where aggressive sprite cleanup can destroy intentional detail.",
    defaultWarnings: ["Backgrounds are inspect-only in 0.1.0 and use preservation-oriented cleanup defaults."]
  }
] as const;

export function getAssetTypeDefinition(type: AssetType): AssetTypeDefinition {
  return assetTypeDefinitions.find((definition) => definition.type === type) ?? assetTypeDefinitions[0]!;
}

export function assetTypeToMode(type: AssetType): AssetMode {
  return getAssetTypeDefinition(type).processingMode;
}
```

- [ ] **Step 2: Add shared serializable types**

In `packages/shared/src/types.ts`, add:

```ts
export type AssetType =
  | "sprite"
  | "spriteSheet"
  | "animationSheet"
  | "characterSheet"
  | "tileset"
  | "tilemap"
  | "portrait"
  | "icon"
  | "uiElement"
  | "background";

export type AssetTypeSupport = "full" | "inspectOnly" | "future";

export type AssetTypeWarning = {
  code: string;
  severity: "info" | "warning";
  message: string;
};

export type AssetTypeClassification = {
  assetType: AssetType;
  confidence: number;
  reason: string;
  warnings: AssetTypeWarning[];
};
```

Then add `assetType: AssetType` to `FixOptions` next to `mode`, and add `assetType: AssetType` to `PixelAssetManifest.meta`.

- [ ] **Step 3: Export new contracts**

In `packages/shared/src/index.ts`, export the new types and functions:

```ts
export {
  assetTypeDefinitions,
  assetTypeToMode,
  getAssetTypeDefinition
} from "./assetTypes";
export type { AssetTypeDefinition } from "./assetTypes";
```

Also add the new type names to the existing `export type { ... } from "./types";` block.

- [ ] **Step 4: Add shared package tests**

Add `"test": "vitest run"` to `packages/shared/package.json`.

Create `packages/shared/src/assetTypes.test.ts` with tests that assert:

- Every `AssetType` has exactly one definition.
- `animationSheet` maps to `spriteSheet`.
- `characterSheet` maps to `spriteSheet`.
- `tileset` maps to `tileSheet` and is `inspectOnly`.
- `tilemap` is `future`.
- `sprite`, `icon`, `spriteSheet`, `animationSheet`, and `characterSheet` are `full`.

- [ ] **Step 5: Verify Task 1**

Run:

```sh
npm run test -w @pixelaid/shared
npm run typecheck --workspaces --if-present
```

Expected:

- Shared tests pass.
- Typecheck fails only for downstream call sites that still need the required `assetType` field. Those failures are expected before Tasks 2-5 and should be resolved by the end of the plan.

- [ ] **Step 6: Commit Task 1**

```sh
git add packages/shared/src/assetTypes.ts packages/shared/src/assetTypes.test.ts packages/shared/src/types.ts packages/shared/src/index.ts packages/shared/package.json
git commit -m "feat(shared): add asset type taxonomy"
```

## Task 2: Add Type-Specific Cleanup Presets

**Files:**

- Create: `apps/web/src/lib/assetTypePresets.ts`
- Create: `apps/web/src/lib/assetTypePresets.test.ts`
- Modify: `apps/web/src/lib/presets.ts`
- Modify: `apps/web/src/lib/presets.test.ts`

- [ ] **Step 1: Define editor preset shape**

Create `apps/web/src/lib/assetTypePresets.ts` with a pure mapping that does not import React:

```ts
import type { AlphaMode, AssetType, DownscaleMethod } from "@pixelaid/shared";

export type AssetTypeCleanupPreset = {
  maxColors: number;
  downscale: DownscaleMethod;
  alpha: AlphaMode;
  removeOrphans: boolean;
  jaggyCleanup: boolean;
  preserveSinglePixelDetails: boolean;
  removeHalos: boolean;
  denoiseStrength: number;
  lockPaletteAcrossFrames: boolean;
  warningCodes: string[];
};

export function getAssetTypeCleanupPreset(assetType: AssetType): AssetTypeCleanupPreset {
  switch (assetType) {
    case "icon":
      return {
        maxColors: 16,
        downscale: "dominant",
        alpha: "binary",
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 15,
        lockPaletteAcrossFrames: false,
        warningCodes: []
      };
    case "sprite":
      return {
        maxColors: 24,
        downscale: "adaptive",
        alpha: "binary",
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 20,
        lockPaletteAcrossFrames: false,
        warningCodes: []
      };
    case "spriteSheet":
    case "animationSheet":
    case "characterSheet":
      return {
        maxColors: 32,
        downscale: "dominant",
        alpha: "preserve",
        removeOrphans: true,
        jaggyCleanup: true,
        preserveSinglePixelDetails: true,
        removeHalos: true,
        denoiseStrength: 20,
        lockPaletteAcrossFrames: true,
        warningCodes: []
      };
    case "tileset":
      return {
        maxColors: 16,
        downscale: "dominant",
        alpha: "preserve",
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false,
        denoiseStrength: 10,
        lockPaletteAcrossFrames: true,
        warningCodes: ["tileset-seams-inspect-only"]
      };
    case "tilemap":
      return {
        maxColors: 32,
        downscale: "dominant",
        alpha: "preserve",
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: false,
        denoiseStrength: 0,
        lockPaletteAcrossFrames: true,
        warningCodes: ["tilemap-future"]
      };
    case "portrait":
    case "uiElement":
    case "background":
      return {
        maxColors: assetType === "background" ? 64 : 32,
        downscale: "adaptive",
        alpha: "preserve",
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true,
        removeHalos: assetType !== "background",
        denoiseStrength: assetType === "background" ? 0 : 10,
        lockPaletteAcrossFrames: false,
        warningCodes: [`${assetType}-inspect-only`]
      };
  }
}
```

This makes palette locking explicit for sheet workflows without adding palette-lock enforcement to core in this issue. Core already extracts one shared palette for sheet fixes, so the preset documents and preserves that behavior for the editor.

- [ ] **Step 2: Test preset defaults**

Create tests that assert:

- `sprite` and `icon` use `binary` alpha.
- `animationSheet` and `characterSheet` set `lockPaletteAcrossFrames: true`.
- `tileset` keeps `jaggyCleanup` disabled and includes a seam diagnostic warning code.
- `background` uses `preserve` alpha, higher palette budget, and no denoise.

- [ ] **Step 3: Add `assetType` to editor preset state**

In `apps/web/src/lib/presets.ts`, add `assetType: AssetType` to `EditorSettingsState` and import it from shared. Update existing editor presets:

- `single-clean`: `assetType: "sprite"`
- `crisp-icon`: `assetType: "icon"`
- `transparent-sprite`: `assetType: "sprite"`
- `manual-sheet`: `assetType: "spriteSheet"`

Update `presets.test.ts` expected IDs and `applyEditorPreset` input objects with `assetType`.

- [ ] **Step 4: Verify Task 2**

Run:

```sh
npm run test -w @pixelaid/web -- src/lib/assetTypePresets.test.ts src/lib/presets.test.ts
npm run typecheck -w @pixelaid/web
```

Expected:

- New preset tests pass.
- Typecheck may still fail where app state has not yet added `assetType`; those failures are expected before Task 4.

- [ ] **Step 5: Commit Task 2**

```sh
git add apps/web/src/lib/assetTypePresets.ts apps/web/src/lib/assetTypePresets.test.ts apps/web/src/lib/presets.ts apps/web/src/lib/presets.test.ts
git commit -m "feat(web): add asset type cleanup presets"
```

## Task 3: Update Auto Suggest Classification

**Files:**

- Modify: `apps/web/src/lib/fixSuggestions.ts`
- Modify: `apps/web/src/lib/fixSuggestions.test.ts`

- [ ] **Step 1: Extend `FixSettingSuggestion`**

Add these fields:

```ts
assetType: AssetType;
categoryConfidence: number;
categoryReason: string;
categoryWarnings: AssetTypeWarning[];
```

Keep existing `mode`, `modeConfidence`, `confidence`, and `reason` for compatibility with current UI and grid reporting.

- [ ] **Step 2: Add asset-type classification helper**

Add a helper near the existing mode classifier:

```ts
function classifyAssetType(input: {
  mode: AssetMode;
  width: number;
  height: number;
  outputWidth: number;
  outputHeight: number;
  sheetLayoutScore: number;
  sheetLayout?: SheetLayoutDetection;
}): AssetTypeClassification {
  // Heuristic order:
  // 1. High-confidence row/cell sheet -> animationSheet.
  // 2. Generic wide/tall sheet -> spriteSheet.
  // 3. Tile mode -> tileset with inspect-only warning.
  // 4. Small square single asset -> icon.
  // 5. Tall single asset -> portrait.
  // 6. Large landscape single asset -> background.
  // 7. Wide or short single asset -> uiElement.
  // 8. Fallback -> sprite.
}
```

Use `getAssetTypeDefinition` to append default warnings for inspect-only and future categories. Return category-specific reason text such as:

- `Detected repeated frame rows, so animation is represented as sheet frames plus timeline metadata.`
- `Square, evenly divisible source looks like a tileset; seam diagnostics are inspect-only in 0.1.0.`
- `Small near-square native output looks like an icon.`
- `Tall single-image proportions look like a portrait.`

- [ ] **Step 3: Derive processing mode from asset type**

After classification, derive `mode` from `assetTypeToMode(assetType)` unless the existing sheet detector produced a more specific current mode. The important rule is:

- `animationSheet` and `characterSheet` return `mode: "spriteSheet"`.
- `tileset` and `tilemap` return `mode: "tileSheet"`.
- `sprite`, `portrait`, `icon`, `uiElement`, and `background` return `mode: "single"`.

Do not create a new processing mode for animation.

- [ ] **Step 4: Apply cleanup preset defaults inside suggestions**

Use `getAssetTypeCleanupPreset(assetType)` to set default `maxColors`, `downscale`, and `alpha`, while preserving existing image-derived alpha behavior when it is more specific:

- Sprite/icon: binary alpha is the default, but bright opaque single sprites may still use `backgroundFloodFill`.
- Animation/sheet: preserve alpha and shared palette budget.
- Tileset: preserve alpha and conservative cleanup.
- Background/UI/portrait: preserve alpha and preservation-oriented palette budget.

Do not change core processing behavior in this task.

- [ ] **Step 5: Update tests**

Add or update tests in `fixSuggestions.test.ts`:

- Existing `largeAnimationSheetLikeSource()` suggests `assetType: "animationSheet"`, `mode: "spriteSheet"`, `categoryReason` mentions timeline metadata or animation frames, and `categoryConfidence > 0.75`.
- Existing 128x128 blank square suggests `assetType: "tileset"` and has a `tileset-seams-inspect-only` or equivalent warning.
- A 32x32 or 48x48 near-square source suggests `assetType: "icon"` and `alpha: "binary"` or `backgroundFloodFill` if the existing bright-background heuristic applies.
- A tall single source such as 512x768 suggests `assetType: "portrait"` with an inspect-only warning.
- A large 1280x720 single source with no row bands suggests `assetType: "background"` and preservation defaults.
- `suggestion.reason` still includes grid/downscale reasoning, while `categoryReason` explains asset type.

- [ ] **Step 6: Verify Task 3**

Run:

```sh
npm run test -w @pixelaid/web -- src/lib/fixSuggestions.test.ts src/lib/assetTypePresets.test.ts
npm run typecheck -w @pixelaid/web
```

Expected:

- Suggestion tests pass.
- Typecheck may still fail until `App.tsx` consumes the new required fields.

- [ ] **Step 7: Commit Task 3**

```sh
git add apps/web/src/lib/fixSuggestions.ts apps/web/src/lib/fixSuggestions.test.ts
git commit -m "feat(web): classify asset type suggestions"
```

## Task 4: Add Per-Asset Manual Asset-Type Selector in the Editor

**Files:**

- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/lib/assets.ts`
- Modify: `apps/web/src/lib/assets.test.ts`
- Modify: `apps/web/src/lib/guidedFix.ts`
- Modify: `apps/web/src/lib/guidedFix.test.ts`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add per-import asset metadata**

Extend the local `ImportedImageAsset` shape in `apps/web/src/App.tsx` with:

```ts
assetType: AssetType;
assetTypeSource: "auto" | "manual";
assetTypeWarnings: AssetTypeWarning[];
categoryReason: string;
categoryConfidence: number;
```

Each newly imported asset should start as:

```ts
assetType: "sprite",
assetTypeSource: "auto",
assetTypeWarnings: [],
categoryReason: "Auto Suggest will classify the imported asset type.",
categoryConfidence: 0
```

Auto Suggest should update only that imported asset's metadata. If a user manually changes the type, the override should stay with that imported asset when they switch to another asset and come back.

Import `AssetType`, `AssetTypeWarning`, `assetTypeDefinitions`, `assetTypeToMode`, and `getAssetTypeDefinition` from `@pixelaid/shared`, and `getAssetTypeCleanupPreset` from `./lib/assetTypePresets`.

- [ ] **Step 2: Add asset metadata helper tests**

In `apps/web/src/lib/assets.ts`, add pure helpers such as:

```ts
export type AssetTypeMetadata = {
  assetType: AssetType;
  assetTypeSource: "auto" | "manual";
  assetTypeWarnings: AssetTypeWarning[];
  categoryReason: string;
  categoryConfidence: number;
};

export function updateAssetTypeMetadata<TAsset extends AssetLike>(
  assets: readonly TAsset[],
  assetId: string,
  metadata: AssetTypeMetadata
): TAsset[] {
  return assets.map((asset) => (asset.id === assetId ? { ...asset, ...metadata } : asset));
}
```

Add tests that prove updating one imported asset does not change another imported asset. This directly covers the product decision that a character import and a tileset import can keep different type selections.

- [ ] **Step 3: Derive editor state from the selected asset**

In `App.tsx`, derive the active selected asset's type data instead of storing it as a global setting:

```ts
const assetType = selectedAsset?.assetType ?? "sprite";
const assetTypeSource = selectedAsset?.assetTypeSource ?? "auto";
const assetTypeWarnings = selectedAsset?.assetTypeWarnings ?? [];
const categoryReason = selectedAsset?.categoryReason ?? "Auto Suggest will classify the imported asset type.";
const categoryConfidence = selectedAsset?.categoryConfidence ?? 0;
```

- [ ] **Step 4: Respect per-asset manual overrides when applying suggestions**

Update `applyFixSuggestion` so Auto Suggest works like this:

- If the selected asset's `assetTypeSource === "manual"`, keep that asset's manually selected `assetType`, derive `mode` from it, and apply type-specific defaults from the manual type.
- If the selected asset's `assetTypeSource === "auto"`, use `suggestion.assetType`, `suggestion.mode`, and suggestion defaults, then update only the selected asset's stored metadata.
- Always update grid candidates, target size, detected sheet frames, row animations, and confidence from the suggestion.
- Set the reason line to include category confidence, grid confidence, and warnings in concise text.

Recommended helper shape inside `App.tsx`:

```ts
const resolveSuggestionAssetType = (suggestion: FixSettingSuggestion) =>
  assetTypeSource === "manual" ? assetType : suggestion.assetType;
```

When importing a new image, initialize that new asset with Auto classification metadata. Do not overwrite the type metadata for already imported assets.

- [ ] **Step 5: Add manual selector UI**

In the existing `asset` inspector group, add a `SelectField` before the processing `Mode` selector:

- Label: `Asset type`
- Value: `assetType`
- Options from `assetTypeDefinitions.map((definition) => [definition.type, definition.label])`
- On change:
  - Update only the selected imported asset's `assetTypeSource` to `"manual"`.
  - Update only the selected imported asset's `assetType`.
  - Set `mode` to `assetTypeToMode(nextAssetType)`.
  - Apply the cleanup preset values to `maxColors`, `downscale`, `alpha`, `removeOrphans`, `jaggyCleanup`, `preserveSinglePixelDetails`, `removeHalos`, and `denoiseStrength`.
  - Clear detected sheet layout only when the new derived mode is not sheet-like or when switching between `single` and sheet-like modes.
  - Set warnings from the selected definition plus preset warning codes.

Keep the existing `Mode` selector as `Processing mode` or keep the label `Mode` but update the hint so users understand asset type is product intent and mode is the algorithm path. The least risky UI change is to keep the selector but drive it from asset type when manual type changes.

- [ ] **Step 6: Include asset type in fix options**

In `buildFixOptions`, add:

```ts
assetType,
```

next to `mode`. This makes the worker request, result settings, and manifest operation settings serializable with the selected taxonomy.

- [ ] **Step 7: Update guided summary**

Extend `GuidedFixSummaryInput` with:

```ts
assetType: AssetType;
categoryConfidence: number;
warnings: AssetTypeWarning[];
```

Update `getGuidedFixSummary` so:

- Sprite/icon/portrait/UI/background single-image summaries use the asset type label in the title.
- Animation sheets still say animation is represented by frames/timeline metadata.
- Tileset/tilemap/inspect-only warnings appear in metrics as short, scannable strings such as `Inspect-only`.

Update `guidedFix.test.ts` for at least:

- `assetType: "icon"` title.
- `assetType: "animationSheet"` title and frame metrics.
- `assetType: "tileset"` includes inspect-only metric/warning.

- [ ] **Step 8: Style warnings**

Use existing field-note/control-hint patterns in `styles.css`. Add only small scoped styles if necessary, for example:

```css
.asset-type-warning-list {
  display: grid;
  gap: 4px;
  margin: 6px 0 0;
}
```

Do not introduce new visual dependencies.

- [ ] **Step 9: Verify Task 4**

Run:

```sh
npm run test -w @pixelaid/web -- src/lib/assets.test.ts src/lib/guidedFix.test.ts src/lib/fixSuggestions.test.ts src/lib/presets.test.ts
npm run typecheck -w @pixelaid/web
npm run lint
```

Manual verification:

1. Run `npm run dev`.
2. Import a single sprite-like image and confirm Auto Suggest sets `Asset type: Sprite` or `Icon`.
3. Change Asset type manually to `Background`; confirm the selector sticks for that selected asset after pressing Auto Suggest again and cleanup defaults become preservation-oriented.
4. Import a sheet-like image and confirm Auto Suggest selects `Animation sheet` while the processing mode remains sheet-based and the timeline still appears.
5. Switch back to the first imported asset and confirm its manual `Background` setting is still present.
6. Select `Tileset` and confirm the UI shows an inspect-only warning without disabling the existing grid/frame controls.

- [ ] **Step 10: Commit Task 4**

```sh
git add apps/web/src/App.tsx apps/web/src/lib/assets.ts apps/web/src/lib/assets.test.ts apps/web/src/lib/guidedFix.ts apps/web/src/lib/guidedFix.test.ts apps/web/src/styles.css
git commit -m "feat(web): add manual asset type selector"
```

## Task 5: Persist Asset Type in Manifests

**Files:**

- Modify: `packages/exporters/src/manifest.ts`
- Modify: `packages/exporters/src/manifest.test.ts`
- Modify any test fixtures that construct `FixOptions` or `PixelFixResult`.

- [ ] **Step 1: Add manifest meta field**

In `createPixelAssetManifest`, add:

```ts
assetType: options.result.settings.assetType,
```

inside `meta`, near `image` and `palette`.

- [ ] **Step 2: Update validation only if necessary**

Do not add strict validation for unknown asset types if TypeScript already enforces the union. If runtime validation is added, it should use `assetTypeDefinitions` and report `Manifest asset type is invalid`.

- [ ] **Step 3: Update tests and fixture options**

Update all test `FixOptions` objects to include a valid `assetType`:

- Sheet tests: `assetType: "animationSheet"` or `assetType: "spriteSheet"`.
- Single sprite tests: `assetType: "sprite"`.
- Tile sheet tests: `assetType: "tileset"`.

In `manifest.test.ts`, assert:

```ts
expect(manifest.meta.assetType).toBe("animationSheet");
expect(manifest.meta.operation.settings.assetType).toBe("animationSheet");
```

- [ ] **Step 4: Verify Task 5**

Run:

```sh
npm run test -w @pixelaid/exporters
npm run test --workspaces --if-present
npm run typecheck --workspaces --if-present
```

Expected:

- Manifest tests pass.
- Root workspace tests pass.
- Typecheck has no missing `assetType` errors.

- [ ] **Step 5: Commit Task 5**

```sh
git add packages/exporters/src/manifest.ts packages/exporters/src/manifest.test.ts packages/**/src/*.test.ts apps/web/src/**/*.test.ts
git commit -m "feat(exporters): persist asset type in manifests"
```

Use a narrower `git add` command if only a subset of tests changed.

## Task 6: Document Taxonomy and Support Levels

**Files:**

- Modify: `docs/editor.md`
- Modify: `docs/architecture.md`
- Modify: `README.md`
- Modify: `apps/web/src/lib/docsContent.ts` only if a new top-level docs section is added.

- [ ] **Step 1: Update editor docs**

In `docs/editor.md`, update `# Fix Settings` to include:

- Asset type is the user's product intent.
- Processing mode is the algorithm path.
- Animation is represented by sheet/frame metadata and timeline clips, not a separate image-processing mode.
- The support matrix from this plan.
- Inspect-only categories still allow preview/fix/export through generic PNG/manifest, but lack specialized diagnostics/exporters.

Keep the docs concise enough to fit the in-app docs panel.

- [ ] **Step 2: Update architecture docs**

In `docs/architecture.md`, update Data Flow steps 4 and 17:

- Auto Suggest classifies `AssetType`, returns confidence/reason/warnings, and derives `AssetMode`.
- The editor stores manual asset-type overrides per imported asset in serializable settings.
- Export manifests include both `meta.assetType` and `meta.operation.settings.assetType`.

- [ ] **Step 3: Update README**

Update:

- Current Workflow: mention Auto Suggest classification and manual Asset type override.
- Implemented Features: mention taxonomy, support warnings, and manifest persistence.
- Known Limitations: mention tileset seam diagnostics, tilemap import/export, and specialized portrait/UI/background export remain outside 0.1.0 full support.
- Roadmap: keep seam diagnostics and tilemap metadata in the tileset/exporter milestones.

- [ ] **Step 4: Verify Task 6**

Run:

```sh
npm run test -w @pixelaid/web -- src/lib/docsContent.test.ts
npm run lint
```

Manual verification:

1. Run `npm run dev`.
2. Open `/docs#fix-settings`.
3. Confirm taxonomy and support text appears.
4. Confirm editor tooltips still link to valid docs sections.

- [ ] **Step 5: Commit Task 6**

```sh
git add docs/editor.md docs/architecture.md README.md apps/web/src/lib/docsContent.ts
git commit -m "docs(web): document asset type taxonomy"
```

Do not stage `apps/web/src/lib/docsContent.ts` if it was not modified.

## Task 7: Final Full Verification

**Files:**

- No planned source changes unless verification exposes a defect.

- [ ] **Step 1: Run full automated verification**

Run:

```sh
npm run test --workspaces --if-present
npm run typecheck --workspaces --if-present
npm run lint
npm run build
```

Expected:

- All tests pass.
- TypeScript has no errors.
- ESLint has zero warnings.
- Build succeeds.

- [ ] **Step 2: Manual editor smoke test**

Run:

```sh
npm run dev
```

Verify:

- Import still decodes and analyzes an image.
- Asset type selector appears in the Asset inspector group.
- Auto Suggest displays category confidence and reason text.
- Manual type override persists through another Auto Suggest on the same selected asset.
- Switching between imported assets restores each asset's own asset-type selection and warnings.
- Running Fix sends `assetType` in the worker settings and completes.
- Exported JSON contains `meta.assetType` and `meta.operation.settings.assetType`.
- Sheet-like asset types still enable the timeline; single-image asset types keep timeline hidden.
- Canvas preview remains pixel-perfect with `imageSmoothingEnabled = false`; MIG-5 should not change canvas rendering.

- [ ] **Step 3: Check dependency and hot-loop constraints**

Confirm:

- No new dependency was added.
- No pixel-processing hot loop was modified for taxonomy-only behavior.
- No React nodes were introduced to render individual pixels.
- Worker/core still receive serializable settings only.

- [ ] **Step 4: Final semantic checkpoint**

If verification required small fixes, commit them with the narrowest semantic message, for example:

```sh
git commit -m "fix(web): preserve manual asset type overrides"
```

If no fixes were needed, do not create an empty commit.

## Test Command Summary

Focused commands:

```sh
npm run test -w @pixelaid/shared
npm run test -w @pixelaid/web -- src/lib/fixSuggestions.test.ts src/lib/assetTypePresets.test.ts src/lib/guidedFix.test.ts src/lib/presets.test.ts
npm run test -w @pixelaid/exporters
```

Full commands:

```sh
npm run test --workspaces --if-present
npm run typecheck --workspaces --if-present
npm run lint
npm run build
```

Manual commands:

```sh
npm run dev
```

## Open Questions Before Implementation

1. Resolved: manual asset-type overrides are stored per imported asset. A character import and a tileset import can keep different type selections, and switching between imported assets should restore each asset's own classification state.
2. Resolved: keep `characterSheet` in `AssetMode` during MIG-5 to reduce migration risk. Create a follow-up Linear issue to remove or collapse it later after taxonomy and sheet workflows stabilize.
3. Resolved: `tileset` is inspect-only in 0.1.0 because seam diagnostics and tile metadata are future work.
4. Resolved: `portrait`, `uiElement`, and `background` should be selectable immediately with clear inspect-only/preservation-oriented warnings.

## Completion Criteria

MIG-5 is complete when:

- `AssetType` is a shared serializable contract.
- `FixOptions` and exported manifests include the selected asset type.
- Auto Suggest returns asset type, category confidence, reason text, and type-specific warnings.
- The editor has a manual Asset type selector that can override Auto Suggest.
- Manual Asset type overrides are scoped to each imported asset, not global editor state.
- Animation remains represented by sheet/frame/timeline metadata rather than a new processing mode.
- Type-specific cleanup presets are tested and applied.
- Docs clearly distinguish full support, inspect-only, and future milestone categories.
- Full tests, typecheck, lint, and build pass.

## Next Best Prompt

After user confirmation, the next best prompt is:

`Implement Task 1 from docs/superpowers/plans/2026-04-27-mig-5-asset-taxonomy.md, commit it semantically, and stop for review before Task 2.`
