import type { EngineJobKind, EngineJobRecord, EngineJobState } from "./state";

export type CreateEngineJobRecordOptions = {
  id: string;
  kind: EngineJobKind;
  assetId: string | null;
};

export function createEngineJobRecord(options: CreateEngineJobRecordOptions): EngineJobRecord {
  return {
    id: options.id,
    kind: options.kind,
    assetId: options.assetId,
    status: "queued",
    progress: 0,
    startedAt: null,
    completedAt: null,
    error: null
  };
}

export function startEngineJob(job: EngineJobRecord, startedAt = new Date().toISOString()): EngineJobRecord {
  return {
    ...job,
    status: "running",
    startedAt,
    completedAt: null,
    error: null
  };
}

export function updateEngineJobProgress(job: EngineJobRecord, progress: number): EngineJobRecord {
  return {
    ...job,
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : job.progress
  };
}

export function completeEngineJob(job: EngineJobRecord, completedAt = new Date().toISOString(), result?: unknown): EngineJobRecord {
  return {
    ...job,
    status: "completed",
    progress: 1,
    completedAt,
    error: null,
    ...(result !== undefined ? { result } : {})
  };
}

export function failEngineJob(job: EngineJobRecord, completedAt = new Date().toISOString(), error = "Job failed"): EngineJobRecord {
  return {
    ...job,
    status: "failed",
    completedAt,
    error
  };
}

export function cancelEngineJob(job: EngineJobRecord, completedAt = new Date().toISOString()): EngineJobRecord {
  return {
    ...job,
    status: "cancelled",
    completedAt,
    error: null
  };
}

export function upsertEngineJob(state: EngineJobState, job: EngineJobRecord): EngineJobState {
  const active = job.status === "queued" || job.status === "running";
  const activeJobIds = active
    ? [...state.activeJobIds.filter((jobId) => jobId !== job.id), job.id]
    : state.activeJobIds.filter((jobId) => jobId !== job.id);

  return {
    activeJobIds,
    jobsById: {
      ...state.jobsById,
      [job.id]: job
    }
  };
}
