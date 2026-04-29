# MIG-19 Sprite Sheet Output Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve fixed sprite-sheet frame quality for AI presentation sheets where the detected cell grid is good but the final per-frame output loses thin lines, facial features, and readable silhouette details.

**Architecture:** Add a deterministic detail-preserving downscale mode in `packages/core`, then make sheet-conditioning recommendations prefer that mode for high-color AI sheets. Keep this phase focused on output quality; manual row/cell correction, Timeline viewport playback, safer frame dragging, and undo/redo remain in MIG-20 through MIG-23.

**Tech Stack:** TypeScript, Vitest, Vite/React, existing `packages/core`, `packages/shared`, and `apps/web` contracts.

---

## File Structure

- Modify `packages/shared/src/types.ts`
  - Add the new downscale method to the shared serializable option union.
- Modify `packages/core/src/downsample.ts`
  - Add detail-preserving block selection for source blocks with minority high-contrast line/detail clusters.
- Modify `packages/core/src/core.test.ts`
  - Add regression coverage showing thin dark details survive high-color block conversion.
- Modify `apps/web/src/lib/assetTypePresets.ts`
  - Keep sheet defaults aligned with the higher-quality path where appropriate.
- Modify `apps/web/src/lib/fixSuggestions.ts`
  - Make high-color/presentation sheet recommendations prefer the detail-preserving downscale.
- Modify `apps/web/src/lib/fixSuggestions.test.ts`
  - Cover the Auto Suggest default for complex sheets.
- Modify `apps/web/src/App.tsx`
  - Expose the new downscale option in the inspector.
- Modify `docs/editor.md`
  - Document the sheet quality mode and when users should choose it.

---

## Task 1: Detail-Preserving Core Downscale

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/core/src/downsample.ts`
- Modify: `packages/core/src/core.test.ts`

- [x] **Step 1: Write failing core regression**

Add a test that builds a noisy pseudo-pixel source block where a minority high-contrast dark detail line should survive conversion. Call `downsampleBlocks` with the new detail-preserving method and assert the output keeps the dark detail instead of replacing it with the dominant fill.

Run:

```powershell
npm run test -w @pixelaid/core -- core.test.ts
```

Expected: FAIL because the method is not implemented.

- [x] **Step 2: Implement detail-preserving method**

Add a shared downscale method named `detailPreserving`.

Implementation requirements:
- Preserve existing dominant/median/adaptive behavior.
- Choose a minority detail cluster only when it has enough coverage and strong luminance/chroma contrast against the dominant fill.
- Ignore transparent pixels for RGB detail selection.
- Avoid obvious one-pixel noise wins by requiring either meaningful support or line-like block coverage.
- Keep algorithm options serializable.

- [x] **Step 3: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/core -- core.test.ts
npm run typecheck -w @pixelaid/shared
npm run typecheck -w @pixelaid/core
```

Commit:

```powershell
git add packages/shared/src/types.ts packages/core/src/downsample.ts packages/core/src/core.test.ts
git commit -m "feat(core): preserve fine details when downscaling sheet frames"
```

---

## Task 2: Sheet Recommendation and Inspector Wiring

**Files:**
- Modify: `apps/web/src/lib/assetTypePresets.ts`
- Modify: `apps/web/src/lib/fixSuggestions.ts`
- Modify: `apps/web/src/lib/fixSuggestions.test.ts`
- Modify: `apps/web/src/App.tsx`

- [x] **Step 1: Write failing web recommendation tests**

Update `fixSuggestions` coverage so a high-color presentation sheet gets `detailPreserving` as the recommended downscale method.

Run:

```powershell
npm run test -w @pixelaid/web -- fixSuggestions.test.ts
```

Expected: FAIL until recommendation wiring is updated.

- [x] **Step 2: Wire UI defaults**

Implementation requirements:
- Include `detailPreserving` in the inspector downscale select.
- Prefer it for sheet/animation asset types when conditioning diagnostics say frame-first cleanup is recommended.
- Keep non-sheet sprite presets conservative unless tests show a clear benefit.

- [x] **Step 3: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/web -- fixSuggestions.test.ts
npm run typecheck -w @pixelaid/web
```

Commit:

```powershell
git add apps/web/src/lib/assetTypePresets.ts apps/web/src/lib/fixSuggestions.ts apps/web/src/lib/fixSuggestions.test.ts apps/web/src/App.tsx
git commit -m "feat(web): recommend detail-preserving sheet fixes"
```

---

## Task 3: Documentation and Full Verification

**Files:**
- Modify: `docs/editor.md`
- Optional: `docs/architecture.md` if implementation changes pipeline ordering.

- [x] **Step 1: Document user-facing behavior**

Explain that complex AI sprite sheets may need detail-preserving frame conversion before palette locking, and that this mode is slower but better at preserving readable lines and features.

- [x] **Step 2: Full verification**

Run:

```powershell
npm run typecheck
npm run test
npm run lint
npm run build
```

- [x] **Step 3: Commit docs and update Linear**

Commit:

```powershell
git add docs/editor.md docs/architecture.md
git commit -m "docs(web): document detail-preserving sheet fixes"
```

Then update MIG-19 with verification notes and move it to Done if checks pass.

---

## Follow-On Issues

- MIG-20: manual row and cell correction tools.
- MIG-21: Timeline viewport sprite player with input/output comparison.
- MIG-22: modifier-gated frame overlay editing.
- MIG-23: undo/redo for sprite-sheet frame edits.
