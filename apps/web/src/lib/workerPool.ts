import type { WorkerRequest, WorkerResponse, WorkerProgressResponse } from "@pixelaid/worker";
import type { PersistentWorkerStalePolicy } from "@pixelaid/worker";

export type WorkerPoolJob = {
  request: WorkerRequest;
  transfer?: Transferable[];
  staleKey?: string;
  stalePolicy?: PersistentWorkerStalePolicy;
  onProgress?: (progress: WorkerProgressResponse) => void;
};

export type WorkerPoolJobHandle = {
  requestId: string;
  promise: Promise<WorkerResponse>;
  cancel: (reason?: string) => void;
};

export type WorkerPoolStats = {
  workerCreated: boolean;
  activeRequestId: string | null;
  pendingCount: number;
};

export type WorkerPoolOptions = {
  workerFactory: () => Worker;
  terminateGraceMs?: number;
};

type QueuedWorkerJob = WorkerPoolJob & {
  resolve: (response: WorkerResponse) => void;
  reject: (reason?: unknown) => void;
  cancelled: boolean;
  cancelTimer?: ReturnType<typeof globalThis.setTimeout>;
};

export class WorkerPoolCancelledError extends Error {
  constructor(message = "Worker job cancelled") {
    super(message);
    this.name = "WorkerPoolCancelledError";
  }
}

export class WorkerPoolDisposedError extends Error {
  constructor() {
    super("Worker pool has been disposed");
    this.name = "WorkerPoolDisposedError";
  }
}

export class WorkerPoolStaleJobError extends Error {
  constructor(message = "Worker job was replaced by a newer stale-key match") {
    super(message);
    this.name = "WorkerPoolStaleJobError";
  }
}

export class WorkerPool {
  private readonly workerFactory: () => Worker;
  private readonly terminateGraceMs: number;
  private worker: Worker | null = null;
  private activeJob: QueuedWorkerJob | null = null;
  private pendingJobs: QueuedWorkerJob[] = [];
  private disposed = false;

  constructor(options: WorkerPoolOptions) {
    this.workerFactory = options.workerFactory;
    this.terminateGraceMs = options.terminateGraceMs ?? 150;
  }

  runJob(job: WorkerPoolJob): WorkerPoolJobHandle {
    if (this.disposed) {
      throw new WorkerPoolDisposedError();
    }

    let resolveJob!: (response: WorkerResponse) => void;
    let rejectJob!: (reason?: unknown) => void;
    const promise = new Promise<WorkerResponse>((resolve, reject) => {
      resolveJob = resolve;
      rejectJob = reject;
    });
    const queuedJob: QueuedWorkerJob = {
      ...job,
      resolve: resolveJob,
      reject: rejectJob,
      cancelled: false
    };

    this.dropPendingStaleMatches(queuedJob);
    this.pendingJobs.push(queuedJob);
    this.pump();

    return {
      requestId: job.request.requestId,
      promise,
      cancel: (reason?: string) => this.cancelJob(queuedJob, reason)
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    const error = new WorkerPoolDisposedError();
    if (this.activeJob) {
      this.rejectJob(this.activeJob, error);
      this.activeJob = null;
    }
    for (const job of this.pendingJobs) {
      this.rejectJob(job, error);
    }
    this.pendingJobs = [];
    this.terminateWorker();
  }

  getStats(): WorkerPoolStats {
    return {
      workerCreated: this.worker !== null,
      activeRequestId: this.activeJob?.request.requestId ?? null,
      pendingCount: this.pendingJobs.length
    };
  }

  private pump(): void {
    if (this.disposed || this.activeJob || this.pendingJobs.length === 0) {
      return;
    }

    const nextJob = this.pendingJobs.shift();
    if (!nextJob) {
      return;
    }

    this.activeJob = nextJob;
    const worker = this.ensureWorker();
    worker.postMessage(nextJob.request, nextJob.transfer ?? []);
  }

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }

    const worker = this.workerFactory();
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handleMessage(event.data);
    worker.onerror = (event) => this.handleWorkerError(event.message || "Worker failed");
    this.worker = worker;
    return worker;
  }

  private handleMessage(response: WorkerResponse): void {
    const job = this.activeJob;
    if (!job || response.requestId !== job.request.requestId) {
      return;
    }

    if (response.type === "progress") {
      if (!job.cancelled) {
        job.onProgress?.(response);
      }
      return;
    }

    this.activeJob = null;
    this.clearCancelTimer(job);
    if (job.cancelled) {
      this.rejectJob(job, new WorkerPoolCancelledError());
    } else {
      job.resolve(response);
    }
    this.pump();
  }

  private handleWorkerError(message: string): void {
    const error = new Error(message);
    if (this.activeJob) {
      this.rejectJob(this.activeJob, error);
      this.activeJob = null;
    }
    for (const job of this.pendingJobs) {
      this.rejectJob(job, error);
    }
    this.pendingJobs = [];
    this.terminateWorker();
  }

  private cancelJob(job: QueuedWorkerJob, reason = "Worker job cancelled"): void {
    if (this.disposed || job.cancelled) {
      return;
    }

    const pendingIndex = this.pendingJobs.indexOf(job);
    if (pendingIndex >= 0) {
      this.pendingJobs.splice(pendingIndex, 1);
      job.cancelled = true;
      this.rejectJob(job, new WorkerPoolCancelledError(reason));
      return;
    }

    if (this.activeJob !== job) {
      return;
    }

    job.cancelled = true;
    this.worker?.postMessage({ type: "cancel", requestId: job.request.requestId } satisfies WorkerRequest);
    job.cancelTimer = globalThis.setTimeout(() => {
      if (this.activeJob !== job) {
        return;
      }

      this.activeJob = null;
      this.rejectJob(job, new WorkerPoolCancelledError(reason));
      this.terminateWorker();
      this.pump();
    }, this.terminateGraceMs);
  }

  private dropPendingStaleMatches(nextJob: QueuedWorkerJob): void {
    if (!nextJob.staleKey || nextJob.stalePolicy !== "latestOnly") {
      return;
    }

    const remainingJobs: QueuedWorkerJob[] = [];
    for (const job of this.pendingJobs) {
      if (job.staleKey === nextJob.staleKey) {
        this.rejectJob(job, new WorkerPoolStaleJobError());
      } else {
        remainingJobs.push(job);
      }
    }
    this.pendingJobs = remainingJobs;
  }

  private rejectJob(job: QueuedWorkerJob, error: unknown): void {
    this.clearCancelTimer(job);
    job.reject(error);
  }

  private clearCancelTimer(job: QueuedWorkerJob): void {
    if (job.cancelTimer === undefined) {
      return;
    }
    globalThis.clearTimeout(job.cancelTimer);
    delete job.cancelTimer;
  }

  private terminateWorker(): void {
    if (!this.worker) {
      return;
    }
    this.worker.terminate();
    this.worker = null;
  }
}

export function createWorkerPool(options: WorkerPoolOptions): WorkerPool {
  return new WorkerPool(options);
}
