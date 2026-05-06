import { describe, expect, it } from "vitest";

import {
  cancelEngineJob,
  completeEngineJob,
  createEngineJobRecord,
  failEngineJob,
  startEngineJob,
  updateEngineJobProgress,
  upsertEngineJob
} from "./index";

describe("engine job model", () => {
  it("tracks a successful job lifecycle", () => {
    const queued = createEngineJobRecord({ id: "job_1", kind: "fix", assetId: "asset_1" });
    const running = startEngineJob(queued, "2026-05-06T00:00:00.000Z");
    const progressed = updateEngineJobProgress(running, 0.42);
    const completed = completeEngineJob(progressed, "2026-05-06T00:00:01.000Z", { ok: true });

    expect(completed).toMatchObject({
      id: "job_1",
      kind: "fix",
      assetId: "asset_1",
      status: "completed",
      progress: 1,
      startedAt: "2026-05-06T00:00:00.000Z",
      completedAt: "2026-05-06T00:00:01.000Z",
      result: { ok: true }
    });
  });

  it("tracks failed and cancelled terminal states", () => {
    const queued = createEngineJobRecord({ id: "job_1", kind: "qualityAnalysis", assetId: null });

    expect(failEngineJob(queued, "2026-05-06T00:00:01.000Z", "boom")).toMatchObject({
      status: "failed",
      completedAt: "2026-05-06T00:00:01.000Z",
      error: "boom"
    });
    expect(cancelEngineJob(queued, "2026-05-06T00:00:02.000Z")).toMatchObject({
      status: "cancelled",
      completedAt: "2026-05-06T00:00:02.000Z"
    });
  });

  it("upserts active jobs into job state", () => {
    const job = startEngineJob(createEngineJobRecord({ id: "job_1", kind: "sourceAnalysis", assetId: "asset_1" }));
    const state = upsertEngineJob({ activeJobIds: [], jobsById: {} }, job);
    const completed = upsertEngineJob(state, completeEngineJob(job));

    expect(state.activeJobIds).toEqual(["job_1"]);
    expect(completed.activeJobIds).toEqual([]);
    expect(completed.jobsById.job_1?.status).toBe("completed");
  });
});
