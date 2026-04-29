# MIG-21 Timeline Viewport Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move sprite-sheet animation playback into the main Timeline viewport with Input, Output, and Compare playback sources.

**Architecture:** Keep playback controls in React, but move live frame animation into a canvas component that owns its `requestAnimationFrame` loop through refs. The app keeps selected clip, selected frame, timing, and edit metadata as normal editor state; the timeline canvas animates from that state and commits the live frame back to React only when playback stops, scrubs, steps, or changes source/clip.

**Tech Stack:** React, TypeScript, Canvas2D, Vite, Vitest, existing `playbackModel`, existing frame normalization helpers, Playwright browser verification.

---

## Current Baseline

- Worktree: `C:/dev/Mighty/pixel-aid/.worktrees/mig-21-timeline-viewport-player`
- Branch: `codex/mig-21-timeline-viewport-player`
- Base: `codex/pixelaid-roadmap-foundation` at `d310ab2`
- Baseline verification already run:
  - `npm run typecheck` passed.
  - `npm run test` passed.

---

## Files And Responsibilities

- Create `apps/web/src/lib/timelineViewportSources.ts`
  - Pure source-mode helpers for Input, Output, and Compare availability.
- Create `apps/web/src/lib/timelineViewportSources.test.ts`
  - Tests for source-mode options and coercion.
- Create `apps/web/src/lib/timelineViewportLayout.ts`
  - Pure canvas pane layout helpers for single-source and compare playback surfaces.
- Create `apps/web/src/lib/timelineViewportLayout.test.ts`
  - Tests for pane layout, scale, and selected-source behavior.
- Create `apps/web/src/components/SpritePlayerControls.tsx`
  - Reusable playback controls currently embedded in `App.tsx`.
- Create `apps/web/src/components/TimelineViewportCanvas.tsx`
  - Canvas2D renderer for live timeline playback, Input/Output/Compare drawing, onion overlays, frame bounds, pivot, and in-canvas frame readout.
- Modify `apps/web/src/App.tsx`
  - Wire Timeline viewport source mode, use extracted controls, render the new timeline viewport, and remove the old per-frame React playback loop.
- Modify `apps/web/src/lib/viewportModes.ts`
  - Keep Timeline as a real editor view mode and prevent code from treating it as only a before/after canvas alias.
- Modify `apps/web/src/lib/viewportModes.test.ts`
  - Adjust or add tests for Timeline mode behavior.
- Modify `apps/web/src/styles.css`
  - Add Timeline viewport/player layout styles and remove bottom-panel duplicate-player assumptions.
- Modify `docs/editor.md`
  - Document Timeline viewport source modes and compare playback.

---

## Task 1: Pure Timeline Source Mode Helpers

**Files:**
- Create `apps/web/src/lib/timelineViewportSources.ts`
- Create `apps/web/src/lib/timelineViewportSources.test.ts`
- Modify `apps/web/src/lib/viewportModes.ts`
- Modify `apps/web/src/lib/viewportModes.test.ts`

- [x] **Step 1: Write failing source-mode tests**

Create `apps/web/src/lib/timelineViewportSources.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  coerceTimelineViewportSourceMode,
  getTimelineViewportSourceOptions,
  type TimelineViewportSourceMode
} from "./timelineViewportSources";

describe("timeline viewport sources", () => {
  test("offers input only before a fixed output exists", () => {
    expect(getTimelineViewportSourceOptions({ hasInput: true, hasOutput: false })).toEqual([
      { mode: "input", label: "Input", enabled: true }
    ]);
  });

  test("offers input output and compare when both sources exist", () => {
    expect(getTimelineViewportSourceOptions({ hasInput: true, hasOutput: true })).toEqual([
      { mode: "input", label: "Input", enabled: true },
      { mode: "output", label: "Output", enabled: true },
      { mode: "compare", label: "Compare", enabled: true }
    ]);
  });

  test("coerces unavailable source modes to the first available source", () => {
    expect(coerceTimelineViewportSourceMode("compare", { hasInput: true, hasOutput: false })).toBe("input");
    expect(coerceTimelineViewportSourceMode("output", { hasInput: true, hasOutput: true })).toBe("output");
    expect(coerceTimelineViewportSourceMode("compare", { hasInput: false, hasOutput: false })).toBe("input");
  });

  test("keeps source mode type narrow", () => {
    const mode: TimelineViewportSourceMode = "compare";
    expect(mode).toBe("compare");
  });
});
```

Update `apps/web/src/lib/viewportModes.test.ts` with this expectation:

```ts
test("keeps timeline as a non-canvas editor surface", () => {
  expect(getEditorViewModes("spriteSheet")).toContain("timeline");
  expect(isTimelineEditorViewMode("timeline")).toBe(true);
  expect(isTimelineEditorViewMode("before")).toBe(false);
});
```

- [x] **Step 2: Run tests and verify they fail**

Run:

```powershell
npm run test -w @pixelaid/web -- timelineViewportSources.test.ts viewportModes.test.ts
```

Expected: FAIL because `timelineViewportSources.ts` and `isTimelineEditorViewMode` do not exist yet.

- [x] **Step 3: Implement source-mode helpers**

Create `apps/web/src/lib/timelineViewportSources.ts`:

```ts
export type TimelineViewportSourceMode = "input" | "output" | "compare";

export type TimelineViewportSourceOption = {
  mode: TimelineViewportSourceMode;
  label: string;
  enabled: boolean;
};

export function getTimelineViewportSourceOptions({
  hasInput,
  hasOutput
}: {
  hasInput: boolean;
  hasOutput: boolean;
}): TimelineViewportSourceOption[] {
  const options: TimelineViewportSourceOption[] = [];
  if (hasInput) {
    options.push({ mode: "input", label: "Input", enabled: true });
  }
  if (hasOutput) {
    options.push({ mode: "output", label: "Output", enabled: true });
  }
  if (hasInput && hasOutput) {
    options.push({ mode: "compare", label: "Compare", enabled: true });
  }
  return options.length > 0 ? options : [{ mode: "input", label: "Input", enabled: false }];
}

export function coerceTimelineViewportSourceMode(
  mode: TimelineViewportSourceMode,
  availability: { hasInput: boolean; hasOutput: boolean }
): TimelineViewportSourceMode {
  const options = getTimelineViewportSourceOptions(availability);
  return options.some((option) => option.enabled && option.mode === mode) ? mode : options[0]?.mode ?? "input";
}
```

Update `apps/web/src/lib/viewportModes.ts`:

```ts
export function isTimelineEditorViewMode(viewMode: EditorViewMode): viewMode is "timeline" {
  return viewMode === "timeline";
}
```

- [x] **Step 4: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/web -- timelineViewportSources.test.ts viewportModes.test.ts
npm run typecheck -w @pixelaid/web
```

Commit:

```powershell
git add apps/web/src/lib/timelineViewportSources.ts apps/web/src/lib/timelineViewportSources.test.ts apps/web/src/lib/viewportModes.ts apps/web/src/lib/viewportModes.test.ts
git commit -m "feat(web): add timeline viewport source model"
```

---

## Task 2: Pure Timeline Viewport Layout Helpers

**Files:**
- Create `apps/web/src/lib/timelineViewportLayout.ts`
- Create `apps/web/src/lib/timelineViewportLayout.test.ts`

- [x] **Step 1: Write failing layout tests**

Create `apps/web/src/lib/timelineViewportLayout.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { getTimelineViewportLayout } from "./timelineViewportLayout";

describe("timeline viewport layout", () => {
  test("centers a single source pane with integer pixel scale", () => {
    const layout = getTimelineViewportLayout({
      viewport: { width: 800, height: 500 },
      mode: "input",
      inputCanvas: { width: 64, height: 64 },
      outputCanvas: null
    });

    expect(layout.panes).toEqual([
      {
        id: "input",
        label: "Input",
        drawRect: { x: 176, y: 26, w: 448, h: 448 },
        canvas: { width: 64, height: 64 },
        scale: 7
      }
    ]);
  });

  test("lays out input and output panes for compare mode", () => {
    const layout = getTimelineViewportLayout({
      viewport: { width: 900, height: 420 },
      mode: "compare",
      inputCanvas: { width: 64, height: 64 },
      outputCanvas: { width: 64, height: 64 }
    });

    expect(layout.panes.map((pane) => pane.id)).toEqual(["input", "output"]);
    expect(layout.panes[0]?.scale).toBe(5);
    expect(layout.panes[1]?.scale).toBe(5);
    expect(layout.dividerX).toBe(450);
  });

  test("falls back to input pane when output is unavailable", () => {
    const layout = getTimelineViewportLayout({
      viewport: { width: 500, height: 300 },
      mode: "output",
      inputCanvas: { width: 32, height: 48 },
      outputCanvas: null
    });

    expect(layout.panes.map((pane) => pane.id)).toEqual(["input"]);
  });
});
```

- [x] **Step 2: Run tests and verify they fail**

Run:

```powershell
npm run test -w @pixelaid/web -- timelineViewportLayout.test.ts
```

Expected: FAIL because `timelineViewportLayout.ts` does not exist.

- [x] **Step 3: Implement layout helpers**

Create `apps/web/src/lib/timelineViewportLayout.ts` with:

```ts
import type { TimelineViewportSourceMode } from "./timelineViewportSources";

export type TimelineViewportCanvasSize = {
  width: number;
  height: number;
};

export type TimelineViewportPane = {
  id: "input" | "output";
  label: "Input" | "Output";
  drawRect: { x: number; y: number; w: number; h: number };
  canvas: TimelineViewportCanvasSize;
  scale: number;
};

export type TimelineViewportLayout = {
  panes: TimelineViewportPane[];
  dividerX?: number;
};

export function getTimelineViewportLayout({
  viewport,
  mode,
  inputCanvas,
  outputCanvas
}: {
  viewport: TimelineViewportCanvasSize;
  mode: TimelineViewportSourceMode;
  inputCanvas: TimelineViewportCanvasSize | null;
  outputCanvas: TimelineViewportCanvasSize | null;
}): TimelineViewportLayout {
  const safeViewport = {
    width: Math.max(1, Math.floor(viewport.width)),
    height: Math.max(1, Math.floor(viewport.height))
  };
  const padding = 26;
  if (mode === "compare" && inputCanvas && outputCanvas) {
    const halfWidth = Math.floor(safeViewport.width / 2);
    return {
      panes: [
        createPane("input", "Input", { x: 0, y: 0, width: halfWidth, height: safeViewport.height }, inputCanvas, padding),
        createPane(
          "output",
          "Output",
          { x: halfWidth, y: 0, width: safeViewport.width - halfWidth, height: safeViewport.height },
          outputCanvas,
          padding
        )
      ],
      dividerX: halfWidth
    };
  }

  if (mode === "output" && outputCanvas) {
    return { panes: [createPane("output", "Output", { x: 0, y: 0, ...safeViewport }, outputCanvas, padding)] };
  }

  if (inputCanvas) {
    return { panes: [createPane("input", "Input", { x: 0, y: 0, ...safeViewport }, inputCanvas, padding)] };
  }

  if (outputCanvas) {
    return { panes: [createPane("output", "Output", { x: 0, y: 0, ...safeViewport }, outputCanvas, padding)] };
  }

  return { panes: [] };
}

function createPane(
  id: "input" | "output",
  label: "Input" | "Output",
  bounds: { x: number; y: number; width: number; height: number },
  canvas: TimelineViewportCanvasSize,
  padding: number
): TimelineViewportPane {
  const availableWidth = Math.max(1, bounds.width - padding * 2);
  const availableHeight = Math.max(1, bounds.height - padding * 2);
  const scale = Math.max(1, Math.floor(Math.min(availableWidth / Math.max(1, canvas.width), availableHeight / Math.max(1, canvas.height))));
  const w = Math.max(1, canvas.width * scale);
  const h = Math.max(1, canvas.height * scale);
  return {
    id,
    label,
    canvas,
    scale,
    drawRect: {
      x: Math.floor(bounds.x + (bounds.width - w) / 2),
      y: Math.floor(bounds.y + (bounds.height - h) / 2),
      w,
      h
    }
  };
}
```

- [x] **Step 4: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/web -- timelineViewportLayout.test.ts
npm run typecheck -w @pixelaid/web
```

Commit:

```powershell
git add apps/web/src/lib/timelineViewportLayout.ts apps/web/src/lib/timelineViewportLayout.test.ts
git commit -m "feat(web): add timeline viewport layout model"
```

---

## Task 3: Extract Reusable Sprite Player Controls

**Files:**
- Create `apps/web/src/components/SpritePlayerControls.tsx`
- Modify `apps/web/src/App.tsx`
- Modify `apps/web/src/styles.css` only if class names need shared scope

- [x] **Step 1: Extract component without behavior change**

Create `SpritePlayerControls` with props for:

```ts
import type { AnimationTag } from "@pixelaid/shared";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { PlaybackDirection } from "../lib/playbackModel";
import { ALL_ANIMATIONS } from "../lib/animationTimeline";

export type SpritePlayerControlsProps = {
  animations: readonly AnimationTag[];
  selectedAnimationName: string;
  canPlay: boolean;
  canScrub: boolean;
  isPlaying: boolean;
  timelinePosition: number;
  frameCount: number;
  playbackFps: number;
  playbackDirection: PlaybackDirection;
  playbackLoop: boolean;
  normalizeTimelineFrames: boolean;
  showOnionSkin: boolean;
  currentFrameDurationMs: number;
  currentFrameDurationInput: number;
  currentFrameSelected: boolean;
  onAnimationChange: (name: string) => void;
  onStep: (direction: -1 | 1) => void;
  onTogglePlayback: () => void;
  onScrub: (position: number) => void;
  onFpsChange: (fps: number) => void;
  onDirectionChange: (direction: PlaybackDirection) => void;
  onDurationChange: (durationMs: number) => void;
  onLoopChange: (loop: boolean) => void;
  onNormalizeChange: (enabled: boolean) => void;
  onOnionSkinChange: (enabled: boolean) => void;
};
```

Move the existing `player-controls` JSX from `App.tsx` into this component. Keep the same class names so styles stay stable.

- [x] **Step 2: Use component in the existing bottom panel**

In `App.tsx`, replace the inline controls with:

```tsx
<SpritePlayerControls
  animations={detectedRowAnimations}
  selectedAnimationName={selectedAnimationName}
  canPlay={canPlayTimeline}
  canScrub={canScrubTimeline}
  isPlaying={isPlaying}
  timelinePosition={timelinePosition}
  frameCount={timelineFrames.length}
  playbackFps={playbackFps}
  playbackDirection={playbackDirection}
  playbackLoop={playbackLoop}
  normalizeTimelineFrames={normalizeTimelineFrames}
  showOnionSkin={showOnionSkin}
  currentFrameDurationMs={currentFrameDurationMs}
  currentFrameDurationInput={currentFrame ? Math.round(currentFrame.durationMs) : 0}
  currentFrameSelected={currentFrame !== undefined}
  onAnimationChange={changeSelectedAnimation}
  onStep={stepTimelineFrame}
  onTogglePlayback={togglePlayback}
  onScrub={selectPlaybackFrame}
  onFpsChange={changePlaybackFps}
  onDirectionChange={changePlaybackDirection}
  onDurationChange={updateSelectedFrameDuration}
  onLoopChange={setPlaybackLoop}
  onNormalizeChange={setNormalizeTimelineFrames}
  onOnionSkinChange={setShowOnionSkin}
/>
```

- [x] **Step 3: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- playbackModel.test.ts
```

Commit:

```powershell
git add apps/web/src/components/SpritePlayerControls.tsx apps/web/src/App.tsx apps/web/src/styles.css
git commit -m "refactor(web): extract sprite player controls"
```

---

## Task 4: Canvas Timeline Viewport Player

**Files:**
- Create `apps/web/src/components/TimelineViewportCanvas.tsx`
- Modify `apps/web/src/styles.css`

- [x] **Step 1: Implement the canvas component**

Create `TimelineViewportCanvas` with props:

```ts
import type { RGBAImage } from "@pixelaid/shared";
import type { FramePreviewPlacement } from "../lib/frameNormalization";
import type { PlaybackDirection, PlaybackStepDirection } from "../lib/playbackModel";
import type { TimelineViewportSourceMode } from "../lib/timelineViewportSources";

export type TimelineViewportCanvasProps = {
  inputImage: RGBAImage | null;
  outputImage: RGBAImage | null;
  inputPlacements: readonly FramePreviewPlacement[];
  outputPlacements: readonly FramePreviewPlacement[];
  sourceMode: TimelineViewportSourceMode;
  selectedTimelinePosition: number;
  isPlaying: boolean;
  fps: number;
  loop: boolean;
  direction: PlaybackDirection;
  playDirection: PlaybackStepDirection;
  showOnionSkin: boolean;
  onFrameCommit: (timelinePosition: number, playDirection: PlaybackStepDirection) => void;
};
```

Implementation rules:
- Use one `<canvas>` with `imageSmoothingEnabled = false`.
- Cache `RGBAImage` into `HTMLCanvasElement` with `useMemo`, not inside the RAF tick.
- Store live frame index, accumulator, play direction, last timestamp, and RAF id in refs.
- Use `tickPlayback` from `playbackModel`.
- Draw Input, Output, or Compare using `getTimelineViewportLayout`.
- Draw previous/next onion placements when enabled.
- Draw frame bounds, pivot crosshair, source label, and in-canvas frame count text.
- Do not call React state setters on each frame.
- Call `onFrameCommit` when playback stops, source/clip changes, or the component unmounts while playing.

- [x] **Step 2: Add styles**

Add styles:

```css
.timeline-viewport-player {
  min-width: 0;
  min-height: 0;
  position: relative;
  display: grid;
  background: #101112;
}

.timeline-viewport-player canvas {
  width: 100%;
  height: 100%;
  display: block;
}
```

- [x] **Step 3: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- timelineViewportLayout.test.ts playbackModel.test.ts
```

Commit:

```powershell
git add apps/web/src/components/TimelineViewportCanvas.tsx apps/web/src/styles.css
git commit -m "feat(web): add timeline viewport canvas player"
```

---

## Task 5: App Integration And Bottom Panel Cleanup

**Files:**
- Modify `apps/web/src/App.tsx`
- Modify `apps/web/src/styles.css`
- Modify `docs/editor.md`

- [x] **Step 1: Add Timeline viewport source state**

In `App.tsx`:

```ts
const [timelineViewportSourceMode, setTimelineViewportSourceMode] = useState<TimelineViewportSourceMode>("input");
const timelineViewportSourceOptions = useMemo(
  () => getTimelineViewportSourceOptions({ hasInput: sourceTimelineFrames.length > 0, hasOutput: fixResult !== null && timelineFrames.length > 0 }),
  [fixResult, sourceTimelineFrames.length, timelineFrames.length]
);
useEffect(() => {
  setTimelineViewportSourceMode((current) =>
    coerceTimelineViewportSourceMode(current, { hasInput: sourceTimelineFrames.length > 0, hasOutput: fixResult !== null && timelineFrames.length > 0 })
  );
}, [fixResult, sourceTimelineFrames.length, timelineFrames.length]);
```

- [x] **Step 2: Derive Input and Output placements**

Use existing helpers:

```ts
const inputTimelinePlacements = useMemo(
  () => (normalizeTimelineFrames ? normalizeFramePlacements(timelineFrames, sourceTimelineFrames) : timelineFrames.map((frame) => getFramePreviewPlacement([frame], 0, false, sourceTimelineFrames.filter((sourceFrame) => sourceFrame.name === frame.name))).filter((placement): placement is FramePreviewPlacement => placement !== null)),
  [normalizeTimelineFrames, sourceTimelineFrames, timelineFrames]
);

const outputTimelinePlacements = useMemo(
  () => (fixResult ? normalizeFramePlacements(timelineFrames) : []),
  [fixResult, timelineFrames]
);
```

If the exact implementation needs clearer code, extract this into a local helper inside `App.tsx` or a small pure helper with tests.

- [x] **Step 3: Render Timeline viewport as a real player**

Inside the viewport panel:
- If `viewMode !== "timeline"`, render existing `ViewportCanvas`.
- If `viewMode === "timeline"`, render:
  - A compact `SpritePlayerControls` row above the canvas or directly under `viewport-strip`.
  - Source mode segmented buttons for Input, Output, Compare.
  - `TimelineViewportCanvas`.

The source controls must be disabled when the source option is unavailable.

- [x] **Step 4: Remove the App-level playback RAF loop**

Remove the `useEffect` that advances `selectedFrameIndex` on every animation frame from `App.tsx`.

Keep:
- `selectPlaybackFrame`
- `stepTimelineFrame`
- `togglePlayback`
- `changePlaybackFps`
- `changePlaybackDirection`

Add a callback:

```ts
const commitTimelineViewportFrame = useCallback(
  (timelinePosition: number, nextPlayDirection: PlaybackStepDirection) => {
    const nextIndex = getFrameIndexFromTimelinePosition(animationFrameIndexes, timelinePosition);
    if (nextIndex >= 0) {
      selectedFrameIndexRef.current = nextIndex;
      setSelectedFrameIndex(nextIndex);
    }
    playbackStepDirectionRef.current = nextPlayDirection;
  },
  [animationFrameIndexes]
);
```

Pass it to `TimelineViewportCanvas`.

- [x] **Step 5: Keep the bottom panel useful without duplicating the main player**

When `showTimelinePanel` is true:
- Remove the bottom `FramePreviewCanvas` player surface.
- Keep clip metadata editing, timeline rail, stability diagnostics, pivot controls, logs, and metrics.
- Rename the section heading from `Sprite Player` to `Timeline Metadata`.

The bottom panel should not render a second animated preview.

- [x] **Step 6: Document the new workflow**

Update `docs/editor.md`:
- Timeline view in the main viewport is the animation player for sheet-like assets.
- Input plays source frame bounds before Fix.
- Output plays fixed output after Fix.
- Compare plays input and output for the same selected row side by side.
- The bottom panel keeps clip metadata, stability, logs, and metrics rather than duplicating the player.

- [x] **Step 7: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/web
npm run test -w @pixelaid/web -- timelineViewportSources.test.ts timelineViewportLayout.test.ts playbackModel.test.ts frameNormalization.test.ts viewportModes.test.ts
```

Commit:

```powershell
git add apps/web/src/App.tsx apps/web/src/styles.css docs/editor.md
git commit -m "feat(web): move sprite player into timeline viewport"
```

---

## Task 6: Browser Verification, Full Checks, Linear, Merge

**Files:**
- Modify this plan checklist as work completes.

- [x] **Step 1: Start the dev server**

Run from the MIG-21 worktree:

```powershell
npx vite --host 127.0.0.1 --port 5175
```

Use another port if 5175 is occupied.

- [x] **Step 2: Browser verify with the robot sheet**

Use:

```txt
C:/Users/oms10/Downloads/ChatGPT Image Apr 24, 2026, 02_56_08 PM.png
```

Manual/browser checks:
- Import sheet and confirm Timeline is the active sheet-like viewport mode.
- Before Fix, Timeline viewport shows Input playback for the selected row.
- Play animates the canvas without console errors.
- Step, scrub, FPS, loop, direction, normalize, and onion controls still affect playback.
- Run Fix.
- Source mode controls now include Input, Output, and Compare.
- Output playback uses fixed output frames.
- Compare playback draws input and output for the same selected row side by side.
- Bottom panel still shows logs/metrics and clip metadata, but no duplicate animated preview.

- [x] **Step 3: Full verification**

Run:

```powershell
npm run typecheck
npm run test
npm run lint
npm run build
```

- [ ] **Step 4: Update Linear and merge**

Add a Linear `MIG-21` comment with:
- changed files
- verification commands
- browser verification summary

Then:

```powershell
git status --short
git -C C:/dev/Mighty/pixel-aid/.worktrees/pixelaid-roadmap-foundation merge --ff-only codex/mig-21-timeline-viewport-player
```

Mark `MIG-21` Done only after the fast-forward merge succeeds.

---

## Self Review

- Spec coverage: Covers main Timeline viewport player, Input/Output/Compare source selection, compare playback for the same row, bottom-panel de-duplication, and RAF playback without React state updates per animation frame.
- Test coverage: Pure source-mode and layout tests are required before UI integration. Existing playback and frame-normalization tests stay in the targeted suite. Browser verification covers Canvas/UI behavior.
- Performance: The plan explicitly moves the live animation loop into `TimelineViewportCanvas` refs and removes the App-level per-frame React state update.
- Parallelization: Task 1 and Task 2 can be done independently. Task 3 should happen before Task 4. Task 5 depends on Tasks 3 and 4. Browser/full verification is serial.
- Deferred: Safer frame dragging remains `MIG-22`. Undo/redo remains `MIG-23`. Outline color picker remains `MIG-24`. Busy-status improvements remain `MIG-25`.
