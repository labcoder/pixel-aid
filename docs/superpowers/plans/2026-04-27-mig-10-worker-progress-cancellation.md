# MIG-10 Worker Progress and Cooperative Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make expensive fix jobs report meaningful progress, reject cancellation without stale results, and expose cooperative cancellation hooks through core phases and worker execution.

**Architecture:** Add a shared progress-stage contract, a small core runtime hook layer, and a worker job controller that emits progress and treats graceful cancellation as preferred while keeping worker termination as browser fallback. Core remains deterministic and synchronous by default; optional runtime hooks provide phase progress and cooperative cancellation checks at phase, row, and sheet-frame boundaries.

**Tech Stack:** TypeScript, Vite/React, Web Worker messages, Vitest, existing npm workspaces.

---

## Current State

- `packages/shared/src/types.ts` has `WorkerProgress` with `stage: string` and `percent: number`.
- `packages/worker/src/protocol.ts` already has progress and cancel request/response shapes.
- `packages/worker/src/pipeline.ts` synchronously calls `fixImage(...)` and returns a single response.
- `packages/worker/src/fix.worker.ts` posts only the final response. It cannot currently stream progress.
- `apps/web/src/lib/fixWorkerClient.ts` treats any worker message as terminal, so progress messages would currently reject as unexpected.
- `apps/web/src/App.tsx` shows `fixStatus` strings and cancels by terminating the worker immediately.
- `packages/core/src/fix.ts` has clear coarse phases: grid detection, downsampling, alpha cleanup, halo/denoise/outline cleanup, palette extraction/remap, and sheet-frame batches.

## Scope Decisions

- Use coarse phase progress, not per-pixel progress. Row-level progress is allowed only in long loops such as downsampling/remap and should be throttled by rows.
- Add cooperative cancellation hooks in core and worker tests. In the browser, cancellation will request graceful cancellation first, then terminate the worker after a short grace delay because a single synchronous worker task cannot always process incoming cancel messages mid-loop.
- Keep existing `fixImage(image, options)` compatible by adding an optional third runtime argument.
- Keep existing `runWorkerRequest(...)` compatible for tests by adding an optional event sink and cancellation token rather than replacing the API completely.
- Do not add dependencies.

## File Structure

- Modify `packages/shared/src/types.ts`
  - Add typed worker/fix progress stages and optional progress message metadata.
- Modify `packages/shared/src/index.ts`
  - Export new progress-stage types.
- Create `packages/core/src/runtime.ts`
  - Define `FixRuntimeOptions`, `FixCancellationSignal`, `FixProgressEvent`, `FixCancelledError`, `assertNotCancelled`, `reportProgress`, and row throttling helpers.
- Modify `packages/core/src/index.ts`
  - Export runtime types/helpers needed by worker tests.
- Modify `packages/core/src/fix.ts`
  - Accept optional runtime hooks, emit phase progress, and check cancellation before/after major phases and across sheet frames.
- Modify `packages/core/src/downsample.ts`
  - Add optional loop runtime/progress settings and check/report per row group.
- Modify `packages/core/src/palette.ts`
  - Add optional remap runtime/progress settings to `remapToPalette`.
- Modify `packages/core/src/core.test.ts`
  - Add tests for progress ordering and cancellation in single and sheet paths.
- Modify `packages/worker/src/protocol.ts`
  - Type progress stages and add a cancellation response shape or consistent cancellation error code.
- Modify `packages/worker/src/pipeline.ts`
  - Add event-sink progress emission, cancellation token support, and cancellation-safe no-result behavior.
- Modify `packages/worker/src/fix.worker.ts`
  - Maintain active job state, post progress messages, handle cancel requests, and transfer result buffers safely.
- Modify `packages/worker/src/index.ts`
  - Export new protocol/controller helpers as needed.
- Modify `packages/worker/src/pipeline.test.ts`
  - Add progress ordering, cancellation response, and no stale result tests.
- Modify `apps/web/src/lib/fixWorkerClient.ts`
  - Handle progress messages, graceful cancel request, termination fallback, and stale-result suppression.
- Create `apps/web/src/lib/fixProgress.ts`
  - Pure helpers for formatting progress stage/percent for UI/logs.
- Create `apps/web/src/lib/fixProgress.test.ts`
  - Tests for progress formatting and log throttling helpers.
- Modify `apps/web/src/App.tsx`
  - Track current progress, pass progress callback to `startFixJob`, update status/logs, and preserve cancel behavior.
- Modify `docs/performance.md`
  - Document progress phases, cooperative cancellation, and termination fallback.

---

### Task 1: Shared Progress Contract

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/shared.test.ts` only if runtime constants are added

- [ ] **Step 1: Add shared progress stage types**

In `packages/shared/src/types.ts`, add:

```ts
export type WorkerProgressStage =
  | "decode-prep"
  | "grid-detection"
  | "frame-slicing"
  | "downsampling"
  | "alpha-cleanup"
  | "palette-remap"
  | "export-prep"
  | "complete"
  | "cancelled";
```

Update `WorkerProgress`:

```ts
export type WorkerProgress = {
  requestId: string;
  stage: WorkerProgressStage;
  percent: number;
  message?: string;
};
```

- [ ] **Step 2: Export progress types**

Update `packages/shared/src/index.ts` so `WorkerProgressStage` and the updated `WorkerProgress` are exported with the other shared types.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run typecheck -w @pixelaid/shared
npm run test -w @pixelaid/shared
```

Expected: pass.

Commit:

```powershell
git add packages/shared/src/types.ts packages/shared/src/index.ts
git commit -m "feat(shared): type worker progress stages"
```

---

### Task 2: Core Runtime Hooks

**Files:**
- Create: `packages/core/src/runtime.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/core.test.ts`

- [ ] **Step 1: Add failing runtime tests**

In `packages/core/src/core.test.ts`, add a new `describe("fix runtime hooks", ...)` section:

```ts
test("throws a typed cancellation error when the runtime signal is aborted", () => {
  const signal = { aborted: true, reason: "user cancelled" };

  expect(() => assertNotCancelled(signal)).toThrow(FixCancelledError);
});

test("clamps progress events to a percent range", () => {
  const events: FixProgressEvent[] = [];

  reportProgress({ onProgress: (event) => events.push(event) }, "downsampling", 120, "too high");
  reportProgress({ onProgress: (event) => events.push(event) }, "grid-detection", -10);

  expect(events).toEqual([
    { stage: "downsampling", percent: 100, message: "too high" },
    { stage: "grid-detection", percent: 0 }
  ]);
});
```

Add imports from `./index`:

```ts
import { assertNotCancelled, FixCancelledError, reportProgress, type FixProgressEvent } from "./index";
```

Run:

```powershell
npm run test -w @pixelaid/core -- src/core.test.ts -t "fix runtime hooks"
```

Expected: fail until runtime helpers exist.

- [ ] **Step 2: Create runtime helpers**

Create `packages/core/src/runtime.ts`:

```ts
import type { WorkerProgressStage } from "@pixelaid/shared";

export type FixProgressEvent = {
  stage: WorkerProgressStage;
  percent: number;
  message?: string;
};

export type FixCancellationSignal = {
  readonly aborted: boolean;
  readonly reason?: string;
};

export type FixRuntimeOptions = {
  signal?: FixCancellationSignal;
  onProgress?: (event: FixProgressEvent) => void;
};

export class FixCancelledError extends Error {
  constructor(message = "Fix cancelled") {
    super(message);
    this.name = "FixCancelledError";
  }
}

export function assertNotCancelled(signal: FixCancellationSignal | undefined): void {
  if (signal?.aborted) {
    throw new FixCancelledError(signal.reason ?? "Fix cancelled");
  }
}

export function reportProgress(runtime: FixRuntimeOptions | undefined, stage: WorkerProgressStage, percent: number, message?: string): void {
  if (!runtime?.onProgress) {
    return;
  }

  const event: FixProgressEvent = {
    stage,
    percent: clampPercent(percent)
  };
  if (message) {
    event.message = message;
  }
  runtime.onProgress(event);
}

export function shouldReportRow(row: number, rowCount: number): boolean {
  if (row === 0 || row + 1 >= rowCount) {
    return true;
  }
  const stride = Math.max(1, Math.floor(rowCount / 16));
  return row % stride === 0;
}

export function phasePercent(start: number, end: number, completed: number, total: number): number {
  if (total <= 0) {
    return end;
  }
  const ratio = Math.max(0, Math.min(1, completed / total));
  return start + (end - start) * ratio;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}
```

- [ ] **Step 3: Export runtime helpers**

Update `packages/core/src/index.ts`:

```ts
export {
  assertNotCancelled,
  FixCancelledError,
  phasePercent,
  reportProgress,
  shouldReportRow
} from "./runtime";
export type { FixCancellationSignal, FixProgressEvent, FixRuntimeOptions } from "./runtime";
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/core -- src/core.test.ts -t "fix runtime hooks"
npm run typecheck -w @pixelaid/core
```

Expected: pass.

Commit:

```powershell
git add packages/core/src/runtime.ts packages/core/src/index.ts packages/core/src/core.test.ts
git commit -m "feat(core): add fix runtime hooks"
```

---

### Task 3: Core Progress and Cancellation Instrumentation

**Files:**
- Modify: `packages/core/src/fix.ts`
- Modify: `packages/core/src/downsample.ts`
- Modify: `packages/core/src/palette.ts`
- Modify: `packages/core/src/core.test.ts`

- [ ] **Step 1: Add failing progress/cancel tests**

In `packages/core/src/core.test.ts`, add tests:

```ts
test("reports coarse single-image fix progress in order", () => {
  const events: FixProgressEvent[] = [];

  const result = fixImage(blockySource(), defaultOptions, {
    onProgress: (event) => events.push(event)
  });

  expect(result.image.width).toBe(2);
  expect(events.map((event) => event.stage)).toEqual(expect.arrayContaining([
    "grid-detection",
    "downsampling",
    "alpha-cleanup",
    "palette-remap",
    "export-prep",
    "complete"
  ]));
  expect(events[0]!.percent).toBeGreaterThanOrEqual(0);
  expect(events.at(-1)).toMatchObject({ stage: "complete", percent: 100 });
});

test("cancels a sheet fix between frame batches without returning a result", () => {
  const fixture = paletteDriftAnimationFixtures[0]!;
  const signal = { aborted: false, reason: "test cancel" };

  expect(() =>
    fixImage(fixture.image, {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 96,
      targetHeight: 32,
      maxColors: 8,
      grid: { detect: "manual", scale: 1, phaseX: 0, phaseY: 0 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true },
      sheet: fixture.expected.sheet!.options,
      sheetFrames: fixture.expected.sheet!.frames
    }, {
      signal,
      onProgress: (event) => {
        if (event.stage === "downsampling" && event.percent >= 35) {
          signal.aborted = true;
        }
      }
    })
  ).toThrow(FixCancelledError);
});
```

Use a mutable test signal type if readonly typing requires a local cast.

Run:

```powershell
npm run test -w @pixelaid/core -- src/core.test.ts -t "progress|cancels a sheet"
```

Expected: fail until `fixImage` accepts runtime hooks.

- [ ] **Step 2: Add runtime argument to `fixImage`**

In `packages/core/src/fix.ts`, change:

```ts
export function fixImage(image: RGBAImage, options: FixOptions): PixelFixResult {
```

to:

```ts
export function fixImage(image: RGBAImage, options: FixOptions, runtime?: FixRuntimeOptions): PixelFixResult {
```

Pass `runtime` into `fixSheetFrames(image, options, runtime)`.

Add imports:

```ts
import { assertNotCancelled, phasePercent, reportProgress, type FixRuntimeOptions } from "./runtime";
```

- [ ] **Step 3: Emit single-image phase progress and checks**

Instrument the single-image path:

```ts
assertNotCancelled(runtime?.signal);
reportProgress(runtime, "grid-detection", 8, "Detecting grid");
const grid = resolveGrid(image, options);
// local drift...
assertNotCancelled(runtime?.signal);

reportProgress(runtime, "downsampling", 25, "Downsampling to native pixels");
const downsampled = downsampleBlocks(image, { ... }, { runtime, stage: "downsampling", startPercent: 25, endPercent: 50 });
assertNotCancelled(runtime?.signal);

reportProgress(runtime, "alpha-cleanup", 58, "Cleaning alpha");
const alphaResult = applyAlphaMode(...);
// halo/denoise/outline can stay in alpha-cleanup or export-prep phase.
assertNotCancelled(runtime?.signal);

reportProgress(runtime, "palette-remap", 78, "Applying palette");
const paletteResult = resolvePalette(...);
const remapped = remapToPalette(outlineCleaned, paletteResult.palette, { runtime, stage: "palette-remap", startPercent: 82, endPercent: 94 });
assertNotCancelled(runtime?.signal);

reportProgress(runtime, "export-prep", 98, "Preparing result");
// build result
reportProgress(runtime, "complete", 100, "Fix complete");
```

Keep progress coarse and stable; exact percentages can be adjusted but must be monotonically increasing in tests.

- [ ] **Step 4: Instrument sheet frame batches**

Change `fixSheetFrames(image, options)` to accept `runtime`.

Before loop:

```ts
reportProgress(runtime, "frame-slicing", 12, `Preparing ${frames.length} frames`);
```

Inside loop, check cancellation before each frame and report progress by completed frame:

```ts
for (let index = 0; index < frames.length; index += 1) {
  assertNotCancelled(runtime?.signal);
  const frame = frames[index]!;
  reportProgress(runtime, "downsampling", phasePercent(20, 65, index, frames.length), `Fixing frame ${index + 1}/${frames.length}`);
  // downsample frame with nested progress disabled or narrow row range
}
reportProgress(runtime, "alpha-cleanup", 68, "Cleaning frame alpha");
```

Then palette/remap/export/complete as in single path.

- [ ] **Step 5: Add loop progress/cancel to downsample and remap**

Change `downsampleBlocks` signature to:

```ts
export type LoopProgressOptions = {
  runtime?: FixRuntimeOptions;
  stage: WorkerProgressStage;
  startPercent: number;
  endPercent: number;
};

export function downsampleBlocks(image: RGBAImage, options: DownsampleOptions, progress?: LoopProgressOptions): RGBAImage {
```

At row boundaries:

```ts
if (progress && shouldReportRow(y, options.outputHeight)) {
  assertNotCancelled(progress.runtime?.signal);
  reportProgress(progress.runtime, progress.stage, phasePercent(progress.startPercent, progress.endPercent, y, options.outputHeight));
}
```

After loop, report `endPercent` and check cancellation.

Change `remapToPalette(image, palette, progress?)` similarly. Preserve compatibility by keeping the third argument optional.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/core -- src/core.test.ts -t "progress|cancels a sheet|palette reduction|fix pipeline"
npm run test -w @pixelaid/core -- src/core.test.ts
npm run typecheck -w @pixelaid/core
```

Expected: pass.

Commit:

```powershell
git add packages/core/src/fix.ts packages/core/src/downsample.ts packages/core/src/palette.ts packages/core/src/core.test.ts
git commit -m "feat(core): report fix progress and cancellation"
```

---

### Task 4: Worker Progress Pipeline and Cancellation Protocol

**Files:**
- Modify: `packages/worker/src/protocol.ts`
- Modify: `packages/worker/src/pipeline.ts`
- Modify: `packages/worker/src/fix.worker.ts`
- Modify: `packages/worker/src/index.ts`
- Modify: `packages/worker/src/pipeline.test.ts`

- [ ] **Step 1: Add failing worker tests**

In `packages/worker/src/pipeline.test.ts`, add:

```ts
test("emits progress events before returning a result", () => {
  const request: WorkerRequest = {
    type: "fix-image",
    requestId: "progress-job",
    image: image(),
    options
  };
  const events: WorkerResponse[] = [];
  const response = runWorkerRequest(request, () => 0, (event) => events.push(event));

  expect(response.type).toBe("result");
  expect(events.some((event) => event.type === "progress" && event.stage === "downsampling")).toBe(true);
  expect(events.at(-1)).toMatchObject({ type: "progress", requestId: "progress-job", stage: "complete", percent: 100 });
});

test("returns a cancellation response without a result when cancelled cooperatively", () => {
  const request: WorkerRequest = {
    type: "fix-image",
    requestId: "cancel-job",
    image: image(),
    options
  };
  const controller = createWorkerCancellationController();
  const events: WorkerResponse[] = [];
  const response = runWorkerRequest(
    request,
    () => 0,
    (event) => {
      events.push(event);
      if (event.type === "progress" && event.stage === "downsampling") {
        controller.cancel("test cancel");
      }
    },
    controller.signal
  );

  expect(response).toMatchObject({ type: "cancelled", requestId: "cancel-job" });
  expect(events.some((event) => event.type === "progress" && event.stage === "cancelled")).toBe(true);
});
```

Run:

```powershell
npm run test -w @pixelaid/worker -- src/pipeline.test.ts
```

Expected: fail until the event sink/cancellation response exists.

- [ ] **Step 2: Extend protocol**

In `packages/worker/src/protocol.ts`, add:

```ts
export type WorkerCancelledResponse = {
  type: "cancelled";
  requestId: string;
  message: string;
};
```

Update:

```ts
export type WorkerResponse = WorkerResultResponse | WorkerErrorResponse | WorkerProgressResponse | WorkerCancelledResponse;
```

Keep `CancelWorkerRequest` unchanged.

- [ ] **Step 3: Add cancellation controller and event sink**

In `packages/worker/src/pipeline.ts`, add:

```ts
import { FixCancelledError, fixImage, type FixCancellationSignal } from "@pixelaid/core";

export type WorkerEventSink = (event: WorkerResponse) => void;

export function createWorkerCancellationController(): { signal: FixCancellationSignal; cancel: (reason?: string) => void } {
  const state = { aborted: false, reason: undefined as string | undefined };
  return {
    signal: state,
    cancel: (reason = "Fix cancelled") => {
      state.aborted = true;
      state.reason = reason;
    }
  };
}
```

Change `runWorkerRequest` signature:

```ts
export function runWorkerRequest(
  request: WorkerRequest,
  clock: () => number = () => performance.now(),
  emit?: WorkerEventSink,
  signal?: FixCancellationSignal
): WorkerResponse
```

Inside `runFixImageRequest`, pass runtime:

```ts
const result = fixImage(image, request.options, {
  signal,
  onProgress: (event) => emit?.({ type: "progress", requestId: request.requestId, ...event })
});
```

Catch `FixCancelledError` and return:

```ts
emit?.({ type: "progress", requestId: request.requestId, stage: "cancelled", percent: 100, message });
return { type: "cancelled", requestId: request.requestId, message };
```

- [ ] **Step 4: Update real worker controller**

In `packages/worker/src/fix.worker.ts`, maintain one active controller:

```ts
let activeJob: { requestId: string; cancel: (reason?: string) => void } | null = null;
```

On cancel messages:

```ts
if (event.data.type === "cancel") {
  if (activeJob?.requestId === event.data.requestId) {
    activeJob.cancel("Fix cancelled");
  }
  return;
}
```

On fix-image:

```ts
const controller = createWorkerCancellationController();
activeJob = { requestId: event.data.requestId, cancel: controller.cancel };
const response = runWorkerRequest(event.data, undefined, postWorkerResponse, controller.signal);
if (activeJob?.requestId === event.data.requestId) {
  activeJob = null;
}
postWorkerResponse(response);
```

This allows graceful cancellation in worker tests and at browser phase boundaries. The web client will still keep termination fallback for mid-synchronous-loop cancellation.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/worker -- src/pipeline.test.ts
npm run typecheck -w @pixelaid/worker
```

Expected: pass.

Commit:

```powershell
git add packages/worker/src/protocol.ts packages/worker/src/pipeline.ts packages/worker/src/fix.worker.ts packages/worker/src/index.ts packages/worker/src/pipeline.test.ts
git commit -m "feat(worker): stream progress and cancellation"
```

---

### Task 5: Web Client Progress and Cancellation UI

**Files:**
- Modify: `apps/web/src/lib/fixWorkerClient.ts`
- Create: `apps/web/src/lib/fixProgress.ts`
- Create: `apps/web/src/lib/fixProgress.test.ts`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Add failing progress helper tests**

Create `apps/web/src/lib/fixProgress.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { formatFixProgress, shouldLogProgressStage } from "./fixProgress";

describe("fix progress helpers", () => {
  test("formats stage and percent for UI status", () => {
    expect(formatFixProgress({ requestId: "1", stage: "downsampling", percent: 42 })).toBe("Downsampling 42%");
    expect(formatFixProgress({ requestId: "1", stage: "palette-remap", percent: 88, message: "Applying palette" })).toBe("Applying palette 88%");
  });

  test("logs only meaningful stage transitions", () => {
    expect(shouldLogProgressStage(undefined, "grid-detection")).toBe(true);
    expect(shouldLogProgressStage("grid-detection", "grid-detection")).toBe(false);
    expect(shouldLogProgressStage("grid-detection", "downsampling")).toBe(true);
  });
});
```

Run:

```powershell
npm run test -w @pixelaid/web -- src/lib/fixProgress.test.ts
```

Expected: fail until helper exists.

- [ ] **Step 2: Implement progress helpers**

Create `apps/web/src/lib/fixProgress.ts`:

```ts
import type { WorkerProgress, WorkerProgressStage } from "@pixelaid/shared";

const stageLabels: Record<WorkerProgressStage, string> = {
  "decode-prep": "Preparing",
  "grid-detection": "Detecting grid",
  "frame-slicing": "Preparing frames",
  "downsampling": "Downsampling",
  "alpha-cleanup": "Cleaning alpha",
  "palette-remap": "Applying palette",
  "export-prep": "Preparing export",
  complete: "Complete",
  cancelled: "Cancelled"
};

export function formatFixProgress(progress: WorkerProgress): string {
  const label = progress.message ?? stageLabels[progress.stage];
  return `${label} ${Math.round(progress.percent)}%`;
}

export function shouldLogProgressStage(previous: WorkerProgressStage | undefined, next: WorkerProgressStage): boolean {
  return previous !== next && next !== "complete";
}
```

- [ ] **Step 3: Update fix worker client**

In `apps/web/src/lib/fixWorkerClient.ts`, change `FixJob`:

```ts
export type FixJob = {
  requestId: string;
  promise: Promise<PixelFixResult>;
  cancel: () => void;
};

export type StartFixJobOptions = {
  onProgress?: (progress: WorkerProgress) => void;
  terminateGraceMs?: number;
};
```

Import `WorkerProgress`.

Change `startFixJob(image, options)` to `startFixJob(image, options, jobOptions = {})`.

In `worker.onmessage`, handle progress without settling:

```ts
if (event.data.type === "progress") {
  jobOptions.onProgress?.(event.data);
  return;
}
```

Handle cancelled:

```ts
if (event.data.type === "cancelled") {
  settled = true;
  worker.terminate();
  reject(new Error(event.data.message));
  return;
}
```

In `cancel`:

```ts
worker.postMessage({ type: "cancel", requestId } satisfies WorkerRequest);
const graceMs = jobOptions.terminateGraceMs ?? 150;
window.setTimeout(() => {
  if (settled) return;
  settled = true;
  worker.terminate();
  rejectJob(new Error("Fix cancelled"));
}, graceMs);
```

Ensure stale result messages after cancellation are ignored by the `settled` guard.

- [ ] **Step 4: Update App status/logs**

In `apps/web/src/App.tsx`, add:

```ts
const [fixProgress, setFixProgress] = useState<WorkerProgress | null>(null);
const lastLoggedFixStageRef = useRef<WorkerProgressStage | undefined>(undefined);
```

Update `busyStatus`:

```ts
const busyStatus = importStatus ?? analysisStatus ?? (fixProgress ? formatFixProgress(fixProgress) : fixStatus);
```

When starting a fix:

```ts
setFixProgress({ requestId: "preparing", stage: "decode-prep", percent: 0, message: sheetMode ? `Preparing ${frameCount} frame fix` : "Preparing fix" });
lastLoggedFixStageRef.current = undefined;
```

Pass progress callback:

```ts
const job = startFixJob(selectedAsset.image, options, {
  onProgress: (progress) => {
    setFixProgress(progress);
    if (shouldLogProgressStage(lastLoggedFixStageRef.current, progress.stage)) {
      appendLog(formatFixProgress(progress));
      lastLoggedFixStageRef.current = progress.stage;
    }
  }
});
```

Clear progress in finally:

```ts
setFixProgress(null);
```

In `cancelFix`, set:

```ts
setFixProgress((current) => current ? { ...current, stage: "cancelled", percent: current.percent, message: "Cancelling fix" } : null);
```

Add metrics:

```ts
["Progress", fixProgress ? formatFixProgress(fixProgress) : "--"]
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/web -- src/lib/fixProgress.test.ts
npm run typecheck -w @pixelaid/web
npm run lint
```

Expected: pass.

Commit:

```powershell
git add apps/web/src/lib/fixWorkerClient.ts apps/web/src/lib/fixProgress.ts apps/web/src/lib/fixProgress.test.ts apps/web/src/App.tsx
git commit -m "feat(web): show fix progress and graceful cancel"
```

---

### Task 6: Performance Docs and Integration Smoke

**Files:**
- Modify: `docs/performance.md`
- Modify: `packages/worker/src/pipeline.test.ts` only if a large-sheet smoke test was not covered in Task 4

- [ ] **Step 1: Add worker large-sheet smoke if needed**

If Task 4 did not add a large-sheet worker test, add one to `packages/worker/src/pipeline.test.ts` using a modest generated sheet request with many frames and a progress sink:

```ts
test("emits coarse progress for a multi-frame sheet request", () => {
  const request = createLargeSheetRequest("large-progress-job");
  const events: WorkerResponse[] = [];

  const response = runWorkerRequest(request, () => 0, (event) => events.push(event));

  expect(response.type).toBe("result");
  expect(events.filter((event) => event.type === "progress" && event.stage === "downsampling").length).toBeGreaterThan(1);
  expect(events.length).toBeLessThan(80);
});
```

Keep the fixture generated in test code and small enough for the worker package test to stay fast.

- [ ] **Step 2: Update performance docs**

In `docs/performance.md`, add a "Progress and cancellation" section:

```md
## Progress And Cancellation

Worker fix jobs emit coarse progress stages for preparation, grid detection, frame slicing, downsampling, alpha cleanup, palette remap, export preparation, completion, and cancellation. Progress is stage-based rather than per-pixel so the UI stays responsive without flooding React state.

Core fix functions accept optional runtime hooks for progress and cooperative cancellation. The browser client asks the worker to cancel gracefully first, then terminates the worker as a fallback if the job is inside a synchronous phase that cannot receive messages immediately. Stale results after cancellation are ignored by request id and settled-state guards.
```

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm run test -w @pixelaid/worker -- src/pipeline.test.ts
npm run typecheck -w @pixelaid/worker
```

Expected: pass.

Commit:

```powershell
git add docs/performance.md packages/worker/src/pipeline.test.ts
git commit -m "docs(worker): document progress cancellation flow"
```

---

### Task 7: Full Verification and Linear Update

**Files:**
- No source changes expected unless verification finds a bug.

- [ ] **Step 1: Run full verification**

Run from `C:\dev\Mighty\pixel-aid\.worktrees\mig-10-worker-progress`:

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
npm run benchmark
git status --short --branch
```

Expected:

- All commands pass.
- Worktree is clean.
- No new dependencies appear in `package.json` or lockfile.

- [ ] **Step 2: Manual/dev-server smoke**

After integration into `codex/pixelaid-roadmap-foundation`, verify:

```powershell
try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173/' -TimeoutSec 5; "HTTP $($response.StatusCode)" } catch { "REQUEST_FAILED: $($_.Exception.Message)" }
```

Expected: `HTTP 200`.

- [ ] **Step 3: Linear update**

Add a Linear comment to `MIG-10` with:

- Commit range.
- Implemented progress/cancellation behavior.
- Verification commands and results.
- Explicit note that browser cancellation uses graceful request first and worker termination fallback for synchronous mid-loop cancellation.

Then set Linear `MIG-10` to Done only after integration into `codex/pixelaid-roadmap-foundation`.

---

## Parallelization / Subagent Flow

- Task 1 must happen first because it types progress stages.
- Task 2 and Task 3 should stay with one core worker because they touch core runtime, `fix.ts`, `downsample.ts`, and `palette.ts`.
- Task 4 should run after Task 3 because worker progress depends on core runtime hooks.
- Task 5 should run after Task 4 because the web client must understand the final worker protocol.
- Task 6 can run after Task 4 and may run in parallel with Task 5 if write scopes stay disjoint.
- Recommended flow:
  1. Worker A: Tasks 1-3 shared/core runtime and instrumentation.
  2. Worker B: Task 4 worker protocol/pipeline.
  3. Worker C: Task 5 web client/UI after Task 4.
  4. Worker D or controller: Task 6 docs/smoke.
  5. Controller: review gates after each slice, integrate, verify, update Linear.

## Self-Review

- Spec coverage:
  - Progress stages for prep, grid, frame slicing, downsampling, alpha cleanup, palette remap, export prep: Tasks 1, 3, 4, 5.
  - Cooperative cancellation through core phases and sheet frame batches: Tasks 2, 3, 4.
  - Worker termination fallback: Task 5 and docs in Task 6.
  - Safe buffer transfer/source preview ownership: Task 5 preserves existing source clone and result transfer behavior.
  - UI progress/logs: Task 5.
  - Progress ordering/cancellation/no-result tests: Tasks 3, 4, 5.
  - Large sheet smoke/bench: Task 6 plus existing benchmark command in Task 7.
  - No hot-loop per-pixel object allocation: Task 3 explicitly uses row throttling and optional runtime checks.
- Placeholder scan: no placeholder tokens or incomplete test instructions remain.
- Type consistency: `WorkerProgressStage`, `WorkerProgress`, `FixRuntimeOptions`, `FixProgressEvent`, `FixCancellationSignal`, and `WorkerCancelledResponse` are introduced before use.
