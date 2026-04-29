# MIG-20 Manual Sprite Sheet Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual row and cell correction tools for detected sprite sheets so users can repair missed, extra, or misdetected animation cells without rerunning detection.

**Architecture:** Keep auto-detection as the starting point, then layer deterministic edit operations over the existing `SpriteFrame[]` and `AnimationTag[]` model. New pure helpers will insert/remove frames and rows, preserve source rectangles, keep animation membership consistent, and repack output rows through the existing `repackAnimationRows` path. The React UI will expose small correction controls in the Frame / Cell inspector and use existing viewport selection/highlight behavior.

**Tech Stack:** TypeScript, React, Vite, Vitest, existing PixelAid shared/core/web packages.

---

## File Structure

- Create `apps/web/src/lib/sheetManualEditing.ts`
  - Pure operations for inserting/removing detected cells and rows.
- Create `apps/web/src/lib/sheetManualEditing.test.ts`
  - Unit tests for frame insertion/removal, row insertion/removal, naming, selection, and repacking.
- Modify `apps/web/src/App.tsx`
  - Add manual correction handlers and inspector controls.
- Modify `docs/editor.md`
  - Document manual correction behavior.
- Optional modify `apps/web/src/index.css`
  - Small styling for compact correction controls if existing classes are not sufficient.

---

## Task 1: Pure Manual Cell Editing Helpers

**Files:**
- Create `apps/web/src/lib/sheetManualEditing.ts`
- Create `apps/web/src/lib/sheetManualEditing.test.ts`

- [x] **Step 1: Write failing tests for cell insertion/removal**

Add `sheetManualEditing.test.ts` with fixtures:

```ts
const frames = [
  frame("row_1_000", "row_1", { x: 0, y: 0, w: 64, h: 64 }, { x: 100, y: 20, w: 128, h: 128 }),
  frame("row_1_001", "row_1", { x: 64, y: 0, w: 64, h: 64 }, { x: 228, y: 20, w: 128, h: 128 }),
  frame("row_2_000", "row_2", { x: 0, y: 64, w: 64, h: 64 }, { x: 100, y: 180, w: 128, h: 128 })
];

const animations = [
  { name: "row_1", frameNames: ["row_1_000", "row_1_001"], loop: true, fps: 8, direction: "forward" },
  { name: "row_2", frameNames: ["row_2_000"], loop: true, fps: 8, direction: "forward" }
];
```

Test cases:
- `insertFrameNearSelection(..., placement: "before")` inserts a new unique frame before the selected frame in that row.
- `insertFrameNearSelection(..., placement: "after")` inserts after the selected frame and selects the inserted frame.
- `removeFrameAtSelection(...)` removes the selected frame, removes its name from the animation, repacks the row, and selects the nearest remaining frame.
- Removing the last frame in a row removes that row animation.

Run:

```powershell
npm run test -w @pixelaid/web -- sheetManualEditing.test.ts
```

Expected: FAIL because the module does not exist.

- [x] **Step 2: Implement cell helpers**

Create:

```ts
export type ManualSheetEditResult = {
  frames: SpriteFrame[];
  animations: AnimationTag[];
  selectedFrameIndex: number;
  selectedAnimationName: string;
};

export function insertFrameNearSelection(input: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  selectedFrameIndex: number;
  placement: "before" | "after";
  margin: number;
  spacing: number;
  scaleX: number;
  scaleY: number;
  sourceSize: { width: number; height: number };
}): ManualSheetEditResult;

export function removeFrameAtSelection(input: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  selectedFrameIndex: number;
  margin: number;
  spacing: number;
}): ManualSheetEditResult;
```

Implementation rules:
- Find the row by selected frame name or tag.
- Generate unique names like `row_6_007` by scanning all existing frame names.
- Copy duration, pivot, size, and tags from the selected frame.
- Shift the new source rect left/right by one source cell width and clamp inside source bounds.
- Repack through `repackAnimationRows`.
- Return a stable selected frame index for the inserted/nearest remaining frame.

- [x] **Step 3: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/web -- sheetManualEditing.test.ts
npm run typecheck -w @pixelaid/web
```

Commit:

```powershell
git add apps/web/src/lib/sheetManualEditing.ts apps/web/src/lib/sheetManualEditing.test.ts
git commit -m "feat(web): add manual sheet cell edit helpers"
```

---

## Task 2: Pure Manual Row Editing Helpers

**Files:**
- Modify `apps/web/src/lib/sheetManualEditing.ts`
- Modify `apps/web/src/lib/sheetManualEditing.test.ts`

- [x] **Step 1: Write failing row tests**

Add tests for:
- `insertRowNearSelection(..., placement: "before")` creates a new row above the selected row with one frame copied from the selected row's first frame dimensions.
- `insertRowNearSelection(..., placement: "after")` creates a new row below and selects its first frame.
- `removeRowAtSelection(...)` removes all row frames and selects the nearest remaining row.
- Row names are unique (`row_7`, `row_8`, etc.) and frame tags match the new row.

Run:

```powershell
npm run test -w @pixelaid/web -- sheetManualEditing.test.ts
```

Expected: FAIL because row helpers are not implemented.

- [x] **Step 2: Implement row helpers**

Add:

```ts
export function insertRowNearSelection(input: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  selectedAnimationName: string;
  placement: "before" | "after";
  margin: number;
  spacing: number;
  scaleX: number;
  scaleY: number;
  sourceSize: { width: number; height: number };
}): ManualSheetEditResult;

export function removeRowAtSelection(input: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  selectedAnimationName: string;
  margin: number;
  spacing: number;
}): ManualSheetEditResult;
```

Implementation rules:
- New rows start with one frame so the user has a draggable source box to adjust.
- Copy row timing defaults from the selected row when available.
- Place the new source rect one row above/below the template row and clamp to the image.
- Repack all rows after insertion/removal.
- Do not allow the final row to be removed; return unchanged state if it would leave zero rows.

- [x] **Step 3: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/web -- sheetManualEditing.test.ts
npm run typecheck -w @pixelaid/web
```

Commit:

```powershell
git add apps/web/src/lib/sheetManualEditing.ts apps/web/src/lib/sheetManualEditing.test.ts
git commit -m "feat(web): add manual sheet row edit helpers"
```

---

## Task 3: Inspector Controls and State Wiring

**Files:**
- Modify `apps/web/src/App.tsx`
- Optional modify `apps/web/src/index.css`

- [x] **Step 1: Add failing App-level coverage if existing harness supports it**

If there is no component-level harness for `App.tsx`, keep this step manual and rely on pure helper tests plus Playwright verification in Task 4.

Check:

```powershell
Get-ChildItem apps\web\src -Recurse -Filter *.test.tsx
```

Expected: likely no App component harness.

- [x] **Step 2: Wire manual correction callbacks**

In `App.tsx`, import:

```ts
import {
  insertFrameNearSelection,
  insertRowNearSelection,
  removeFrameAtSelection,
  removeRowAtSelection
} from "./lib/sheetManualEditing";
```

Add callbacks:
- `addCellBeforeSelected`
- `addCellAfterSelected`
- `removeSelectedCell`
- `addRowBeforeSelected`
- `addRowAfterSelected`
- `removeSelectedRow`

Each callback must:
- return early if `selectedAsset` is missing or no detected frames exist
- call the relevant pure helper
- update `detectedSheetFrames`, `detectedRowAnimations`, `selectedFrameIndex`, and `selectedAnimationName`
- clear `fixResult`
- pause playback
- append a concise log line

- [x] **Step 3: Add inspector controls**

In the Frame / Cell group, below detection notes and above per-animation cell size controls, add a compact correction panel shown only when `detectedSheetFrames.length > 0 && detectedRowAnimations.length > 0`.

Controls:
- `Add cell before`
- `Add cell after`
- `Remove cell`
- `Add row above`
- `Add row below`
- `Remove row`

Disable:
- all controls while no frame/row is selected
- `Remove row` when only one row remains
- `Remove cell` when no selected frame exists

Suggested copy:

```tsx
<div className="manual-sheet-corrections" aria-label="Manual sheet correction tools">
  <strong>Manual corrections</strong>
  <div className="button-grid compact">
    ...
  </div>
  <small>Add missing cells before/after the selected frame, then drag or resize the new source box in the Input view.</small>
</div>
```

- [x] **Step 4: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- sheetManualEditing.test.ts
```

Commit:

```powershell
git add apps/web/src/App.tsx apps/web/src/index.css
git commit -m "feat(web): add manual sheet correction controls"
```

---

## Task 4: Browser Verification With Real Sheet

**Files:**
- No production file changes expected.

- [ ] **Step 1: Start or reuse dev server**

Run from the MIG-20 worktree:

```powershell
npm run dev -w @pixelaid/web -- --host 127.0.0.1 --port 5174
```

Use another port if occupied.

- [ ] **Step 2: Verify manual correction flow**

Using the attached robot sheet:

```txt
C:/Users/oms10/Downloads/ChatGPT Image Apr 24, 2026, 02_56_08 PM.png
```

Manual checks:
- Import sheet and confirm detected row count/cell count appears.
- Select row 6 first visible frame, click Add cell before, confirm row 6 frame count increases by one and the new frame is selected.
- Select row 6 last visible frame, click Add cell after, confirm row 6 frame count increases again.
- Drag/resize a new cell source box in Input view and confirm output derived size remains consistent.
- Remove an added cell and confirm frame count decreases.
- Add a row below a selected row, then remove it.
- Run Fix and confirm output uses corrected frames.

- [ ] **Step 3: Capture verification notes**

Add concise notes to the final response and Linear MIG-20 comment. If a Playwright script is practical, save the browser-observed text output in the working notes, not as a committed artifact.

---

## Task 5: Docs and Full Verification

**Files:**
- Modify `docs/editor.md`
- Modify this plan checklist.

- [ ] **Step 1: Document manual correction tools**

In `docs/editor.md`, update Frame / Cell and Viewport sections:
- users can add cells before/after selected frames
- users can add rows above/below selected clips
- new source boxes are approximate and should be dragged/resized in Input view
- corrections update timeline clips and export metadata

- [ ] **Step 2: Full verification**

Run:

```powershell
npm run typecheck
npm run test
npm run lint
npm run build
```

- [ ] **Step 3: Commit, update Linear, merge**

Commit docs and completed plan:

```powershell
git add docs/editor.md docs/superpowers/plans/2026-04-29-mig-20-manual-sheet-correction.md
git commit -m "docs(web): document manual sheet correction tools"
```

Then:
- move MIG-20 to Done if verification passes
- add verification notes to MIG-20
- fast-forward merge `codex/mig-20-manual-sheet-cells` into `codex/pixelaid-roadmap-foundation`

---

## Self-Review

- Spec coverage: covers manual add/remove cells and rows, including missed first/last cells in row 6.
- Test coverage: pure edit helpers are tested; App wiring is typechecked and browser-verified.
- Parallelization: Task 1 and Task 2 are related and should stay serial. Task 5 docs can be parallelized only after UI behavior lands.
- Deferred: safer drag behavior and undo/redo stay in MIG-22 and MIG-23.
