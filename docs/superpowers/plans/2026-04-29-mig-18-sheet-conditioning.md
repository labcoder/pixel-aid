# MIG-18 Sprite Sheet Source Conditioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve AI sprite-sheet output quality by diagnosing presentation-style/high-color sheets and making Auto Suggest prefer a frame-first source-conditioning path that preserves full frame cells before final cleanup and palette locking.

**Architecture:** Add deterministic core diagnostics for sheet conditioning, improve sheet detection so bordered/presentation sheets produce full-cell source rects instead of tight content-only rects, and surface the recommendation in the web inspector through existing Auto Suggest warning flows. The current frame-aware `fixImage` path already processes frames independently; MIG-18 will feed it better source rectangles and explain when conditioning is recommended.

**Tech Stack:** TypeScript, Vitest, Vite/React, existing `packages/core`, `packages/shared`, and `apps/web` contracts.

---

## File Structure

- Modify `packages/shared/src/types.ts`
  - Add sheet-conditioning diagnostics types and attach them to `SheetLayoutDiagnostics`.
- Modify `packages/shared/src/index.ts`
  - Export new diagnostics types.
- Create `packages/core/src/sheetConditioning.ts`
  - Own high-color/presentation-sheet diagnostics and recommendation logic.
- Create `packages/core/src/sheetConditioning.test.ts`
  - Cover high-color sheets, footer/label/border signals, and non-problem sheets.
- Modify `packages/core/src/sheet.ts`
  - Use conditioning diagnostics in `detectSheetLayout`.
  - Ignore footer-only bands.
  - Detect full outlined cells from separator lines even when sprite content is disconnected.
  - Preserve detected full cell boxes as `sourceRect`.
- Modify `packages/core/src/core.test.ts`
  - Add focused sheet-layout tests for footer exclusion and full-cell source rects.
- Modify `packages/core/src/index.ts`
  - Export the conditioning analyzer.
- Modify `apps/web/src/lib/fixSuggestions.ts`
  - Call the conditioning analyzer.
  - Add recommendation warnings/reason text when frame-first conditioning is useful.
- Modify `apps/web/src/lib/fixSuggestions.test.ts`
  - Cover recommendation behavior.
- Modify `docs/editor.md`
  - Document source conditioning, frame-first handling, and final palette locking order.
- Modify `docs/architecture.md`
  - Document where source conditioning sits before frame extraction/fix/export.

---

## Task 1: Core Sheet Conditioning Diagnostics

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/core/src/sheetConditioning.ts`
- Create: `packages/core/src/sheetConditioning.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing diagnostics tests**

Add `packages/core/src/sheetConditioning.test.ts` with tests for:
- high exact color count and coarse palette density producing `recommendFrameFirst: true`
- opaque dark background plus low foreground coverage producing `presentationLike: true`
- simple low-color native sheet producing `recommendFrameFirst: false`

Run:

```powershell
npm run test -w @pixelaid/core -- sheetConditioning.test.ts
```

Expected: FAIL because `analyzeSheetConditioning` is not exported.

- [ ] **Step 2: Add shared diagnostic types**

Add:

```ts
export type SheetConditioningIssueCode =
  | "excessive-exact-colors"
  | "dense-coarse-palette"
  | "opaque-dark-background"
  | "low-foreground-coverage"
  | "footer-like-band"
  | "outlined-cell-grid";

export type SheetConditioningIssue = {
  code: SheetConditioningIssueCode;
  severity: DiagnosticSeverity;
  message: string;
};

export type SheetConditioningDiagnostics = {
  exactColorCount: number;
  coarseColorBinCount: number;
  foregroundPixelRatio: number;
  background: { r: number; g: number; b: number; a: number };
  presentationLike: boolean;
  recommendFrameFirst: boolean;
  issues: SheetConditioningIssue[];
};
```

Attach `conditioning?: SheetConditioningDiagnostics` to `SheetLayoutDiagnostics` and export the types from `packages/shared/src/index.ts`.

- [ ] **Step 3: Implement analyzer**

Create `analyzeSheetConditioning(image: RGBAImage, options?: { maxExactColors?: number; maxCoarseBins?: number }): SheetConditioningDiagnostics`.

Implementation notes:
- sample corners for background
- count exact RGBA colors
- count 5-bit coarse RGB bins for foreground pixels
- compute foreground ratio using the same distance threshold as sheet detection
- flag `recommendFrameFirst` when exact colors exceed `4096`, coarse bins exceed `96`, or presentation-like background/coverage signals are present

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/core -- sheetConditioning.test.ts
npm run typecheck -w @pixelaid/shared
npm run typecheck -w @pixelaid/core
git add packages/shared/src/types.ts packages/shared/src/index.ts packages/core/src/sheetConditioning.ts packages/core/src/sheetConditioning.test.ts packages/core/src/index.ts
git commit -m "feat(core): add sheet conditioning diagnostics"
```

---

## Task 2: Full-Cell Detection And Footer Exclusion

**Files:**
- Modify: `packages/core/src/sheet.ts`
- Modify: `packages/core/src/core.test.ts`

- [ ] **Step 1: Write failing layout tests**

Add tests that build a synthetic presentation sheet with:
- two animation rows
- left labels
- full cell borders
- dark background
- one footer text band near the bottom

Assertions:
- detected rows exclude the footer band
- detected frames use full cell `sourceRect`s, not tight sprite/content bounds
- row frame counts match visible cells

Run:

```powershell
npm run test -w @pixelaid/core -- core.test.ts
```

Expected: FAIL because footer bands are included or full cells are not recovered.

- [ ] **Step 2: Improve footer filtering**

In `detectSheetLayout`, filter resolved rows with footer-like geometry:
- band starts after `image.height * 0.85`
- band height is less than `0.45` of median candidate row height
- row lacks frame-like repeated cells

- [ ] **Step 3: Detect full outlined cells from separator lines**

Add a separator-line path that scans the entire row band for near-full-height vertical separators and builds cells from adjacent separators. This path should not depend on an existing wide source segment, because AI sheets often have disconnected sprite/content islands inside bordered cells.

- [ ] **Step 4: Preserve full source cells**

When outlined cells are detected, create frame records where:
- `rect` remains the detected layout rect initially
- `sourceRect` is the full source cell
- packed native rects later become the clean output grid through existing `scaleSheetLayoutDetection`

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/core -- core.test.ts
npm run typecheck -w @pixelaid/core
git add packages/core/src/sheet.ts packages/core/src/core.test.ts
git commit -m "fix(core): preserve full cells in presentation sheets"
```

---

## Task 3: Auto Suggest Recommendation Flow

**Files:**
- Modify: `apps/web/src/lib/fixSuggestions.ts`
- Modify: `apps/web/src/lib/fixSuggestions.test.ts`

- [ ] **Step 1: Write failing recommendation tests**

Add a synthetic high-color bordered animation sheet fixture in `fixSuggestions.test.ts`.

Assertions:
- `suggestFixSettings` returns `assetType: "animationSheet"`
- `categoryWarnings` contains code `sheet-conditioning-recommended`
- `reason` mentions frame-first conditioning or source conditioning
- `sheetLayout` is present and includes conditioning diagnostics

Run:

```powershell
npm run test -w @pixelaid/web -- fixSuggestions.test.ts
```

Expected: FAIL because suggestions do not yet call the conditioning analyzer or emit the warning.

- [ ] **Step 2: Add recommendation warning**

Call `analyzeSheetConditioning(image)` inside `suggestFixSettings`.

When `mode === "spriteSheet"` and `diagnostics.recommendFrameFirst`:
- append warning:

```ts
{
  code: "sheet-conditioning-recommended",
  severity: "warning",
  message: "This sheet looks like a high-color presentation layout. Use frame-first source conditioning before final palette locking."
}
```

- include the diagnostic in `sheetLayout.diagnostics.conditioning`
- extend reason text with the recommendation

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/web -- fixSuggestions.test.ts
npm run typecheck -w @pixelaid/web
git add apps/web/src/lib/fixSuggestions.ts apps/web/src/lib/fixSuggestions.test.ts
git commit -m "feat(web): recommend sheet source conditioning"
```

---

## Task 4: Documentation And Roadmap Notes

**Files:**
- Modify: `docs/editor.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Update docs**

Document this order:

```text
Import -> Source Conditioning Diagnostics -> Frame Extraction -> Frame-First Fix -> Shared Palette Lock -> Export
```

Explain that analysis cleanup is not destructive, and final palette locking still happens after frame extraction so animation palettes remain stable.

- [ ] **Step 2: Verify docs route still loads**

Run:

```powershell
npm run test -w @pixelaid/web -- docsContent.test.ts
git add docs/editor.md docs/architecture.md
git commit -m "docs(core): explain sheet source conditioning"
```

---

## Task 5: Full Verification And Manual Probe

**Files:**
- No planned source edits unless verification finds a defect.

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm run typecheck
npm run test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 2: Run local dev smoke**

Run Vite from the web workspace on an unused port and confirm HTTP 200:

```powershell
npm run dev -w @pixelaid/web -- --host 127.0.0.1 --port 5180
```

- [ ] **Step 3: Manual imported-image check**

Import:

```text
C:/Users/oms10/Downloads/ChatGPT Image Apr 24, 2026, 02_56_08 PM.png
```

Expected:
- Auto Suggest classifies it as an animation sheet.
- Asset warning recommends source conditioning/frame-first handling.
- Detected frame boxes exclude labels/footer text.
- Frame-first output preserves sprite scale/placement better than the prior tight-content result.

- [ ] **Step 4: Update Linear and merge**

Add a Linear comment to `MIG-18`, mark it Done, then fast-forward merge into `codex/pixelaid-roadmap-foundation`.

---

## Self-Review

- Spec coverage: diagnostics, recommendation, frame geometry, docs, and verification are covered.
- Placeholder scan: no implementation step relies on TBD placeholders.
- Type consistency: shared diagnostics are exported before core and web use them.
- Risk: this plan improves the current frame-first path by fixing detection and recommendation. A later issue can add a richer dual-output UI with side-by-side Clean Source vs Final Output if we want that as a full product surface.
