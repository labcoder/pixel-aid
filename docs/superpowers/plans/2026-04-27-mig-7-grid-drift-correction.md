# MIG-7 Grid Drift Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the existing `FixOptions.grid.localCorrection` setting so PixelAid can locally correct mildly drifting pseudo-pixel grids while preserving clean global-grid behavior.

**Architecture:** Keep global grid detection in `packages/core/src/grid.ts`, add a focused local drift planner that produces typed boundary-offset arrays, then let `downsampleBlocks` consume optional corrected boundaries. The fix pipeline remains deterministic: global scale/phase/crop metadata is preserved, drift metadata is attached as diagnostics, and manual settings can disable local correction.

**Tech Stack:** TypeScript, npm workspaces, Vitest, typed arrays, existing PixelAid core fixtures.

---

## Scope

Linear issue: `MIG-7` - Implement local drift-aware pseudo-grid correction.

Worktree:

```txt
C:/dev/Mighty/pixel-aid/.worktrees/mig-7-grid-drift
```

Branch:

```txt
codex/mig-7-grid-drift
```

## Baseline

Already verified before this plan:

```sh
npm install
npm run test
```

Expected baseline: all workspace tests pass and `git status --short` is clean.

## File Structure

- Create: `packages/core/src/gridDrift.ts`
  - Owns local boundary scoring, smoothness penalties, corrected source-boundary generation, and no-op detection.
- Create: `packages/core/src/gridDrift.test.ts`
  - Direct unit tests for clean-grid no-op behavior, drifted-boundary recovery, and ambiguous low-signal rejection.
- Modify: `packages/core/src/downsample.ts`
  - Accepts optional absolute `xBoundaries` and `yBoundaries` typed arrays for locally corrected block bounds.
- Modify: `packages/core/src/core.test.ts`
  - Adds pipeline-level tests that `fixImage` honors `grid.localCorrection`, preserves clean-grid output, and leaves manual-disabled correction unchanged.
- Modify: `packages/core/src/fix.ts`
  - Wires drift planning into the single-image fix path and attaches drift diagnostics to returned grid metadata.
- Modify: `packages/core/src/index.ts`
  - Exports the drift planner and its public option/result types.
- Modify: `packages/shared/src/types.ts`
  - Adds serializable drift diagnostics to `GridCandidateDiagnostics`.
- Modify: `apps/web/src/App.tsx`
  - Adds a grid-panel toggle for local drift correction and passes it through `buildFixOptions`.
- Modify: `apps/web/src/lib/gridCandidatePreview.ts`
  - Formats drift diagnostics into candidate/result notes and a score row.
- Modify: `apps/web/src/lib/gridCandidatePreview.test.ts`
  - Covers drift badges, notes, and score formatting.
- Modify: `docs/algorithms.md`
  - Documents the local drift pass, constraints, and default behavior.

No new runtime dependency is planned.

---

## Task 1: Add Drift Diagnostics Contract

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/web/src/lib/gridCandidatePreview.ts`
- Modify: `apps/web/src/lib/gridCandidatePreview.test.ts`

- [ ] **Step 1: Write failing UI-format test**

Add a test case to `apps/web/src/lib/gridCandidatePreview.test.ts`:

```ts
test("formats local drift diagnostics for the UI", () => {
  const preview = formatGridCandidatePreview({
    ...candidate,
    diagnostics: {
      ...candidate.diagnostics!,
      drift: {
        localCorrectionUsed: true,
        confidence: 0.78,
        improvementScore: 0.42,
        smoothnessPenalty: 0.08,
        correctedBoundaryCount: 9,
        maxOffsetPx: 2,
        meanAbsOffsetPx: 0.73,
        notes: ["Local drift correction used", "9 corrected boundaries"]
      }
    }
  }, 0);

  expect(preview.badges).toContain("drift");
  expect(preview.notes).toContain("Local drift correction used");
  expect(preview.scoreRows).toContainEqual(["Drift", "78%"]);
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```sh
npm run test -w @pixelaid/web -- src/lib/gridCandidatePreview.test.ts
```

Expected: TypeScript/Vitest fails because `diagnostics.drift` is not defined and preview does not format it.

- [ ] **Step 3: Add shared drift diagnostic type**

In `packages/shared/src/types.ts`, add:

```ts
export type GridDriftDiagnostics = {
  localCorrectionUsed: boolean;
  confidence: number;
  improvementScore: number;
  smoothnessPenalty: number;
  correctedBoundaryCount: number;
  maxOffsetPx: number;
  meanAbsOffsetPx: number;
  notes: string[];
};
```

Then extend `GridCandidateDiagnostics`:

```ts
  drift?: GridDriftDiagnostics;
```

- [ ] **Step 4: Format diagnostics in grid preview**

In `apps/web/src/lib/gridCandidatePreview.ts`:

```ts
  if (diagnostics?.drift?.localCorrectionUsed) {
    badges.push("drift");
  }
```

Append drift notes after existing notes, filtered to avoid duplicate confidence wording:

```ts
const notes = [...(diagnostics?.notes ?? [candidate.reason]), ...(diagnostics?.drift?.notes ?? [])]
  .filter((note) => !note.includes("confidence"))
  .slice(0, 3);
```

Add a drift score row:

```ts
...(diagnostics?.drift ? [["Drift", formatPercent(diagnostics.drift.confidence)] as [string, string]] : [])
```

- [ ] **Step 5: Run web helper test and verify GREEN**

Run:

```sh
npm run test -w @pixelaid/web -- src/lib/gridCandidatePreview.test.ts
```

Expected: all `gridCandidatePreview` tests pass.

- [ ] **Step 6: Commit**

```sh
git add packages/shared/src/types.ts apps/web/src/lib/gridCandidatePreview.ts apps/web/src/lib/gridCandidatePreview.test.ts
git commit -m "feat(shared): add grid drift diagnostics"
```

---

## Task 2: Implement Local Drift Planner

**Files:**
- Create: `packages/core/src/gridDrift.ts`
- Create: `packages/core/src/gridDrift.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing clean-grid no-op test**

Create `packages/core/src/gridDrift.test.ts` with:

```ts
import { describe, expect, test } from "vitest";
import type { GridCandidate, RGBAImage } from "@pixelaid/shared";
import { createImage, writePixel } from "./image";
import { planLocalGridDrift } from "./gridDrift";

function drawRect(image: RGBAImage, startX: number, startY: number, width: number, height: number, color: readonly [number, number, number, number]): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(image, x, y, color[0], color[1], color[2], color[3]);
    }
  }
}

function cleanGridImage(): RGBAImage {
  const image = createImage(24, 16, [255, 255, 255, 255]);
  const colors = [
    [20, 20, 28, 255],
    [90, 140, 180, 255],
    [180, 90, 80, 255],
    [60, 180, 120, 255]
  ] as const;
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      drawRect(image, x * 4, y * 4, 4, 4, colors[(x + y) % colors.length]!);
    }
  }
  return image;
}

const candidate: GridCandidate = {
  outputWidth: 6,
  outputHeight: 4,
  scaleX: 4,
  scaleY: 4,
  phaseX: 0,
  phaseY: 0,
  confidence: 0.9,
  reason: "test grid"
};

describe("local grid drift planning", () => {
  test("returns an unused plan for clean global grids", () => {
    const plan = planLocalGridDrift(cleanGridImage(), candidate);

    expect(plan.used).toBe(false);
    expect(Array.from(plan.xBoundaries)).toEqual([0, 4, 8, 12, 16, 20, 24]);
    expect(Array.from(plan.yBoundaries)).toEqual([0, 4, 8, 12, 16]);
    expect(plan.diagnostics.localCorrectionUsed).toBe(false);
    expect(plan.diagnostics.correctedBoundaryCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```sh
npm run test -w @pixelaid/core -- src/gridDrift.test.ts
```

Expected: fails because `gridDrift.ts` does not exist.

- [ ] **Step 3: Implement minimal planner API**

Create `packages/core/src/gridDrift.ts` with:

```ts
import type { GridCandidate, GridDriftDiagnostics, RGBAImage } from "@pixelaid/shared";

export type LocalGridDriftOptions = {
  maxOffsetPx?: number;
  minImprovementScore?: number;
  smoothnessWeight?: number;
};

export type LocalGridDriftPlan = {
  used: boolean;
  xBoundaries: Int32Array;
  yBoundaries: Int32Array;
  diagnostics: GridDriftDiagnostics;
};
```

Implement `planLocalGridDrift(image, candidate, options)` so it:

- Builds nominal absolute boundaries from `sourceRect?.x ?? phaseX`, `sourceRect?.y ?? phaseY`, `scaleX`, `scaleY`, `outputWidth`, and `outputHeight`.
- Scores candidate interior boundaries by local edge energy in a search radius of `min(maxOffsetPx ?? 3, floor(scale / 2))`.
- Applies smoothness by subtracting `smoothnessWeight * abs(offset - previousOffset)` while walking boundaries.
- Keeps first and last boundaries anchored to nominal source bounds.
- Returns `used: false` when improvement is below `minImprovementScore ?? 0.08`.
- Uses `Int32Array` and numeric loops.

- [ ] **Step 4: Export planner**

In `packages/core/src/index.ts`:

```ts
export { planLocalGridDrift } from "./gridDrift";
export type { LocalGridDriftOptions, LocalGridDriftPlan } from "./gridDrift";
```

- [ ] **Step 5: Run clean-grid test and verify GREEN**

Run:

```sh
npm run test -w @pixelaid/core -- src/gridDrift.test.ts
```

Expected: clean-grid no-op test passes.

- [ ] **Step 6: Add failing drifted-grid recovery test**

Add a helper in `gridDrift.test.ts` that creates a source where a vertical boundary shifts by two pixels halfway down:

```ts
function driftedVerticalGridImage(): RGBAImage {
  const image = createImage(24, 16, [255, 255, 255, 255]);
  for (let y = 0; y < image.height; y += 1) {
    const boundary = y >= 8 ? 10 : 8;
    drawRect(image, 0, y, boundary, 1, [30, 40, 50, 255]);
    drawRect(image, boundary, y, image.width - boundary, 1, [210, 120, 90, 255]);
  }
  return image;
}
```

Add:

```ts
test("corrects mild boundary drift when edge evidence improves", () => {
  const plan = planLocalGridDrift(driftedVerticalGridImage(), candidate, {
    maxOffsetPx: 3,
    minImprovementScore: 0.02,
    smoothnessWeight: 0.05
  });

  expect(plan.used).toBe(true);
  expect(plan.xBoundaries[2]).toBeGreaterThan(8);
  expect(plan.diagnostics.localCorrectionUsed).toBe(true);
  expect(plan.diagnostics.correctedBoundaryCount).toBeGreaterThan(0);
  expect(plan.diagnostics.maxOffsetPx).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 7: Run test and verify RED**

Run:

```sh
npm run test -w @pixelaid/core -- src/gridDrift.test.ts
```

Expected: drifted-grid test fails until scoring prefers shifted boundaries.

- [ ] **Step 8: Complete boundary scoring**

Implement vertical and horizontal boundary scoring with separate typed loops:

- `scoreVerticalBoundary(image, x, yStart, yEnd)`
- `scoreHorizontalBoundary(image, y, xStart, xEnd)`
- `buildAxisBoundaries(...)`

For each interior nominal boundary:

```ts
const corrected = clampInteger(nominal + bestOffset, previous + 1, nextNominal - 1);
```

Track:

- `correctedBoundaryCount`
- `maxOffsetPx`
- `meanAbsOffsetPx`
- `improvementScore`
- `smoothnessPenalty`
- `confidence`

- [ ] **Step 9: Run planner tests and verify GREEN**

Run:

```sh
npm run test -w @pixelaid/core -- src/gridDrift.test.ts
```

Expected: both planner tests pass.

- [ ] **Step 10: Commit**

```sh
git add packages/core/src/gridDrift.ts packages/core/src/gridDrift.test.ts packages/core/src/index.ts
git commit -m "feat(core): plan local grid drift correction"
```

---

## Task 3: Downsample With Corrected Boundaries

**Files:**
- Modify: `packages/core/src/downsample.ts`
- Modify: `packages/core/src/core.test.ts`

- [ ] **Step 1: Write failing downsample test**

Add to `packages/core/src/core.test.ts` in `describe("block downsampling", ...)`:

```ts
test("uses corrected block boundaries when local drift supplies them", () => {
  const source = imageFromPixels(6, [
    rgba(255, 0, 0), rgba(255, 0, 0), rgba(0, 255, 0), rgba(0, 255, 0), rgba(0, 0, 255), rgba(0, 0, 255),
    rgba(255, 0, 0), rgba(255, 0, 0), rgba(0, 255, 0), rgba(0, 255, 0), rgba(0, 0, 255), rgba(0, 0, 255)
  ]);

  const fixed = downsampleBlocks(source, {
    outputWidth: 3,
    outputHeight: 1,
    scaleX: 2,
    scaleY: 2,
    phaseX: 0,
    phaseY: 0,
    xBoundaries: new Int32Array([0, 2, 4, 6]),
    yBoundaries: new Int32Array([0, 2]),
    method: "dominant",
    alpha: "preserve"
  });

  expect(readPixel(fixed, 0, 0)).toEqual([255, 0, 0, 255]);
  expect(readPixel(fixed, 1, 0)).toEqual([0, 255, 0, 255]);
  expect(readPixel(fixed, 2, 0)).toEqual([0, 0, 255, 255]);
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```sh
npm run test -w @pixelaid/core -- src/core.test.ts -t "uses corrected block boundaries"
```

Expected: TypeScript fails because `xBoundaries` and `yBoundaries` are not part of `DownsampleOptions`.

- [ ] **Step 3: Extend `DownsampleOptions`**

In `packages/core/src/downsample.ts`, add:

```ts
  xBoundaries?: Int32Array;
  yBoundaries?: Int32Array;
```

Update `getBlockBounds`:

```ts
const startX = options.xBoundaries ? options.xBoundaries[x]! : Math.floor(options.phaseX + x * options.scaleX);
const endX = options.xBoundaries ? options.xBoundaries[x + 1]! : Math.floor(options.phaseX + (x + 1) * options.scaleX);
const startY = options.yBoundaries ? options.yBoundaries[y]! : Math.floor(options.phaseY + y * options.scaleY);
const endY = options.yBoundaries ? options.yBoundaries[y + 1]! : Math.floor(options.phaseY + (y + 1) * options.scaleY);
```

Keep the existing clamping and one-pixel minimum logic.

- [ ] **Step 4: Run test and verify GREEN**

Run:

```sh
npm run test -w @pixelaid/core -- src/core.test.ts -t "uses corrected block boundaries"
```

Expected: test passes.

- [ ] **Step 5: Run all core tests**

Run:

```sh
npm run test -w @pixelaid/core
```

Expected: all core tests pass.

- [ ] **Step 6: Commit**

```sh
git add packages/core/src/downsample.ts packages/core/src/core.test.ts
git commit -m "feat(core): downsample corrected grid boundaries"
```

---

## Task 4: Wire Local Correction Into `fixImage`

**Files:**
- Modify: `packages/core/src/fix.ts`
- Modify: `packages/core/src/core.test.ts`
- Modify: `packages/core/src/fixtureSuite.test.ts`

- [ ] **Step 1: Write failing pipeline test for disabled correction**

Add to `packages/core/src/core.test.ts` under `describe("fix pipeline", ...)`:

```ts
test("leaves clean auto-grid fixture unchanged when local correction is disabled", () => {
  const fixture = createSingleSpriteCleanupFixture();
  const options: FixOptions = {
    mode: "single",
    assetType: "sprite",
    maxColors: 24,
    grid: {
      detect: "auto",
      localCorrection: false
    },
    downscale: "adaptive",
    alpha: "backgroundFloodFill",
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true
    }
  };

  const result = fixImage(fixture.image, options);

  expect(result.grid.diagnostics?.drift).toBeUndefined();
  expect(result.image.width).toBe(102);
  expect(result.image.height).toBe(144);
});
```

- [ ] **Step 2: Write failing pipeline test for enabled correction metadata**

Add:

```ts
test("reports local correction diagnostics when enabled", () => {
  const fixture = createSingleSpriteCleanupFixture();
  const result = fixImage(fixture.image, {
    mode: "single",
    assetType: "sprite",
    maxColors: 24,
    grid: {
      detect: "auto",
      localCorrection: true
    },
    downscale: "adaptive",
    alpha: "backgroundFloodFill",
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true
    }
  });

  expect(result.grid.diagnostics?.drift).toEqual(expect.objectContaining({
    localCorrectionUsed: expect.any(Boolean),
    confidence: expect.any(Number),
    correctedBoundaryCount: expect.any(Number)
  }));
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```sh
npm run test -w @pixelaid/core -- src/core.test.ts -t "local correction"
```

Expected: enabled-correction diagnostics test fails because `fixImage` does not attach drift diagnostics.

- [ ] **Step 4: Wire planner into single-image path**

In `packages/core/src/fix.ts`:

- Import `planLocalGridDrift`.
- After `const grid = resolveGrid(image, options);`, call the planner only when:

```ts
const localDrift = options.grid.localCorrection ? planLocalGridDrift(image, grid) : undefined;
```

- Pass boundaries to `downsampleBlocks` only when the plan exists and `plan.used` is true:

```ts
xBoundaries: localDrift?.used ? localDrift.xBoundaries : undefined,
yBoundaries: localDrift?.used ? localDrift.yBoundaries : undefined,
```

- Attach diagnostics whether the plan was used or intentionally rejected due to weak evidence:

```ts
const gridWithDrift = localDrift ? attachDriftDiagnostics(grid, localDrift.diagnostics) : grid;
```

- Return `gridWithDrift` through metrics and result metadata.

Do not apply local correction to `fixSheetFrames` in MIG-7; sheet frame normalization belongs to later sheet-specific issues.

- [ ] **Step 5: Run targeted core tests and verify GREEN**

Run:

```sh
npm run test -w @pixelaid/core -- src/core.test.ts -t "local correction"
```

Expected: local correction pipeline tests pass.

- [ ] **Step 6: Add fixture-suite regression test**

In `packages/core/src/fixtureSuite.test.ts`, add:

```ts
test("keeps clean pseudo-pixel fixture stable with local correction enabled", () => {
  const fixture = requiredFixture("single-robot-6x");
  const withoutCorrection = fixImage(fixture.createImage(), {
    mode: "single",
    assetType: "sprite",
    maxColors: 24,
    grid: { detect: "auto", localCorrection: false },
    downscale: "adaptive",
    alpha: "backgroundFloodFill",
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true
    }
  });
  const withCorrection = fixImage(fixture.createImage(), {
    ...withoutCorrection.settings,
    grid: { detect: "auto", localCorrection: true }
  });

  expect(withCorrection.image.width).toBe(withoutCorrection.image.width);
  expect(withCorrection.image.height).toBe(withoutCorrection.image.height);
  expect(Array.from(withCorrection.image.data)).toEqual(Array.from(withoutCorrection.image.data));
});
```

- [ ] **Step 7: Run core workspace tests**

Run:

```sh
npm run test -w @pixelaid/core
```

Expected: all core tests pass.

- [ ] **Step 8: Commit**

```sh
git add packages/core/src/fix.ts packages/core/src/core.test.ts packages/core/src/fixtureSuite.test.ts
git commit -m "feat(core): apply local grid drift correction"
```

---

## Task 5: Add Web Toggle And Metadata Display

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/lib/fixSuggestions.ts`
- Modify: `apps/web/src/lib/fixSuggestions.test.ts`

- [ ] **Step 1: Write failing suggestion test**

In `apps/web/src/lib/fixSuggestions.test.ts`, add:

```ts
test("suggests local correction for high-resolution single sprites", () => {
  const fixture = createSingleSpriteCleanupFixture();
  const suggestion = suggestFixSettings(fixture.image);

  expect(suggestion.localCorrection).toBe(true);
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```sh
npm run test -w @pixelaid/web -- src/lib/fixSuggestions.test.ts -t "local correction"
```

Expected: fails because `FixSettingSuggestion.localCorrection` does not exist.

- [ ] **Step 3: Extend suggestion model**

In `apps/web/src/lib/fixSuggestions.ts`, add `localCorrection: boolean` to `FixSettingSuggestion`.

Set it to:

```ts
localCorrection: mode === "single" && classification.assetType !== "background" && (candidate?.scaleX ?? 1) >= 4 && (candidate?.confidence ?? 0) >= 0.55
```

- [ ] **Step 4: Wire App state and options**

In `apps/web/src/App.tsx`:

- Add:

```ts
const [localCorrection, setLocalCorrection] = useState(false);
```

- In `applyFixSuggestion`, set:

```ts
setLocalCorrection(suggestion.localCorrection);
```

- In `buildFixOptions.grid`, pass:

```ts
localCorrection
```

- Include `localCorrection` in dependency arrays that include grid settings.

- Add a checkbox in the Grid panel:

```tsx
<label className="toggle-row">
  <input
    type="checkbox"
    checked={localCorrection}
    disabled={mode !== "single"}
    onChange={(event) => setLocalCorrection(event.currentTarget.checked)}
  />
  Correct local drift
</label>
```

Manual grid settings can disable it because the checkbox remains user-controlled and `buildFixOptions` passes the value explicitly.

- [ ] **Step 5: Run web targeted tests**

Run:

```sh
npm run test -w @pixelaid/web -- src/lib/fixSuggestions.test.ts src/lib/gridCandidatePreview.test.ts
```

Expected: targeted web tests pass.

- [ ] **Step 6: Run typecheck for web**

Run:

```sh
npm run typecheck -w @pixelaid/web
```

Expected: no TypeScript errors from new state/dependency wiring.

- [ ] **Step 7: Commit**

```sh
git add apps/web/src/App.tsx apps/web/src/lib/fixSuggestions.ts apps/web/src/lib/fixSuggestions.test.ts
git commit -m "feat(web): expose local grid drift correction"
```

---

## Task 6: Document And Verify MIG-7

**Files:**
- Modify: `docs/algorithms.md`

- [ ] **Step 1: Update algorithms documentation**

In `docs/algorithms.md`, replace:

```md
The next detector upgrades should add stronger edge-period analysis and local drift correction for uneven AI-generated grids.
```

with a section that explains:

- Local correction is opt-in through `grid.localCorrection`.
- The global grid candidate remains the source of scale, phase, crop, and target size.
- The drift planner searches only a small offset radius around interior block boundaries.
- Smoothness penalties prevent high-frequency warping.
- Diagnostics report whether correction was used, confidence, corrected boundary count, max offset, and mean absolute offset.
- Sheet frames are not locally corrected in MIG-7.

- [ ] **Step 2: Run targeted tests**

Run:

```sh
npm run test -w @pixelaid/core -- src/gridDrift.test.ts src/core.test.ts src/fixtureSuite.test.ts
npm run test -w @pixelaid/web -- src/lib/fixSuggestions.test.ts src/lib/gridCandidatePreview.test.ts
```

Expected: targeted tests pass.

- [ ] **Step 3: Run full verification**

Run:

```sh
npm run test
npm run typecheck
npm run lint
npm run build
npm run benchmark
```

Expected:

- All workspace tests pass.
- Typecheck passes in all workspaces.
- ESLint has zero warnings.
- Production build succeeds.
- Benchmark command remains within current budget and does not discover duplicate `dist/*.bench.js` files.

- [ ] **Step 4: Check hot-loop allocations**

Review `packages/core/src/gridDrift.ts` and `packages/core/src/downsample.ts`:

- No object creation per source pixel.
- Boundary arrays are `Int32Array`.
- Per-boundary scratch arrays are allocated per axis, not per pixel.
- Existing `Map` allocation inside dominant-color downsampling is not expanded by this task.

- [ ] **Step 5: Commit docs**

```sh
git add docs/algorithms.md
git commit -m "docs(core): document local grid drift correction"
```

- [ ] **Step 6: Update Linear**

Add a Linear comment to `MIG-7` with:

- Branch: `codex/mig-7-grid-drift`
- Worktree path
- Verification commands and pass/fail status
- Any benchmark numbers worth calling out

---

## Subagent Dispatch

Use one implementer worker for MIG-7 at a time because the core drift planner, downsampling API, and fix pipeline are tightly related. Do not run MIG-7 implementation in parallel with another worker that edits `packages/core/src/downsample.ts`, `packages/core/src/fix.ts`, or `packages/shared/src/types.ts`.

Worker prompt:

```txt
You are working in C:/dev/Mighty/pixel-aid/.worktrees/mig-7-grid-drift on branch codex/mig-7-grid-drift.

You are not alone in the codebase; other issue worktrees may be active. Do not revert edits made by others. Own only the MIG-7 files listed in docs/superpowers/plans/2026-04-27-mig-7-grid-drift-correction.md unless you discover a blocker.

Implement the plan task-by-task using TDD:
1. Write the failing test.
2. Run it and confirm the expected failure.
3. Implement the minimal code.
4. Run targeted tests.
5. Commit semantically after each completed task.

Do not change dependency policy or add runtime dependencies. Keep hot loops typed-array based and avoid object allocation per pixel. Report changed files, commits, verification commands, and any concerns.
```

After implementation, dispatch two review agents:

1. Spec review: verify every MIG-7 requirement and acceptance criterion is satisfied.
2. Code quality review: inspect algorithm clarity, hot-loop allocations, metadata compatibility, UI behavior, and test coverage.

---

## Acceptance Mapping

- Drifted pseudo-grid fixtures produce more readable native output than global-only sampling: Task 2 and Task 4 tests.
- UI/metadata reports when local correction was used and confidence: Task 1 and Task 5.
- Manual grid settings can disable local correction: Task 4 disabled test and Task 5 checkbox wiring.
- Clean grid fixtures remain unchanged: Task 2 no-op test and Task 4 fixture-suite regression.
- Performance remains within benchmark budget: Task 6 verification.
