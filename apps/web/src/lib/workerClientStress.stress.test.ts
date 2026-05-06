import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { benchmarkFixtureCatalog } from "@pixelaid/fixtures";
import type { BenchmarkFixture } from "@pixelaid/fixtures";
import type { QualityReportOptions } from "@pixelaid/core";
import type { FixOptions } from "@pixelaid/shared";
import {
  createWorkerCancellationController,
  runWorkerRequest,
  type WorkerRequest,
  type WorkerResponse
} from "@pixelaid/worker";

import { startQualityAnalysisJob, startSourceAnalysisJob } from "./analysisWorkerClient";
import { startFixJob } from "./fixWorkerClient";
import type { WorkerJobDiagnostics, WorkerJobKind } from "./workerDiagnostics";
import { createWorkerPool } from "./workerPool";

type WorkerStressReport = {
  schemaVersion: 1;
  generatedAt: string;
  fixtureId: string;
  iterations: number;
  summary: {
    jobCount: number;
    failures: number;
    byKind: Record<WorkerJobKind, WorkerStressSummary>;
  };
  diagnostics: WorkerJobDiagnostics[];
};

type WorkerStressSummary = {
  count: number;
  avgTotalElapsedMs: number;
  avgWorkerCreateMs: number;
  avgImageCloneMs: number;
  avgPostMessageMs: number;
  avgFirstMessageMs: number | null;
  avgWorkerComputeMs: number | null;
};

const fixtureId = process.env.PIXELAID_WORKER_STRESS_FIXTURE ?? "fake-pixel-720p-single";
const iterations = readPositiveInteger(process.env.PIXELAID_WORKER_STRESS_ITERATIONS, 2);
const outputPath = process.env.PIXELAID_WORKER_STRESS_OUT ?? "benchmark-results/worker-stress/latest.json";
const fixture = requiredBenchmarkFixture(fixtureId);

describe("worker client repeated-job stress", () => {
  test.runIf(process.env.PIXELAID_WORKER_STRESS === "1")(
    "runs repeated source analysis, quality analysis, and fix jobs through the worker client protocol",
    async () => {
      const diagnostics: WorkerJobDiagnostics[] = [];
      const image = fixture.createImage();
      const qualityOptions: QualityReportOptions = {
        assetType: fixture.assetType,
        maxColors: 24,
        alpha: "preserve"
      };
      const fixOptions = createStressFixOptions(fixture);
      const workerFactory = () => new PipelineWorkerShim() as unknown as Worker;
      const analysisWorkerPool = createWorkerPool({ workerFactory });
      const fixWorkerPool = createWorkerPool({ workerFactory });

      try {
        for (let iteration = 0; iteration < iterations; iteration += 1) {
          await startSourceAnalysisJob(image, {
            paletteMaxColors: 8,
            maxUniqueColors: 10000,
            outlineMaxCandidates: 64,
            onDiagnostics: (entry) => diagnostics.push(entry),
            workerPool: analysisWorkerPool,
            staleKey: `stress:${fixture.id}:source`,
            stalePolicy: "latestOnly"
          }).promise;
          await startQualityAnalysisJob(image, qualityOptions, {
            onDiagnostics: (entry) => diagnostics.push(entry),
            workerPool: analysisWorkerPool,
            staleKey: `stress:${fixture.id}:quality`,
            stalePolicy: "latestOnly"
          }).promise;
          await startFixJob(image, fixOptions, {
            onDiagnostics: (entry) => diagnostics.push(entry),
            workerPool: fixWorkerPool,
            staleKey: `stress:${fixture.id}:fix`,
            stalePolicy: "latestOnly"
          }).promise;
        }
      } finally {
        analysisWorkerPool.dispose();
        fixWorkerPool.dispose();
      }

      const report = createStressReport(diagnostics);
      writeStressReport(outputPath, report);

      expect(report.summary.failures).toBe(0);
      expect(report.summary.jobCount).toBe(iterations * 3);
      expect(report.summary.byKind.fix.count).toBe(iterations);
      expect(report.summary.byKind.sourceAnalysis.count).toBe(iterations);
      expect(report.summary.byKind.qualityAnalysis.count).toBe(iterations);
    },
    120_000
  );
});

class PipelineWorkerShim {
  onmessage: ((this: Worker, event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((this: AbstractWorker, event: ErrorEvent) => void) | null = null;
  private terminated = false;

  postMessage(message: WorkerRequest): void {
    queueMicrotask(() => {
      if (this.terminated) {
        return;
      }

      try {
        const controller = createWorkerCancellationController();
        const response = runWorkerRequest(
          message,
          () => performance.now(),
          (event) => this.dispatch(event),
          controller.signal
        );
        this.dispatch(response);
      } catch (error) {
        this.onerror?.call(this as unknown as AbstractWorker, {
          message: error instanceof Error ? error.message : "Worker stress shim failed"
        } as ErrorEvent);
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }

  private dispatch(response: WorkerResponse): void {
    if (this.terminated) {
      return;
    }
    this.onmessage?.call(this as unknown as Worker, { data: response } as MessageEvent<WorkerResponse>);
  }
}

function createStressFixOptions(fixture: BenchmarkFixture): FixOptions {
  if (fixture.id.includes("sheet")) {
    return {
      mode: "spriteSheet",
      assetType: "animationSheet",
      targetWidth: 256,
      targetHeight: 256,
      maxColors: 32,
      grid: { detect: "manual", scale: 8 },
      downscale: "dominant",
      alpha: "preserve",
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    };
  }

  return {
    mode: "single",
    assetType: fixture.assetType,
    targetWidth: Math.max(1, Math.round(fixture.sourceWidth / 8)),
    targetHeight: Math.max(1, Math.round(fixture.sourceHeight / 8)),
    maxColors: 24,
    grid: { detect: "manual", scale: 8 },
    downscale: "adaptive",
    alpha: "preserve",
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true
    }
  };
}

function createStressReport(diagnostics: WorkerJobDiagnostics[]): WorkerStressReport {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixtureId,
    iterations,
    summary: {
      jobCount: diagnostics.length,
      failures: diagnostics.filter((entry) => entry.outcome !== "completed").length,
      byKind: {
        fix: summarizeKind(diagnostics, "fix"),
        sourceAnalysis: summarizeKind(diagnostics, "sourceAnalysis"),
        qualityAnalysis: summarizeKind(diagnostics, "qualityAnalysis")
      }
    },
    diagnostics
  };
}

function summarizeKind(diagnostics: WorkerJobDiagnostics[], kind: WorkerJobKind): WorkerStressSummary {
  const entries = diagnostics.filter((entry) => entry.kind === kind);
  return {
    count: entries.length,
    avgTotalElapsedMs: average(entries, (entry) => entry.totalElapsedMs),
    avgWorkerCreateMs: average(entries, (entry) => entry.workerCreateMs),
    avgImageCloneMs: average(entries, (entry) => entry.imageCloneMs),
    avgPostMessageMs: average(entries, (entry) => entry.postMessageMs),
    avgFirstMessageMs: averageOptional(entries, (entry) => entry.timeToFirstMessageMs),
    avgWorkerComputeMs: averageOptional(entries, (entry) => entry.workerComputeMs)
  };
}

function average(entries: WorkerJobDiagnostics[], read: (entry: WorkerJobDiagnostics) => number): number {
  if (entries.length === 0) {
    return 0;
  }
  return entries.reduce((sum, entry) => sum + read(entry), 0) / entries.length;
}

function averageOptional(entries: WorkerJobDiagnostics[], read: (entry: WorkerJobDiagnostics) => number | undefined): number | null {
  const values = entries.map(read).filter((value): value is number => value !== undefined);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function writeStressReport(path: string, report: WorkerStressReport): void {
  const absolutePath = resolve(process.cwd(), path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function requiredBenchmarkFixture(id: string): BenchmarkFixture {
  const candidate = benchmarkFixtureCatalog.find((entry) => entry.id === id);
  if (!candidate) {
    throw new Error(`Missing benchmark fixture ${id}`);
  }
  return candidate;
}

function readPositiveInteger(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
