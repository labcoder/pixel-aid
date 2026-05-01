import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  automationError,
  createAutomationCancellationController,
  exportEngineBundle,
  fixSprite,
  fixSpriteSheet,
  inspectImage,
  unknownAutomationError,
  type AutomationError,
  type AutomationOperation,
  type AutomationProgressEvent,
  type AutomationResult,
  type AutomationRuntimeOptions,
  type ExportEngineBundleRequest,
  type FixSpriteRequest,
  type FixSpriteSheetRequest,
  type InspectImageRequest,
} from "@pixelaid/automation";

export type HttpAutomationOperationName = "inspect" | "fix" | "export";

export type HttpAutomationJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type HttpAutomationRequest = {
  method: string;
  path: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string | Uint8Array | null;
};

export type HttpAutomationResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type HttpAutomationError = Omit<AutomationError, "code"> & {
  code: AutomationError["code"] | "not_found" | "method_not_allowed";
};

export type HttpAutomationJobSnapshot = {
  id: string;
  operation: HttpAutomationOperationName;
  status: HttpAutomationJobStatus;
  progress: number;
  progressEvents: AutomationProgressEvent[];
  submittedAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: HttpAutomationError;
  warnings: string[];
};

export type HttpAutomationStatus = {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
};

export type PixelAidHttpOperations = {
  inspect: (request: InspectImageRequest, runtime?: AutomationRuntimeOptions) => Promise<AutomationResult<unknown>>;
  fixSprite: (request: FixSpriteRequest, runtime?: AutomationRuntimeOptions) => Promise<AutomationResult<unknown>>;
  fixSpriteSheet: (request: FixSpriteSheetRequest, runtime?: AutomationRuntimeOptions) => Promise<AutomationResult<unknown>>;
  exportEngineBundle: (request: ExportEngineBundleRequest, runtime?: AutomationRuntimeOptions) => Promise<AutomationResult<unknown>>;
};

export type PixelAidHttpHandlerOptions = {
  idFactory?: (() => string) | undefined;
  now?: (() => Date) | undefined;
  operations?: Partial<PixelAidHttpOperations> | undefined;
};

export type PixelAidHttpHandler = {
  readonly jobs: HttpAutomationJobStore;
  handle: (request: HttpAutomationRequest) => Promise<HttpAutomationResponse>;
};

type JobRecord = {
  id: string;
  operation: HttpAutomationOperationName;
  automationOperation: AutomationOperation;
  status: HttpAutomationJobStatus;
  progress: number;
  progressEvents: AutomationProgressEvent[];
  submittedAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: HttpAutomationError;
  warnings: string[];
  controller: ReturnType<typeof createAutomationCancellationController>;
};

type SubmitJobOptions = {
  operation: HttpAutomationOperationName;
  automationOperation: AutomationOperation;
  run: (runtime: AutomationRuntimeOptions) => Promise<AutomationResult<unknown>>;
};

export type HttpAutomationJobStore = {
  submit: (options: SubmitJobOptions) => HttpAutomationJobSnapshot;
  get: (id: string) => HttpAutomationJobSnapshot | undefined;
  cancel: (id: string, reason?: string) => HttpAutomationJobSnapshot | undefined;
  status: () => HttpAutomationStatus;
};

const defaultOperations: PixelAidHttpOperations = {
  inspect: inspectImage,
  fixSprite,
  fixSpriteSheet,
  exportEngineBundle,
};

const defaultEngineTargets: ExportEngineBundleRequest["targets"] = ["godot", "unity", "phaser"];
const engineTargets = new Set<ExportEngineBundleRequest["targets"][number]>([
  "godot",
  "unity",
  "phaser",
  "texturepacker",
  "tiled",
  "ldtk",
]);

export function createPixelAidHttpHandler(options: PixelAidHttpHandlerOptions = {}): PixelAidHttpHandler {
  const jobs = createAutomationJobStore({
    idFactory: options.idFactory,
    now: options.now,
  });
  const operations = { ...defaultOperations, ...options.operations };

  return {
    jobs,
    async handle(request) {
      try {
        return await routeRequest(request, jobs, operations);
      } catch (error) {
        const failure = unknownAutomationError(error, "Unexpected HTTP automation failure.");
        return jsonResponse(500, { ok: false, error: failure.error });
      }
    },
  };
}

export function createAutomationJobStore(options: Pick<PixelAidHttpHandlerOptions, "idFactory" | "now"> = {}): HttpAutomationJobStore {
  const idFactory = options.idFactory ?? createDefaultIdFactory();
  const now = options.now ?? (() => new Date());
  const jobs = new Map<string, JobRecord>();

  return {
    submit(jobOptions) {
      const job: JobRecord = {
        id: idFactory(),
        operation: jobOptions.operation,
        automationOperation: jobOptions.automationOperation,
        status: "queued",
        progress: 0,
        progressEvents: [],
        submittedAt: now().toISOString(),
        warnings: [],
        controller: createAutomationCancellationController(),
      };
      jobs.set(job.id, job);
      queueMicrotask(() => {
        void runJob(job, jobOptions.run, now);
      });
      return snapshotJob(job);
    },
    get(id) {
      const job = jobs.get(id);
      return job ? snapshotJob(job) : undefined;
    },
    cancel(id, reason = "Operation cancelled") {
      const job = jobs.get(id);
      if (!job) {
        return undefined;
      }
      if (isTerminalStatus(job.status)) {
        return snapshotJob(job);
      }

      job.controller.cancel(reason);
      if (job.status === "queued") {
        finishJob(job, now, {
          ok: false,
          error: automationError("cancelled", reason, 5).error,
        });
      }
      return snapshotJob(job);
    },
    status() {
      const summary: HttpAutomationStatus = {
        total: jobs.size,
        queued: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        cancelled: 0,
      };
      for (const job of jobs.values()) {
        summary[job.status] += 1;
      }
      return summary;
    },
  };
}

export type PixelAidHttpServerOptions = PixelAidHttpHandlerOptions & {
  host?: string;
  port?: number;
};

export type PixelAidHttpServer = {
  server: Server;
  handler: PixelAidHttpHandler;
  listen: () => Promise<{ host: string; port: number }>;
};

export function createPixelAidHttpServer(options: PixelAidHttpServerOptions = {}): PixelAidHttpServer {
  const handler = createPixelAidHttpHandler(options);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  if (!isLocalHost(host)) {
    throw new Error("PixelAid HTTP API only binds to localhost addresses.");
  }

  const server = createServer((request, response) => {
    void handleNodeRequest(handler, request, response);
  });

  return {
    server,
    handler,
    listen: () => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        const address = server.address();
        resolve({
          host,
          port: typeof address === "object" && address ? address.port : port,
        });
      });
    }),
  };
}

async function routeRequest(
  request: HttpAutomationRequest,
  jobs: HttpAutomationJobStore,
  operations: PixelAidHttpOperations,
): Promise<HttpAutomationResponse> {
  const method = request.method.toUpperCase();
  const pathname = parsePathname(request.path);

  if (pathname === "/health") {
    return method === "GET"
      ? jsonResponse(200, { ok: true, service: "pixelaid-http", status: "ok", version: "0.1.0" })
      : methodNotAllowed("GET");
  }

  if (pathname === "/v1/status") {
    return method === "GET"
      ? jsonResponse(200, { ok: true, status: "ready", jobs: jobs.status() })
      : methodNotAllowed("GET");
  }

  if (pathname === "/v1/jobs/inspect") {
    if (method !== "POST") return methodNotAllowed("POST");
    return submitInspect(request, jobs, operations.inspect);
  }

  if (pathname === "/v1/jobs/fix") {
    if (method !== "POST") return methodNotAllowed("POST");
    return submitFix(request, jobs, operations);
  }

  if (pathname === "/v1/jobs/export") {
    if (method !== "POST") return methodNotAllowed("POST");
    return submitExport(request, jobs, operations.exportEngineBundle);
  }

  const jobMatch = /^\/v1\/jobs\/([^/]+)(?:\/cancel)?$/.exec(pathname);
  if (jobMatch) {
    const jobId = decodeURIComponent(jobMatch[1]!);
    if (pathname.endsWith("/cancel")) {
      if (method !== "POST") return methodNotAllowed("POST");
      return cancelJob(request, jobs, jobId);
    }
    if (method === "GET") {
      const job = jobs.get(jobId);
      return job ? jsonResponse(200, { ok: true, job }) : notFound(`Unknown job "${jobId}".`);
    }
    if (method === "DELETE") {
      const job = jobs.cancel(jobId);
      return job ? jsonResponse(200, { ok: true, job }) : notFound(`Unknown job "${jobId}".`);
    }
    return methodNotAllowed("GET, DELETE");
  }

  return notFound(`Unknown endpoint "${pathname}".`);
}

async function submitInspect(
  request: HttpAutomationRequest,
  jobs: HttpAutomationJobStore,
  inspect: PixelAidHttpOperations["inspect"],
): Promise<HttpAutomationResponse> {
  const parsed = parseJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const inputPath = readRequiredString(parsed.value, "inputPath");
  if (!inputPath.ok) return inputPath.response;

  const body: InspectImageRequest = {
    inputPath: inputPath.value,
    ...(isPlainObject(parsed.value.options) ? { options: parsed.value.options } : {}),
  };
  const job = jobs.submit({
    operation: "inspect",
    automationOperation: "inspect_image",
    run: (runtime) => inspect(body, runtime),
  });
  return jsonResponse(202, { ok: true, job });
}

async function submitFix(
  request: HttpAutomationRequest,
  jobs: HttpAutomationJobStore,
  operations: PixelAidHttpOperations,
): Promise<HttpAutomationResponse> {
  const parsed = parseJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const inputPath = readRequiredString(parsed.value, "inputPath");
  if (!inputPath.ok) return inputPath.response;

  if (isSheetFixRequest(parsed.value)) {
    const outDir = readRequiredString(parsed.value, "outDir");
    if (!outDir.ok) return outDir.response;
    const body: FixSpriteSheetRequest = {
      inputPath: inputPath.value,
      outDir: outDir.value,
      ...(typeof parsed.value.outputPath === "string" ? { outputPath: parsed.value.outputPath } : {}),
      ...(typeof parsed.value.manifestPath === "string" ? { manifestPath: parsed.value.manifestPath } : {}),
      ...(typeof parsed.value.detectSheet === "boolean" ? { detectSheet: parsed.value.detectSheet } : {}),
      ...(Array.isArray(parsed.value.frames) ? { frames: parsed.value.frames as NonNullable<FixSpriteSheetRequest["frames"]> } : {}),
      ...(Array.isArray(parsed.value.rowAnimations) ? { rowAnimations: parsed.value.rowAnimations as NonNullable<FixSpriteSheetRequest["rowAnimations"]> } : {}),
      ...(isPlainObject(parsed.value.options) ? { options: parsed.value.options } : {}),
      ...(typeof parsed.value.overwrite === "boolean" ? { overwrite: parsed.value.overwrite } : {}),
    };
    const job = jobs.submit({
      operation: "fix",
      automationOperation: "fix_sprite_sheet",
      run: (runtime) => operations.fixSpriteSheet(body, runtime),
    });
    return jsonResponse(202, { ok: true, job });
  }

  const outputPath = readRequiredString(parsed.value, "outputPath");
  if (!outputPath.ok) return outputPath.response;
  const body: FixSpriteRequest = {
    inputPath: inputPath.value,
    outputPath: outputPath.value,
    ...(typeof parsed.value.manifestPath === "string" ? { manifestPath: parsed.value.manifestPath } : {}),
    ...(isPlainObject(parsed.value.options) ? { options: parsed.value.options } : {}),
    ...(typeof parsed.value.overwrite === "boolean" ? { overwrite: parsed.value.overwrite } : {}),
  };
  const job = jobs.submit({
    operation: "fix",
    automationOperation: "fix_sprite",
    run: (runtime) => operations.fixSprite(body, runtime),
  });
  return jsonResponse(202, { ok: true, job });
}

async function submitExport(
  request: HttpAutomationRequest,
  jobs: HttpAutomationJobStore,
  exportBundle: PixelAidHttpOperations["exportEngineBundle"],
): Promise<HttpAutomationResponse> {
  const parsed = parseJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const inputPath = readRequiredString(parsed.value, "inputPath");
  if (!inputPath.ok) return inputPath.response;
  const outDir = readRequiredString(parsed.value, "outDir");
  if (!outDir.ok) return outDir.response;
  const targets = Array.isArray(parsed.value.targets)
    ? parsed.value.targets.filter(isEngineTarget)
    : defaultEngineTargets;
  if (targets.length === 0) {
    return invalidOptions("targets must include at least one engine target.");
  }

  const body: ExportEngineBundleRequest = {
    inputPath: inputPath.value,
    outDir: outDir.value,
    targets,
    ...(isPlainObject(parsed.value.options) ? { options: parsed.value.options } : {}),
    ...(typeof parsed.value.overwrite === "boolean" ? { overwrite: parsed.value.overwrite } : {}),
  };
  const job = jobs.submit({
    operation: "export",
    automationOperation: "export_engine_bundle",
    run: (runtime) => exportBundle(body, runtime),
  });
  return jsonResponse(202, { ok: true, job });
}

async function cancelJob(
  request: HttpAutomationRequest,
  jobs: HttpAutomationJobStore,
  jobId: string,
): Promise<HttpAutomationResponse> {
  const parsed = parseOptionalJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const reason = typeof parsed.value.reason === "string" && parsed.value.reason.trim().length > 0
    ? parsed.value.reason
    : "Operation cancelled";
  const job = jobs.cancel(jobId, reason);
  return job ? jsonResponse(200, { ok: true, job }) : notFound(`Unknown job "${jobId}".`);
}

async function runJob(
  job: JobRecord,
  run: (runtime: AutomationRuntimeOptions) => Promise<AutomationResult<unknown>>,
  now: () => Date,
): Promise<void> {
  if (job.status !== "queued") {
    return;
  }

  job.status = "running";
  job.startedAt = now().toISOString();
  const runtime: AutomationRuntimeOptions = {
    jobId: job.id,
    signal: job.controller.signal,
    onProgress: (event) => recordProgress(job, event),
  };

  try {
    if (runtime.signal?.aborted) {
      finishJob(job, now, automationError("cancelled", runtime.signal.reason ?? "Operation cancelled", 5));
      return;
    }
    const result = await run(runtime);
    finishJob(job, now, result);
  } catch (error) {
    if (runtime.signal?.aborted) {
      finishJob(job, now, automationError("cancelled", runtime.signal.reason ?? "Operation cancelled", 5));
      return;
    }
    finishJob(job, now, unknownAutomationError(error, "Unexpected job failure."));
  }
}

function finishJob(job: JobRecord, now: () => Date, result: AutomationResult<unknown>): void {
  if (result.ok) {
    job.status = "succeeded";
    job.result = result.value;
    job.warnings = result.warnings;
    appendProgress(job, "complete", 100, "Job complete");
  } else {
    job.status = result.error.code === "cancelled" ? "cancelled" : "failed";
    job.error = result.error;
    appendProgress(job, job.status === "cancelled" ? "cancelled" : "complete", 100, result.error.message);
  }
  job.progress = 100;
  job.completedAt = now().toISOString();
}

function recordProgress(job: JobRecord, event: AutomationProgressEvent): void {
  const progressEvent: AutomationProgressEvent = {
    ...event,
    jobId: job.id,
  };
  job.progress = clampProgress(event.percent);
  job.progressEvents.push(progressEvent);
}

function appendProgress(
  job: JobRecord,
  stage: AutomationProgressEvent["stage"],
  percent: number,
  message: string,
): void {
  recordProgress(job, {
    operation: job.automationOperation,
    stage,
    percent,
    message,
    jobId: job.id,
  });
}

function snapshotJob(job: JobRecord): HttpAutomationJobSnapshot {
  return {
    id: job.id,
    operation: job.operation,
    status: job.status,
    progress: job.progress,
    progressEvents: job.progressEvents.map((event) => ({ ...event })),
    submittedAt: job.submittedAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    ...(job.result !== undefined ? { result: job.result } : {}),
    ...(job.error ? { error: { ...job.error } } : {}),
    warnings: [...job.warnings],
  };
}

function isTerminalStatus(status: HttpAutomationJobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function isSheetFixRequest(value: Record<string, unknown>): boolean {
  return value.kind === "spriteSheet" || value.kind === "sheet" || typeof value.outDir === "string";
}

function parseJsonObject(request: HttpAutomationRequest): { ok: true; value: Record<string, unknown> } | { ok: false; response: HttpAutomationResponse } {
  const body = request.body;
  if (body === undefined || body === null || body.length === 0) {
    return { ok: false, response: invalidOptions("Request body must be a JSON object.") };
  }

  try {
    const text = typeof body === "string" ? body : new TextDecoder().decode(body);
    const parsed = JSON.parse(text) as unknown;
    if (!isPlainObject(parsed)) {
      return { ok: false, response: invalidOptions("Request body must be a JSON object.") };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, response: invalidOptions("Request body must contain valid JSON.") };
  }
}

function parseOptionalJsonObject(request: HttpAutomationRequest): { ok: true; value: Record<string, unknown> } | { ok: false; response: HttpAutomationResponse } {
  if (request.body === undefined || request.body === null || request.body.length === 0) {
    return { ok: true, value: {} };
  }
  return parseJsonObject(request);
}

function readRequiredString(value: Record<string, unknown>, key: string): { ok: true; value: string } | { ok: false; response: HttpAutomationResponse } {
  const raw = value[key];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, response: invalidOptions(`Request requires string field "${key}".`) };
  }
  return { ok: true, value: raw };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isEngineTarget(value: unknown): value is ExportEngineBundleRequest["targets"][number] {
  return typeof value === "string" && engineTargets.has(value as ExportEngineBundleRequest["targets"][number]);
}

function invalidOptions(message: string): HttpAutomationResponse {
  return jsonResponse(400, {
    ok: false,
    error: automationError("invalid_options", message, 2).error,
  });
}

function notFound(message: string): HttpAutomationResponse {
  return jsonResponse(404, {
    ok: false,
    error: {
      code: "not_found",
      message,
      exitCode: 2,
    },
  });
}

function methodNotAllowed(allowed: string): HttpAutomationResponse {
  return jsonResponse(405, {
    ok: false,
    error: {
      code: "method_not_allowed",
      message: `Method not allowed. Use ${allowed}.`,
      exitCode: 2,
    },
  }, { Allow: allowed });
}

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): HttpAutomationResponse {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
    body: `${JSON.stringify(body)}\n`,
  };
}

function parsePathname(path: string): string {
  return new URL(path, "http://127.0.0.1").pathname.replace(/\/+$/, "") || "/";
}

function createDefaultIdFactory(): () => string {
  let nextId = 0;
  return () => {
    nextId += 1;
    return `job_${nextId.toString(36).padStart(6, "0")}`;
  };
}

function clampProgress(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(percent)));
}

async function handleNodeRequest(
  handler: PixelAidHttpHandler,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = await readNodeBody(request);
  const handled = await handler.handle({
    method: request.method ?? "GET",
    path: request.url ?? "/",
    headers: request.headers as Record<string, string | string[] | undefined>,
    body,
  });
  response.writeHead(handled.status, handled.headers);
  response.end(handled.body);
}

async function readNodeBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  }
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function isLocalHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}
