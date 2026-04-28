# MIG-11 Animation Stability Diagnostics and Sheet Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inspect-first animation stability diagnostics and pivot correction controls so sprite sheets can be reviewed, normalized, and exported without hidden baseline drift, pivot wobble, frame-size variance, or content-center surprises.

**Architecture:** Keep the analysis deterministic and metadata-first. Put reusable diagnostics in `@pixelaid/exporters`, use web-only helpers for editor pivot overrides, and wire the UI to show warnings without blocking existing sprite-sheet workflows. Normalized preview/export should consume the corrected frame list, while source frame rectangles, tags, frame durations, and manifest animation IDs remain stable.

**Tech Stack:** TypeScript, Vite/React, Canvas2D, Vitest, existing npm workspaces. No new dependencies.

---

## Phase 3 Position

- `MIG-11` is Phase 3A and is the active worktree: `C:\dev\Mighty\pixel-aid\.worktrees\mig-11-animation-stability`.
- `MIG-12` is Phase 3B and should start only after `MIG-11` is integrated back into the roadmap foundation branch. It will use a new local worktree, likely `.worktrees\mig-12-export-bundles`, based on the branch that includes `MIG-11`.
- Linear has been aligned so `MIG-12` is blocked by `MIG-11`, `MIG-14` is blocked by `MIG-12`, and `MIG-15` is blocked by the export contract work.

## Current State

- `apps/web/src/lib/frameNormalization.ts` already creates shared pivot-aligned preview placements for the current timeline clip.
- `packages/exporters/src/normalizedSheet.ts` already creates pivot-normalized sheet packing for export.
- `apps/web/src/components/FramePreviewCanvas.tsx` draws the current frame, onion-skin neighbors, normalized canvas bounds, and pivot cross.
- `apps/web/src/App.tsx` already has timeline playback, detected animation tags, frame-duration overrides, normalized export, and source frame editing.
- `packages/fixtures/src/unevenSpriteSheets.ts` already has uneven sheet fixtures with row labels, gutters, and expected warnings.
- There is no shared diagnostic contract for baseline/pivot/size/content drift.
- There is no serializable pivot override state separate from detected/manual frame geometry.
- The timeline does not mark unstable frames or summarize stability issues.

## Scope Decisions

- Treat `MIG-11` as inspect-and-correct, not image-content foot detection. The first pass uses frame metadata: `rect`, `sourceRect`, `pivot`, `durationMs`, and animation tags.
- Baseline diagnostics use each frame pivot as the animation baseline. That catches the practical wobble introduced by inconsistent pivots and frame boxes.
- Content-center diagnostics use `sourceRect` when present and fall back to `rect`.
- Pivot correction is manual and serializable. Auto-fix suggestions can be added later, but this issue only needs reliable controls and diagnostics.
- Keep existing global sheet pivot controls. Add per-frame and per-clip overrides on top of them so the migration is incremental.
- No new dependencies.

## Subagent Flow

- Main agent owns shared/exporter contracts, normalization/export integration, `App.tsx` integration, final verification, and commits.
- Worker A can run in parallel after Task 1 and owns only `apps/web/src/lib/pivotOverrides.ts` plus `apps/web/src/lib/pivotOverrides.test.ts`.
- Worker B can run in parallel after Task 1 and owns only fixture additions in `packages/fixtures/src/unevenSpriteSheets.ts` plus fixture tests if needed.
- Main agent should not delegate `apps/web/src/App.tsx` because it is highly coupled to timeline, export, and playback state.
- `MIG-12` should not start in parallel with `MIG-11`; its bundle/export UX depends on the final normalized frame and diagnostics contract from this issue.

---

### Task 1: Shared Frame Stability Types

**Files:**
- Modify: `packages/shared/src/types.ts`
- Test: `packages/shared/src/shared.test.ts` only if runtime constants are added

- [x] **Step 1: Add diagnostic severity and issue contracts**

In `packages/shared/src/types.ts`, add these types after `AnimationTag`:

```ts
export type FrameStabilitySeverity = "info" | "warning" | "error";

export type FrameStabilityIssueCode =
  | "baseline-drift"
  | "pivot-drift"
  | "frame-size-variance"
  | "content-center-drift"
  | "duration-variance";

export type FrameStabilityIssue = {
  code: FrameStabilityIssueCode;
  severity: FrameStabilitySeverity;
  message: string;
  affectedFrameNames: string[];
  maxDelta: number;
  unit: "px" | "ms";
};
```

- [x] **Step 2: Add metric and diagnostics contracts**

Continue in `packages/shared/src/types.ts`:

```ts
export type FrameStabilityMetric = {
  frameName: string;
  baselineY: number;
  pivotX: number;
  pivotY: number;
  frameWidth: number;
  frameHeight: number;
  contentCenterX: number;
  contentCenterY: number;
  durationMs: number;
};

export type FrameStabilityDiagnostics = {
  frameCount: number;
  stableFrameCount: number;
  maxBaselineDeltaPx: number;
  maxPivotDeltaPx: number;
  maxFrameSizeDeltaPx: number;
  maxContentCenterDeltaPx: number;
  maxDurationDeltaMs: number;
  metrics: FrameStabilityMetric[];
  issues: FrameStabilityIssue[];
};
```

- [x] **Step 3: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/shared
npm run test -w @pixelaid/shared
```

Expected: pass.

Commit:

```powershell
git add packages/shared/src/types.ts
git commit -m "feat(shared): add frame stability diagnostic types"
```

---

### Task 2: Exporter Diagnostics Engine

**Files:**
- Create: `packages/exporters/src/frameStability.ts`
- Create: `packages/exporters/src/frameStability.test.ts`
- Modify: `packages/exporters/src/index.ts`

- [ ] **Step 1: Implement metadata-first frame analysis**

Create `packages/exporters/src/frameStability.ts`:

```ts
import type { FrameStabilityDiagnostics, FrameStabilityIssue, FrameStabilityMetric, Rect, SpriteFrame } from "@pixelaid/shared";

export type AnalyzeFrameStabilityOptions = {
  baselineTolerancePx?: number;
  pivotTolerancePx?: number;
  frameSizeTolerancePx?: number;
  contentCenterTolerancePx?: number;
  durationToleranceMs?: number;
};

const defaultOptions: Required<AnalyzeFrameStabilityOptions> = {
  baselineTolerancePx: 1,
  pivotTolerancePx: 1,
  frameSizeTolerancePx: 1,
  contentCenterTolerancePx: 1,
  durationToleranceMs: 0
};

export function analyzeFrameStability(
  frames: readonly SpriteFrame[],
  options: AnalyzeFrameStabilityOptions = {}
): FrameStabilityDiagnostics {
  const settings = { ...defaultOptions, ...options };
  const metrics = frames.map(getFrameMetric);
  const reference = getMedianMetric(metrics);

  if (!reference) {
    return {
      frameCount: 0,
      stableFrameCount: 0,
      maxBaselineDeltaPx: 0,
      maxPivotDeltaPx: 0,
      maxFrameSizeDeltaPx: 0,
      maxContentCenterDeltaPx: 0,
      maxDurationDeltaMs: 0,
      metrics: [],
      issues: []
    };
  }

  const deltas = metrics.map((metric) => ({
    frameName: metric.frameName,
    baseline: Math.abs(metric.baselineY - reference.baselineY),
    pivot: Math.max(Math.abs(metric.pivotX - reference.pivotX), Math.abs(metric.pivotY - reference.pivotY)),
    frameSize: Math.max(Math.abs(metric.frameWidth - reference.frameWidth), Math.abs(metric.frameHeight - reference.frameHeight)),
    contentCenter: Math.max(
      Math.abs(metric.contentCenterX - reference.contentCenterX),
      Math.abs(metric.contentCenterY - reference.contentCenterY)
    ),
    duration: Math.abs(metric.durationMs - reference.durationMs)
  }));

  const issues: FrameStabilityIssue[] = [];
  pushIssue(issues, "baseline-drift", "warning", "Baseline varies across frames.", deltas, "baseline", settings.baselineTolerancePx, "px");
  pushIssue(issues, "pivot-drift", "warning", "Pivot position varies across frames.", deltas, "pivot", settings.pivotTolerancePx, "px");
  pushIssue(issues, "frame-size-variance", "info", "Frame dimensions vary across the clip.", deltas, "frameSize", settings.frameSizeTolerancePx, "px");
  pushIssue(issues, "content-center-drift", "warning", "Content center shifts across frames.", deltas, "contentCenter", settings.contentCenterTolerancePx, "px");
  pushIssue(issues, "duration-variance", "info", "Frame durations vary across the clip.", deltas, "duration", settings.durationToleranceMs, "ms");

  const unstableNames = new Set(issues.flatMap((issue) => issue.affectedFrameNames));
  return {
    frameCount: frames.length,
    stableFrameCount: Math.max(0, frames.length - unstableNames.size),
    maxBaselineDeltaPx: maxDelta(deltas, "baseline"),
    maxPivotDeltaPx: maxDelta(deltas, "pivot"),
    maxFrameSizeDeltaPx: maxDelta(deltas, "frameSize"),
    maxContentCenterDeltaPx: maxDelta(deltas, "contentCenter"),
    maxDurationDeltaMs: maxDelta(deltas, "duration"),
    metrics,
    issues
  };
}
```

Implement helpers with no per-pixel or DOM dependencies:

```ts
function getFrameMetric(frame: SpriteFrame): FrameStabilityMetric {
  const contentRect = frame.sourceRect ?? frame.rect;
  return {
    frameName: frame.name,
    baselineY: frame.pivot.y,
    pivotX: frame.pivot.x,
    pivotY: frame.pivot.y,
    frameWidth: frame.rect.w,
    frameHeight: frame.rect.h,
    contentCenterX: centerX(contentRect),
    contentCenterY: centerY(contentRect),
    durationMs: frame.durationMs
  };
}

function centerX(rect: Rect): number {
  return rect.x + rect.w / 2;
}

function centerY(rect: Rect): number {
  return rect.y + rect.h / 2;
}
```

Add median/reference helpers and `pushIssue(...)`:

```ts
type DeltaKey = "baseline" | "pivot" | "frameSize" | "contentCenter" | "duration";

function getMedianMetric(metrics: readonly FrameStabilityMetric[]): FrameStabilityMetric | null {
  if (metrics.length === 0) {
    return null;
  }

  return {
    frameName: "reference",
    baselineY: median(metrics.map((metric) => metric.baselineY)),
    pivotX: median(metrics.map((metric) => metric.pivotX)),
    pivotY: median(metrics.map((metric) => metric.pivotY)),
    frameWidth: median(metrics.map((metric) => metric.frameWidth)),
    frameHeight: median(metrics.map((metric) => metric.frameHeight)),
    contentCenterX: median(metrics.map((metric) => metric.contentCenterX)),
    contentCenterY: median(metrics.map((metric) => metric.contentCenterY)),
    durationMs: median(metrics.map((metric) => metric.durationMs))
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function pushIssue(
  issues: FrameStabilityIssue[],
  code: FrameStabilityIssue["code"],
  severity: FrameStabilityIssue["severity"],
  message: string,
  deltas: readonly Array<{ frameName: string } & Record<DeltaKey, number>>,
  key: DeltaKey,
  tolerance: number,
  unit: FrameStabilityIssue["unit"]
): void {
  const affected = deltas.filter((delta) => delta[key] > tolerance);
  if (affected.length === 0) {
    return;
  }

  issues.push({
    code,
    severity,
    message,
    affectedFrameNames: affected.map((delta) => delta.frameName),
    maxDelta: maxDelta(deltas, key),
    unit
  });
}

function maxDelta(deltas: readonly Array<Record<DeltaKey, number>>, key: DeltaKey): number {
  return deltas.reduce((max, delta) => Math.max(max, delta[key]), 0);
}
```

- [ ] **Step 2: Add tests**

Create `packages/exporters/src/frameStability.test.ts` with coverage for:

```ts
import type { SpriteFrame } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { analyzeFrameStability } from "./frameStability";

const stableFrames: SpriteFrame[] = [
  { name: "idle_000", rect: { x: 0, y: 0, w: 32, h: 32 }, pivot: { x: 16, y: 30 }, durationMs: 120 },
  { name: "idle_001", rect: { x: 32, y: 0, w: 32, h: 32 }, pivot: { x: 16, y: 30 }, durationMs: 120 }
];

describe("frame stability diagnostics", () => {
  test("returns no issues for stable frames", () => {
    const diagnostics = analyzeFrameStability(stableFrames);

    expect(diagnostics.frameCount).toBe(2);
    expect(diagnostics.stableFrameCount).toBe(2);
    expect(diagnostics.issues).toEqual([]);
  });

  test("reports baseline and pivot drift", () => {
    const diagnostics = analyzeFrameStability([
      stableFrames[0]!,
      { ...stableFrames[1]!, name: "idle_001", pivot: { x: 18, y: 34 } }
    ]);

    expect(diagnostics.issues.map((issue) => issue.code)).toContain("baseline-drift");
    expect(diagnostics.issues.map((issue) => issue.code)).toContain("pivot-drift");
    expect(diagnostics.maxBaselineDeltaPx).toBeGreaterThan(1);
  });

  test("uses sourceRect to detect content center drift", () => {
    const diagnostics = analyzeFrameStability([
      { ...stableFrames[0]!, sourceRect: { x: 0, y: 0, w: 32, h: 32 } },
      { ...stableFrames[1]!, sourceRect: { x: 40, y: 0, w: 32, h: 32 } }
    ]);

    expect(diagnostics.issues.map((issue) => issue.code)).toContain("content-center-drift");
  });
});
```

- [ ] **Step 3: Export the analyzer**

Modify `packages/exporters/src/index.ts`:

```ts
export { analyzeFrameStability } from "./frameStability";
export type { AnalyzeFrameStabilityOptions } from "./frameStability";
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/exporters
npm run test -w @pixelaid/exporters
```

Expected: pass.

Commit:

```powershell
git add packages/exporters/src/frameStability.ts packages/exporters/src/frameStability.test.ts packages/exporters/src/index.ts
git commit -m "feat(exporters): add frame stability diagnostics"
```

---

### Task 3: Web Pivot Override Model

**Parallelizable:** Worker A may own this task after Task 1.

**Files:**
- Create: `apps/web/src/lib/pivotOverrides.ts`
- Create: `apps/web/src/lib/pivotOverrides.test.ts`
- Modify later in main task: `apps/web/src/App.tsx`

- [ ] **Step 1: Add serializable override state**

Create `apps/web/src/lib/pivotOverrides.ts`:

```ts
import type { AnimationTag, Pivot, SpriteFrame } from "@pixelaid/shared";

export type PivotOverrideState = {
  frames: Record<string, Pivot>;
  animations: Record<string, Pivot>;
};

export const emptyPivotOverrides: PivotOverrideState = {
  frames: {},
  animations: {}
};
```

- [ ] **Step 2: Add override application helpers**

Continue in `apps/web/src/lib/pivotOverrides.ts`:

```ts
export function applyPivotOverrides({
  frames,
  animations,
  overrides
}: {
  frames: readonly SpriteFrame[];
  animations: readonly AnimationTag[];
  overrides: PivotOverrideState;
}): SpriteFrame[] {
  const animationByFrameName = new Map<string, string>();
  for (const animation of animations) {
    for (const frameName of animation.frameNames) {
      animationByFrameName.set(frameName, animation.name);
    }
  }

  return frames.map((frame) => {
    const animationName = animationByFrameName.get(frame.name);
    const pivot = overrides.frames[frame.name] ?? (animationName ? overrides.animations[animationName] : undefined);
    return {
      ...frame,
      rect: { ...frame.rect },
      ...(frame.sourceRect ? { sourceRect: { ...frame.sourceRect } } : {}),
      pivot: pivot ? { ...pivot } : { ...frame.pivot },
      ...(frame.tags ? { tags: [...frame.tags] } : {})
    };
  });
}
```

Add mutator helpers:

```ts
export function setFramePivotOverride(state: PivotOverrideState, frameName: string, pivot: Pivot): PivotOverrideState {
  return {
    frames: { ...state.frames, [frameName]: clampPivot(pivot) },
    animations: { ...state.animations }
  };
}

export function clearFramePivotOverride(state: PivotOverrideState, frameName: string): PivotOverrideState {
  const { [frameName]: _removed, ...frames } = state.frames;
  return { frames, animations: { ...state.animations } };
}

export function setAnimationPivotOverride(state: PivotOverrideState, animationName: string, pivot: Pivot): PivotOverrideState {
  return {
    frames: { ...state.frames },
    animations: { ...state.animations, [animationName]: clampPivot(pivot) }
  };
}

export function clearAnimationPivotOverride(state: PivotOverrideState, animationName: string): PivotOverrideState {
  const { [animationName]: _removed, ...animations } = state.animations;
  return { frames: { ...state.frames }, animations };
}

export function renamePivotOverrides({
  overrides,
  frameNames,
  animationNames
}: {
  overrides: PivotOverrideState;
  frameNames: ReadonlyMap<string, string>;
  animationNames?: ReadonlyMap<string, string>;
}): PivotOverrideState {
  const frames: Record<string, Pivot> = {};
  for (const [name, pivot] of Object.entries(overrides.frames)) {
    frames[frameNames.get(name) ?? name] = { ...pivot };
  }

  const animations: Record<string, Pivot> = {};
  for (const [name, pivot] of Object.entries(overrides.animations)) {
    animations[animationNames?.get(name) ?? name] = { ...pivot };
  }

  return { frames, animations };
}

function clampPivot(pivot: Pivot): Pivot {
  return {
    x: Math.max(0, Math.round(Number.isFinite(pivot.x) ? pivot.x : 0)),
    y: Math.max(0, Math.round(Number.isFinite(pivot.y) ? pivot.y : 0))
  };
}
```

- [ ] **Step 3: Add tests**

Create `apps/web/src/lib/pivotOverrides.test.ts` covering:

- frame override wins over animation override
- animation override applies to all frames in that tag
- unrelated frames keep existing pivot
- clearing frame and animation overrides removes them
- rename helper preserves overrides across clip/frame renames

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- pivotOverrides
```

Expected: pass.

Commit:

```powershell
git add apps/web/src/lib/pivotOverrides.ts apps/web/src/lib/pivotOverrides.test.ts
git commit -m "feat(web): add pivot override model"
```

---

### Task 4: Fixture Coverage for Unstable Sheets

**Parallelizable:** Worker B may own this task after Task 1.

**Files:**
- Modify: `packages/fixtures/src/unevenSpriteSheets.ts`
- Modify or create fixture tests if the package already has a matching test file

- [ ] **Step 1: Add a baseline drift fixture**

Add a fixture such as `baseline-drift-animation-sheet`:

```ts
{
  id: "baseline-drift-animation-sheet",
  name: "Baseline drift animation sheet",
  description: "Synthetic walk cycle with stable cell dimensions but inconsistent pivots and content centers.",
  width: 160,
  height: 40,
  frameWidth: 32,
  frameHeight: 32,
  rows: 1,
  columns: 4,
  margin: 2,
  spacing: 6,
  rowFrameCounts: [4],
  animationNames: ["walk_down"],
  expectedWarnings: ["baseline-drift", "content-center-drift"]
}
```

If the fixture generator requires pixel drawing data, draw the same small silhouette at different vertical offsets while keeping the cell size constant.

- [ ] **Step 2: Add fixture test coverage**

If there is an existing fixtures test, extend it so the new fixture appears in the exported fixture catalog and includes `expectedWarnings`.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/fixtures
npm run test -w @pixelaid/fixtures
```

Expected: pass.

Commit:

```powershell
git add packages/fixtures/src/unevenSpriteSheets.ts packages/fixtures/src/*test.ts
git commit -m "test(fixtures): add unstable animation sheet fixture"
```

---

### Task 5: Integrate Diagnostics with Normalization and Export

**Files:**
- Modify: `apps/web/src/lib/frameNormalization.ts`
- Modify: `apps/web/src/lib/frameNormalization.test.ts`
- Modify: `apps/web/src/lib/normalizedSheetExport.ts`
- Modify or create: `apps/web/src/lib/normalizedSheetExport.test.ts`

- [ ] **Step 1: Add preview diagnostics helper**

In `apps/web/src/lib/frameNormalization.ts`, import `analyzeFrameStability` from `@pixelaid/exporters` and expose a tiny web helper:

```ts
import { analyzeFrameStability } from "@pixelaid/exporters";
import type { FrameStabilityDiagnostics, SpriteFrame } from "@pixelaid/shared";

export function getFramePreviewDiagnostics(frames: readonly SpriteFrame[]): FrameStabilityDiagnostics {
  return analyzeFrameStability(frames);
}
```

If the current import list already includes `SpriteFrame`, merge the type import rather than creating a duplicate import.

- [ ] **Step 2: Preserve diagnostics-sensitive metadata in tests**

Add tests to `apps/web/src/lib/frameNormalization.test.ts`:

```ts
test("reports timeline frame stability diagnostics", () => {
  const diagnostics = getFramePreviewDiagnostics([
    frames[0]!,
    { ...frames[1]!, pivot: { x: 18, y: 34 } }
  ]);

  expect(diagnostics.issues.map((issue) => issue.code)).toContain("baseline-drift");
  expect(diagnostics.issues.map((issue) => issue.code)).toContain("pivot-drift");
});
```

- [ ] **Step 3: Add normalized export diagnostics test**

Create or extend `apps/web/src/lib/normalizedSheetExport.test.ts` so a normalized export using corrected pivots:

- produces a shared frame size
- preserves `durationMs`
- preserves `tags`
- updates `result.settings.sheet`
- updates `result.metrics.outputWidth` and `result.metrics.outputHeight`

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- frameNormalization normalizedSheetExport
```

Expected: pass.

Commit:

```powershell
git add apps/web/src/lib/frameNormalization.ts apps/web/src/lib/frameNormalization.test.ts apps/web/src/lib/normalizedSheetExport.ts apps/web/src/lib/normalizedSheetExport.test.ts
git commit -m "feat(web): expose timeline stability diagnostics"
```

---

### Task 6: Timeline UI Warnings and Pivot Controls

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/FramePreviewCanvas.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/lib/pivotOverrides.ts` only if integration reveals missing helper

- [ ] **Step 1: Add state and computed corrected frames**

In `apps/web/src/App.tsx`, import:

```ts
import { analyzeFrameStability } from "@pixelaid/exporters";
import {
  applyPivotOverrides,
  clearAnimationPivotOverride,
  clearFramePivotOverride,
  emptyPivotOverrides,
  renamePivotOverrides,
  setAnimationPivotOverride,
  setFramePivotOverride,
  type PivotOverrideState
} from "./lib/pivotOverrides";
```

Add state near frame duration overrides:

```ts
const [pivotOverrides, setPivotOverrides] = useState<PivotOverrideState>(emptyPivotOverrides);
```

Change frame derivation from:

```ts
const sheetFrames = useMemo(
  () => applyFrameDurationOverrides(baseSheetFrames, frameDurationOverrides),
  [baseSheetFrames, frameDurationOverrides]
);
```

to:

```ts
const timedSheetFrames = useMemo(
  () => applyFrameDurationOverrides(baseSheetFrames, frameDurationOverrides),
  [baseSheetFrames, frameDurationOverrides]
);
const sheetFrames = useMemo(
  () =>
    applyPivotOverrides({
      frames: timedSheetFrames,
      animations: detectedRowAnimations,
      overrides: pivotOverrides
    }),
  [detectedRowAnimations, pivotOverrides, timedSheetFrames]
);
```

- [ ] **Step 2: Reset and rename overrides with asset/frame lifecycle**

In `resetSheetState`, add:

```ts
setPivotOverrides(emptyPivotOverrides);
```

When Auto Suggest / detection replaces sheet frames, also clear pivot overrides.

When `renameDetectedAnimation(...)` updates frame names, add:

```ts
setPivotOverrides((current) =>
  renamePivotOverrides({
    overrides: current,
    frameNames: result.frameNameMap,
    animationNames: new Map([[fromName, result.selectedAnimationName]])
  })
);
```

- [ ] **Step 3: Compute diagnostics and affected frame lookup**

Near timeline state:

```ts
const timelineStabilityDiagnostics = useMemo(
  () => (timelineFrames.length > 0 ? analyzeFrameStability(timelineFrames) : null),
  [timelineFrames]
);
const affectedTimelineFrameNames = useMemo(
  () => new Set(timelineStabilityDiagnostics?.issues.flatMap((issue) => issue.affectedFrameNames) ?? []),
  [timelineStabilityDiagnostics]
);
const currentFrameIssues = useMemo(
  () => timelineStabilityDiagnostics?.issues.filter((issue) => (currentFrame ? issue.affectedFrameNames.includes(currentFrame.name) : false)) ?? [],
  [currentFrame, timelineStabilityDiagnostics]
);
```

- [ ] **Step 4: Add manual pivot correction callbacks**

Add callbacks near other timeline callbacks:

```ts
const updateCurrentFramePivot = useCallback(
  (axis: "x" | "y", value: number) => {
    if (!currentFrame) {
      return;
    }
    const nextPivot = {
      x: axis === "x" ? value : currentFrame.pivot.x,
      y: axis === "y" ? value : currentFrame.pivot.y
    };
    setPivotOverrides((current) => setFramePivotOverride(current, currentFrame.name, nextPivot));
  },
  [currentFrame]
);

const updateSelectedAnimationPivot = useCallback(
  (axis: "x" | "y", value: number) => {
    if (selectedAnimationName === ALL_ANIMATIONS || !currentFrame) {
      return;
    }
    const nextPivot = {
      x: axis === "x" ? value : currentFrame.pivot.x,
      y: axis === "y" ? value : currentFrame.pivot.y
    };
    setPivotOverrides((current) => setAnimationPivotOverride(current, selectedAnimationName, nextPivot));
  },
  [currentFrame, selectedAnimationName]
);
```

Also add reset callbacks using `clearFramePivotOverride` and `clearAnimationPivotOverride`.

- [ ] **Step 5: Show stability summary and pivot controls**

In the timeline panel near `.player-readout` / `.frame-preview-meta`, add a compact stability block:

```tsx
{timelineStabilityDiagnostics ? (
  <div className={`stability-summary ${timelineStabilityDiagnostics.issues.length > 0 ? "is-warning" : "is-stable"}`}>
    <strong>{timelineStabilityDiagnostics.issues.length > 0 ? "Stability warnings" : "Stable clip"}</strong>
    <span>
      Baseline {timelineStabilityDiagnostics.maxBaselineDeltaPx}px / Pivot {timelineStabilityDiagnostics.maxPivotDeltaPx}px / Center{" "}
      {timelineStabilityDiagnostics.maxContentCenterDeltaPx}px
    </span>
    {timelineStabilityDiagnostics.issues.slice(0, 3).map((issue) => (
      <small key={issue.code}>{issue.message} {issue.affectedFrameNames.join(", ")}</small>
    ))}
  </div>
) : null}
```

Add pivot controls for selected frame:

```tsx
{currentFrame ? (
  <div className="pivot-correction-controls" aria-label="Pivot correction">
    <NumberField label="Frame pivot X" value={currentFrame.pivot.x} min={0} max={currentFrame.rect.w} onChange={(value) => updateCurrentFramePivot("x", value)} />
    <NumberField label="Frame pivot Y" value={currentFrame.pivot.y} min={0} max={currentFrame.rect.h} onChange={(value) => updateCurrentFramePivot("y", value)} />
    <button type="button" onClick={() => setPivotOverrides((current) => clearFramePivotOverride(current, currentFrame.name))}>Reset frame</button>
    {selectedAnimationName !== ALL_ANIMATIONS ? (
      <button type="button" onClick={() => setPivotOverrides((current) => setAnimationPivotOverride(current, selectedAnimationName, currentFrame.pivot))}>Apply to clip</button>
    ) : null}
  </div>
) : null}
```

If this creates visual density issues, place the controls in the existing frame preview meta area rather than adding a new panel.

- [ ] **Step 6: Mark affected timeline frames**

Change the timeline rail button class from:

```tsx
className={globalFrameIndex === selectedFrameIndex ? "active" : ""}
```

to:

```tsx
className={[
  globalFrameIndex === selectedFrameIndex ? "active" : "",
  affectedTimelineFrameNames.has(frame.name) ? "has-stability-warning" : ""
].filter(Boolean).join(" ")}
```

Update the title to include warnings:

```tsx
title={`${frame.name} ${frame.rect.w}x${frame.rect.h} ${Math.round(frame.durationMs)}ms${
  affectedTimelineFrameNames.has(frame.name) ? " stability warning" : ""
}`}
```

- [ ] **Step 7: Draw warning overlay in frame preview**

In `apps/web/src/components/FramePreviewCanvas.tsx`, add optional prop:

```ts
stabilityWarning?: boolean;
```

After drawing the normal frame border, add:

```ts
if (stabilityWarning) {
  context.strokeStyle = "#f1c75b";
  context.setLineDash([4, 3]);
  context.strokeRect(startX + 2.5, startY + 2.5, drawWidth - 5, drawHeight - 5);
  context.setLineDash([]);
}
```

Pass it from `App.tsx`:

```tsx
stabilityWarning={currentFrameIssues.length > 0}
```

- [ ] **Step 8: Add CSS**

Add styles to `apps/web/src/styles.css`:

```css
.stability-summary {
  display: grid;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 1px solid var(--line);
  background: var(--surface-2);
  border-radius: 6px;
}

.stability-summary.is-warning {
  border-color: #76583a;
}

.stability-summary strong {
  color: var(--cyan);
}

.stability-summary.is-warning strong,
.timeline-rail button.has-stability-warning:not(.active) strong {
  color: var(--amber);
}

.pivot-correction-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem;
}

.pivot-correction-controls button {
  min-height: 28px;
}

.timeline-rail button.has-stability-warning {
  border-color: #76583a;
}
```

- [ ] **Step 9: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web
```

Expected: pass.

Commit:

```powershell
git add apps/web/src/App.tsx apps/web/src/components/FramePreviewCanvas.tsx apps/web/src/styles.css apps/web/src/lib/pivotOverrides.ts
git commit -m "feat(web): surface animation stability controls"
```

---

### Task 7: Docs and Phase 3 Handoff

**Files:**
- Modify: `docs/editor.md`
- Modify: `docs/algorithms.md`
- Modify: `docs/performance.md` only if there are new performance notes

- [ ] **Step 1: Document the stability model**

In `docs/algorithms.md`, add a short section under sheet normalization:

```md
### Animation Stability Diagnostics

PixelAid currently performs metadata-first stability checks for sprite sheets. It compares baseline, pivot, frame size, content center, and duration across the selected clip. These diagnostics are intentionally inspect-first: they warn about likely wobble or drift without rewriting pixels automatically.
```

- [ ] **Step 2: Document UI controls**

In `docs/editor.md`, update the timeline/sprite player section with:

- stability summary
- affected frame markers
- per-frame pivot override
- apply pivot to clip
- normalized export uses corrected frame pivots

- [ ] **Step 3: Add MIG-12 handoff note**

Add a short note to the plan or final implementation summary:

- MIG-12 should consume normalized/corrected frames when building expanded bundles.
- Any future generic bundle manifest diagnostics should include or reference `FrameStabilityDiagnostics`.
- Palette `.hex`, `.gpl`, JSON, PNG frame sequence, and ZIP bundle expansion remain in MIG-12.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run typecheck
npm run test
npm run build
```

Expected: pass.

Commit:

```powershell
git add docs/editor.md docs/algorithms.md docs/performance.md docs/superpowers/plans/2026-04-28-mig-11-animation-stability.md
git commit -m "docs(web): document animation stability workflow"
```

---

### Task 8: Final Verification and Linear Update

**Files:**
- No planned file changes beyond any fixes discovered during verification.

- [ ] **Step 1: Full verification**

Run:

```powershell
npm run test
npm run build
```

Expected: all workspaces pass.

- [ ] **Step 2: Manual UI smoke test**

Start dev server:

```powershell
npm run dev -- --host 127.0.0.1
```

Open the app and verify:

- a sprite sheet import still selects the detected asset type per imported asset
- timeline playback still works
- Normalize still affects preview and export
- unstable frames show warning markers
- per-frame pivot changes update preview and normalized export
- reset frame clears only the selected frame override
- apply to clip updates frames in the selected animation

- [ ] **Step 3: Update Linear**

Update `MIG-11` with:

- implementation summary
- verification commands
- note that `MIG-12` remains next for expanded generic exports

Move `MIG-11` only when verification is complete.

- [ ] **Step 4: Merge/handoff**

After user approval, integrate `codex/mig-11-animation-stability` back into `codex/pixelaid-roadmap-foundation`, then create the local `MIG-12` worktree.

---

## Acceptance Criteria

- The app computes deterministic `FrameStabilityDiagnostics` for selected timeline frames.
- Baseline, pivot, frame-size, content-center, and duration issues are reported with affected frame names.
- Timeline frames with stability issues are visibly marked.
- The frame preview canvas can highlight current-frame stability warnings.
- Users can set and clear per-frame pivot overrides.
- Users can apply a pivot override to the selected clip.
- Pivot overrides affect normalized preview and normalized export.
- Frame names, animation tags, durations, source rects, and manifest animation IDs are preserved.
- All changes pass `npm run test` and `npm run build`.

## Phase 3B Preview: MIG-12

After `MIG-11` is merged, execute `MIG-12` in a fresh local worktree:

1. Add generic export bundle expansion for PNG frame sequence, palette `.hex`, `.gpl`, palette JSON, manifest JSON, and ZIP bundle layout.
2. Reuse corrected/normalized frames from `MIG-11` rather than recalculating pivots in the exporter.
3. Add manifest validation for expanded bundle metadata and stability diagnostics references.
4. Add docs for generic engine handoff before starting Godot/Unity adapters in `MIG-14`.
