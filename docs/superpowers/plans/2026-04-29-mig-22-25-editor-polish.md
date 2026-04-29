# MIG-22 To MIG-25 Editor Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining launch-polish issues: safer sheet frame editing, undo/redo, outline source color control, and reliable repeated import/fix busy feedback.

**Architecture:** Keep pixel algorithms pure and tested in `packages/core`, keep UI orchestration in `apps/web/src/App.tsx`, and add small focused helpers for intent, history, outline suggestions, and busy-state behavior. The phase runs serially in one local worktree because MIG-22, MIG-23, and MIG-25 all touch the viewport/App state boundary.

**Tech Stack:** React, TypeScript, Canvas2D, Vite, Vitest, existing worker/core/exporter packages, Linear.

---

## Current Baseline

- Worktree: `C:/dev/Mighty/pixel-aid/.worktrees/mig-22-25-editor-polish`
- Branch: `codex/mig-22-25-editor-polish`
- Base: `codex/pixelaid-roadmap-foundation` at `4c6ab0d`

---

## Files And Responsibilities

- `apps/web/src/lib/frameEditIntent.ts`
  - Pure helper for deciding whether a pointer action should select, pan, move, or resize a source frame.
- `apps/web/src/lib/frameEditIntent.test.ts`
  - Unit tests for modifier-gated frame editing behavior.
- `apps/web/src/components/ViewportCanvas.tsx`
  - Use frame edit intent, require Ctrl/Cmd for move/resize, expose completed edit callbacks, and keep normal dragging as pan.
- `apps/web/src/lib/frameEditHistory.ts`
  - Pure undo/redo stack for detected sheet frames, row animations, selected frame, and selected animation.
- `apps/web/src/lib/frameEditHistory.test.ts`
  - Unit tests for push, undo, redo, reset, and redo clearing.
- `apps/web/src/App.tsx`
  - Wire history, undo/redo UI, keyboard shortcuts, outline picker state, and busy-state updates.
- `packages/shared/src/types.ts`
  - Add outline source-color settings to `FixOptions.cleanup`.
- `packages/core/src/outline.ts`
  - Detect likely outline colors and use a selected outline source color group during repair/add.
- `packages/core/src/core.test.ts`
  - Add multi-color outline detection and repair tests.
- `packages/core/src/fix.ts`
  - Pass selected outline source settings into outline cleanup.
- `packages/core/src/index.ts`
  - Export outline candidate helpers if needed by the web UI.
- `apps/web/src/lib/outlineControls.ts`
  - UI helper functions for outline source selection and color groups.
- `apps/web/src/lib/outlineControls.test.ts`
  - Tests for outline source selection behavior.
- `apps/web/src/lib/busyStatus.ts`
  - Pure helpers for operation-aware busy status labels and visibility.
- `apps/web/src/lib/busyStatus.test.ts`
  - Tests for repeated import/fix status behavior.
- `apps/web/src/styles.css`
  - Styles for undo/redo controls, modifier hint, outline swatches, and busy details.
- `docs/editor.md`
  - Document modifier-gated frame editing, undo/redo, outline source colors, and repeated busy feedback.

---

## Task 0: Baseline And Linear Start

- [x] **Step 1: Mark issues In Progress**

Update Linear issues `MIG-22`, `MIG-23`, `MIG-24`, and `MIG-25` to `In Progress`.

- [x] **Step 2: Run baseline checks**

Run:

```powershell
npm run typecheck
npm run test -w @pixelaid/web -- frameEditing.test.ts outlineControls.test.ts
npm run test -w @pixelaid/core -- core.test.ts
```

Expected: all pass before implementation.

- [x] **Step 3: Commit this plan**

Run:

```powershell
git add docs/superpowers/plans/2026-04-29-mig-22-25-editor-polish.md
git commit -m "docs(web): plan editor polish phase"
```

---

## Task 1: MIG-22 Modifier-Gated Frame Editing

- [ ] **Step 1: Add failing intent tests**

Create `apps/web/src/lib/frameEditIntent.test.ts` with tests that assert:

- unmodified pointer over a frame selects but starts panning;
- Ctrl/Cmd over the selected frame starts move;
- Ctrl/Cmd over the selected frame handle starts resize;
- Ctrl/Cmd over an unselected frame only selects, so the next modified drag edits it;
- resize handles are only considered for the selected frame.

- [ ] **Step 2: Run failing tests**

Run:

```powershell
npm run test -w @pixelaid/web -- frameEditIntent.test.ts frameEditing.test.ts
```

Expected: fail because `frameEditIntent.ts` does not exist.

- [ ] **Step 3: Implement `frameEditIntent.ts`**

Create the helper with:

```ts
export type FrameEditIntent = "pan" | "select" | "move" | "resize";

export function hasFrameEditModifier(input: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return input.ctrlKey || input.metaKey;
}
```

and a resolver that receives `frameIndex`, `resizeHit`, `selectedFrameIndex`, and modifier state.

- [ ] **Step 4: Wire `ViewportCanvas`**

Modify `ViewportCanvas` so:

- unmodified frame pointer down calls `onFrameSelect` and starts `dragRef` pan;
- Ctrl/Cmd only edits if the hit frame is already selected;
- resize hit testing is scoped to `[sourceFrames[selectedFrameIndex]]`;
- move/resize completion calls new optional callbacks `onSourceFrameEditStart` and `onSourceFrameEditCommit`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/web -- frameEditIntent.test.ts frameEditing.test.ts
npm run typecheck -w @pixelaid/web
```

Commit:

```powershell
git add apps/web/src/lib/frameEditIntent.ts apps/web/src/lib/frameEditIntent.test.ts apps/web/src/components/ViewportCanvas.tsx
git commit -m "fix(web): require modifier for frame overlay edits"
```

---

## Task 2: MIG-23 Frame Edit Undo/Redo

- [ ] **Step 1: Add failing history tests**

Create `apps/web/src/lib/frameEditHistory.test.ts` covering:

- `createFrameEditHistoryState`;
- `pushFrameEditHistoryEntry`;
- `undoFrameEditHistory`;
- `redoFrameEditHistory`;
- `resetFrameEditHistory`;
- redo-stack clearing after a new edit.

- [ ] **Step 2: Run failing tests**

Run:

```powershell
npm run test -w @pixelaid/web -- frameEditHistory.test.ts
```

Expected: fail because the helper does not exist.

- [ ] **Step 3: Implement history helper**

Create `apps/web/src/lib/frameEditHistory.ts` with serializable snapshots:

```ts
export type FrameEditSnapshot = {
  frames: SpriteFrame[];
  animations: AnimationTag[];
  selectedFrameIndex: number;
  selectedAnimationName: string;
};
```

Use `past`, `present`, and `future` arrays; clone frames/animations when storing snapshots.

- [ ] **Step 4: Wire App history**

Modify `App.tsx` so:

- history resets on import, Auto Suggest, clear detected layout, and asset change;
- manual add/remove row/cell pushes one history entry;
- source frame drag/resize pushes one entry at pointer-down start and one commit at pointer-up if changed;
- undo/redo updates detected frames, row animations, selected frame, selected animation, pauses playback, and clears `fixResult`.

- [ ] **Step 5: Add controls and shortcuts**

Add Undo and Redo buttons near viewport/timeline controls using `lucide-react` `Undo2` and `Redo2`. Add keyboard support:

- `Ctrl+Z` / `Cmd+Z` undo
- `Ctrl+Shift+Z`, `Cmd+Shift+Z`, or `Ctrl+Y` redo

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/web -- frameEditHistory.test.ts frameEditIntent.test.ts sheetManualEditing.test.ts
npm run typecheck -w @pixelaid/web
```

Commit:

```powershell
git add apps/web/src/lib/frameEditHistory.ts apps/web/src/lib/frameEditHistory.test.ts apps/web/src/App.tsx apps/web/src/components/ViewportCanvas.tsx apps/web/src/styles.css
git commit -m "feat(web): add undo redo for sheet frame edits"
```

---

## Task 3: MIG-24 Outline Source Color Detection And Picker

- [ ] **Step 1: Add failing core outline tests**

In `packages/core/src/core.test.ts`, add tests that:

- detect two dark outline candidates from an asset edge;
- repair using an existing dark teal candidate without adding black;
- keep custom outline color fallback behavior.

- [ ] **Step 2: Run failing core tests**

Run:

```powershell
npm run test -w @pixelaid/core -- core.test.ts
```

Expected: fail because outline candidate helpers/options do not exist.

- [ ] **Step 3: Implement core detection/options**

Modify `packages/core/src/outline.ts`:

- export `detectOutlineColorCandidates`;
- bucket edge colors by RGB distance;
- rank by edge count, darkness, and outside-neighbor contact;
- support `sourceColors?: string[]` in `OutlineCleanupOptions`;
- in `repairExisting`, treat selected source colors as existing outline colors that should not be thickened.

- [ ] **Step 4: Wire shared/core fix options**

Modify:

- `packages/shared/src/types.ts` to add `outlineSourceColors?: string[]`;
- `packages/core/src/fix.ts` to pass `options.cleanup.outlineSourceColors`;
- `packages/core/src/index.ts` to export candidate helper if useful to web.

- [ ] **Step 5: Add web outline picker helpers/tests**

Extend `apps/web/src/lib/outlineControls.ts` and tests to normalize candidate colors, choose automatic/manual/custom source mode, and decide when to pass `outlineSourceColors`.

- [ ] **Step 6: Add inspector UI**

Modify `App.tsx` and `styles.css`:

- compute outline candidates from `selectedAsset.image` or `fixResult.image`;
- show detected source swatches when outline mode is not `none`;
- let user pick detected source colors and custom hex;
- keep current Color field as the output/add color control.

- [ ] **Step 7: Document and commit**

Update `docs/editor.md`. Run:

```powershell
npm run test -w @pixelaid/core -- core.test.ts
npm run test -w @pixelaid/web -- outlineControls.test.ts
npm run typecheck
```

Commit:

```powershell
git add packages/shared/src/types.ts packages/core/src/outline.ts packages/core/src/fix.ts packages/core/src/index.ts packages/core/src/core.test.ts apps/web/src/lib/outlineControls.ts apps/web/src/lib/outlineControls.test.ts apps/web/src/App.tsx apps/web/src/styles.css docs/editor.md
git commit -m "feat(core): add outline source color controls"
```

---

## Task 4: MIG-25 Repeated Busy Feedback

- [ ] **Step 1: Add failing busy-status tests**

Create `apps/web/src/lib/busyStatus.test.ts` for:

- first import preparing/decoding/analyzing labels;
- second import gets a new operation id and visible labels;
- fix queued/running/finishing labels before progress events;
- cancel/completion clear behavior.

- [ ] **Step 2: Run failing tests**

Run:

```powershell
npm run test -w @pixelaid/web -- busyStatus.test.ts
```

Expected: fail because helper does not exist.

- [ ] **Step 3: Implement busy helper**

Create `apps/web/src/lib/busyStatus.ts` with an operation model:

```ts
export type BusyOperationKind = "import" | "analysis" | "fix";
export type BusyOperation = {
  id: number;
  kind: BusyOperationKind;
  label: string;
  detail?: string;
};
```

Include helpers for label formatting and visible-state selection.

- [ ] **Step 4: Wire repeated import/fix status**

Modify `App.tsx` so every import/analyze/fix operation increments an id, sets status before expensive work, awaits at least one paint, and clears only the active operation id.

- [ ] **Step 5: Improve UI rendering**

Show busy status consistently in viewport and guided panel. Keep action buttons disabled while busy. Avoid status flicker on fast import by keeping at least one paint before clearing.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/web -- busyStatus.test.ts
npm run typecheck -w @pixelaid/web
```

Commit:

```powershell
git add apps/web/src/lib/busyStatus.ts apps/web/src/lib/busyStatus.test.ts apps/web/src/App.tsx apps/web/src/styles.css docs/editor.md
git commit -m "fix(web): keep repeated operation status visible"
```

---

## Task 5: Browser Verification, Full Checks, Linear, Merge

- [ ] **Step 1: Browser verify**

Start:

```powershell
npm run dev -w @pixelaid/web -- --host 127.0.0.1 --port 5176
```

Verify:

- robot sheet import still opens Timeline;
- normal drag over a frame pans, Ctrl/Cmd drag edits selected frame;
- Undo/Redo works for move, resize, add/remove cell, add/remove row;
- outline test asset `C:/Users/oms10/Downloads/test.png` shows detected source colors;
- repeated import shows busy status both times;
- Fix shows immediate status and clears on completion;
- console has no app errors.

- [ ] **Step 2: Full verification**

Run:

```powershell
npm run typecheck
npm run test
npm run lint
npm run build
```

- [ ] **Step 3: Linear and merge**

Comment verification on `MIG-22`, `MIG-23`, `MIG-24`, `MIG-25`; mark each Done after merge. Fast-forward merge:

```powershell
git -C C:/dev/Mighty/pixel-aid/.worktrees/pixelaid-roadmap-foundation merge --ff-only codex/mig-22-25-editor-polish
```

---

## Self Review

- Spec coverage: MIG-22 modifier gating, MIG-23 undo/redo, MIG-24 outline color source selection, and MIG-25 repeated busy feedback are each represented by tasks, tests, UI wiring, docs, and verification.
- Parallelization: This is intentionally serial to avoid conflicts in `App.tsx` and `ViewportCanvas.tsx`.
- Deferred: deeper eyedropper-on-canvas UX can build on the source swatch/custom color controls if needed later.
