import { describe, expect, it } from "vitest";
import {
  automationError,
  automationOk,
  type AutomationProgressEvent,
  type AutomationRuntimeOptions,
} from "@pixelaid/automation";
import {
  createPixelAidHttpHandler,
  type HttpAutomationOperationName,
  type HttpAutomationRequest,
} from "./index";

type JsonResponse = {
  status: number;
  body: {
    ok: boolean;
    status?: string;
    service?: string;
    jobs?: { total: number; running: number; queued: number; succeeded: number; failed: number; cancelled: number };
    job?: {
      id: string;
      operation: HttpAutomationOperationName;
      status: string;
      progress: number;
      progressEvents: AutomationProgressEvent[];
      result?: unknown;
      error?: { code: string; message: string; exitCode: number };
      warnings: string[];
    };
    error?: { code: string; message: string; exitCode: number };
  };
};

describe("PixelAid local HTTP automation API", () => {
  it("answers health and status without starting an external server", async () => {
    const api = createPixelAidHttpHandler();

    const health = await request(api, { method: "GET", path: "/health" });
    const status = await request(api, { method: "GET", path: "/v1/status" });

    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ ok: true, status: "ok", service: "pixelaid-http" });
    expect(status.status).toBe(200);
    expect(status.body.jobs).toEqual({ total: 0, queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 });
  });

  it("returns stable JSON validation envelopes", async () => {
    const api = createPixelAidHttpHandler();

    const malformed = await request(api, { method: "POST", path: "/v1/jobs/inspect", body: "{" });
    const invalid = await request(api, { method: "POST", path: "/v1/jobs/inspect", body: JSON.stringify({ options: {} }) });
    const missing = await request(api, { method: "GET", path: "/v1/jobs/missing" });
    const unsupported = await request(api, { method: "PATCH", path: "/v1/jobs/inspect" });

    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ ok: false, error: { code: "invalid_options", exitCode: 2 } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error?.message).toContain("inputPath");
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ ok: false, error: { code: "not_found", exitCode: 2 } });
    expect(unsupported.status).toBe(405);
    expect(unsupported.body).toMatchObject({ ok: false, error: { code: "method_not_allowed", exitCode: 2 } });
  });

  it("submits inspect jobs and records lifecycle progress", async () => {
    const api = createPixelAidHttpHandler({
      idFactory: () => "job_0001",
      operations: {
        inspect: async (_request, runtime) => {
          emitProgress(runtime, "inspect_image", "input-read", 15, "Reading source image");
          emitProgress(runtime, "inspect_image", "analysis", 65, "Analyzing source image");
          return automationOk({ image: { width: 4, height: 4 } }, ["small fixture"]);
        },
      },
    });

    const submitted = await request(api, {
      method: "POST",
      path: "/v1/jobs/inspect",
      body: JSON.stringify({ inputPath: "sprite.png" }),
    });

    expect(submitted.status).toBe(202);
    expect(submitted.body.job).toMatchObject({ id: "job_0001", operation: "inspect", status: "queued" });

    const completed = await waitForJob(api, "job_0001", "succeeded");

    expect(completed.body.job).toMatchObject({
      id: "job_0001",
      operation: "inspect",
      status: "succeeded",
      progress: 100,
      result: { image: { width: 4, height: 4 } },
      warnings: ["small fixture"],
    });
    expect(completed.body.job?.progressEvents.map((event) => event.stage)).toEqual(["input-read", "analysis", "complete"]);
  });

  it("submits fix and export jobs through the automation runtime", async () => {
    const seenOperations: HttpAutomationOperationName[] = [];
    const api = createPixelAidHttpHandler({
      idFactory: createIdFactory(["fix_sprite", "fix_sheet", "export_bundle"]),
      operations: {
        fixSprite: async (body, runtime) => {
          seenOperations.push("fix");
          emitProgress(runtime, "fix_sprite", "output-write", 80, "Writing fixed PNG");
          return automationOk({ outputPath: body.outputPath });
        },
        fixSpriteSheet: async (body, runtime) => {
          seenOperations.push("fix");
          emitProgress(runtime, "fix_sprite_sheet", "sheet-detection", 40, "Resolving frames");
          return automationOk({ outDir: body.outDir });
        },
        exportEngineBundle: async (body, runtime) => {
          seenOperations.push("export");
          emitProgress(runtime, "export_engine_bundle", "engine-export", 70, "Building export metadata");
          return automationOk({ targets: body.targets });
        },
      },
    });

    await request(api, { method: "POST", path: "/v1/jobs/fix", body: JSON.stringify({ inputPath: "sprite.png", outputPath: "fixed.png" }) });
    await request(api, { method: "POST", path: "/v1/jobs/fix", body: JSON.stringify({ inputPath: "sheet.png", outDir: "sheet-out", kind: "spriteSheet" }) });
    await request(api, { method: "POST", path: "/v1/jobs/export", body: JSON.stringify({ inputPath: "sprite.png", outDir: "export", targets: ["godot"] }) });

    const fixSprite = await waitForJob(api, "fix_sprite", "succeeded");
    const fixSheet = await waitForJob(api, "fix_sheet", "succeeded");
    const exported = await waitForJob(api, "export_bundle", "succeeded");

    expect(seenOperations).toEqual(["fix", "fix", "export"]);
    expect(fixSprite.body.job?.result).toEqual({ outputPath: "fixed.png" });
    expect(fixSheet.body.job?.result).toEqual({ outDir: "sheet-out" });
    expect(exported.body.job?.result).toEqual({ targets: ["godot"] });
  });

  it("cancels running jobs with the automation cancellation controller", async () => {
    const api = createPixelAidHttpHandler({
      idFactory: () => "job_cancel",
      operations: {
        inspect: async (_request, runtime) => {
          emitProgress(runtime, "inspect_image", "analysis", 25, "Started cancellable work");
          await waitUntilCancelled(runtime);
          return automationError("cancelled", runtime?.signal?.reason ?? "Operation cancelled", 5);
        },
      },
    });

    await request(api, { method: "POST", path: "/v1/jobs/inspect", body: JSON.stringify({ inputPath: "slow.png" }) });
    await waitForJob(api, "job_cancel", "running");

    const cancelled = await request(api, { method: "POST", path: "/v1/jobs/job_cancel/cancel", body: JSON.stringify({ reason: "User cancelled" }) });
    const finalStatus = await waitForJob(api, "job_cancel", "cancelled");

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.job?.status).toBe("running");
    expect(finalStatus.body.job).toMatchObject({
      id: "job_cancel",
      status: "cancelled",
      error: { code: "cancelled", message: "User cancelled" },
    });
  });
});

function createIdFactory(ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `job_${index}`;
}

function emitProgress(
  runtime: AutomationRuntimeOptions | undefined,
  operation: AutomationProgressEvent["operation"],
  stage: AutomationProgressEvent["stage"],
  percent: number,
  message: string,
): void {
  runtime?.onProgress?.({ operation, stage, percent, message, jobId: runtime.jobId });
}

async function waitUntilCancelled(runtime: AutomationRuntimeOptions | undefined): Promise<void> {
  for (let attempts = 0; attempts < 100; attempts += 1) {
    if (runtime?.signal?.aborted) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Timed out waiting for cancellation");
}

async function waitForJob(
  api: ReturnType<typeof createPixelAidHttpHandler>,
  id: string,
  status: string,
): Promise<JsonResponse> {
  let last: JsonResponse | undefined;
  for (let attempts = 0; attempts < 100; attempts += 1) {
    last = await request(api, { method: "GET", path: `/v1/jobs/${id}` });
    if (last.body.job?.status === status) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`Timed out waiting for ${id} to reach ${status}; last=${JSON.stringify(last?.body)}`);
}

async function request(
  api: ReturnType<typeof createPixelAidHttpHandler>,
  request: HttpAutomationRequest,
): Promise<JsonResponse> {
  const response = await api.handle(request);
  return {
    status: response.status,
    body: JSON.parse(response.body),
  };
}
