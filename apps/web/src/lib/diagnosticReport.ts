export type OperationErrorReport = {
  operation: string;
  message: string;
  occurredAt: string;
  recovery: string;
  details?: Record<string, unknown>;
};

export type WebDiagnosticReportInput = {
  appVersion: string;
  generatedAt: string;
  route: string;
  logs: string[];
  lastError?: OperationErrorReport | null;
  selectedAsset?: Record<string, unknown> | null;
  settings?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  warnings?: string[];
};

export type WebDiagnosticReport = {
  app: "PixelAid";
  version: string;
  generatedAt: string;
  route: string;
  logs: string[];
  lastError?: OperationErrorReport;
  selectedAsset?: Record<string, unknown>;
  settings: Record<string, unknown>;
  metrics: Record<string, unknown>;
  warnings: string[];
};

const redacted = "[redacted]";
const secretKeyPattern = /(api[-_]?key|authorization|bearer|client[-_]?secret|cookie|negativeprompt|password|prompt|secret|token)/i;
const secretValuePatterns = [
  /\bsk-[a-zA-Z0-9_-]{12,}\b/g,
  /\b[a-z0-9_-]*(?:api[-_]?key|authorization|bearer|token|secret|password)[a-z0-9_-]*\s*[:=]\s*["']?[^"',\s]+/gi,
  /\bBearer\s+[a-zA-Z0-9._-]{12,}\b/g
];

export function createOperationErrorReport(
  operation: string,
  error: unknown,
  recovery: string,
  occurredAt = new Date().toISOString(),
  details?: Record<string, unknown>
): OperationErrorReport {
  return {
    operation,
    message: error instanceof Error ? error.message : String(error),
    occurredAt,
    recovery,
    ...(details ? { details: sanitizeDiagnosticValue(details) as Record<string, unknown> } : {})
  };
}

export function createWebDiagnosticReport(input: WebDiagnosticReportInput): WebDiagnosticReport {
  return {
    app: "PixelAid",
    version: input.appVersion,
    generatedAt: input.generatedAt,
    route: input.route,
    logs: input.logs.map((line) => sanitizeDiagnosticString(line)),
    ...(input.lastError ? { lastError: sanitizeDiagnosticValue(input.lastError) as OperationErrorReport } : {}),
    ...(input.selectedAsset ? { selectedAsset: sanitizeDiagnosticValue(input.selectedAsset) as Record<string, unknown> } : {}),
    settings: sanitizeDiagnosticValue(input.settings ?? {}) as Record<string, unknown>,
    metrics: sanitizeDiagnosticValue(input.metrics ?? {}) as Record<string, unknown>,
    warnings: (input.warnings ?? []).map((warning) => sanitizeDiagnosticString(warning))
  };
}

export function sanitizeDiagnosticValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeDiagnosticString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticValue(item));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = secretKeyPattern.test(key) ? redacted : sanitizeDiagnosticValue(item);
    }
    return output;
  }
  return value;
}

export function sanitizeDiagnosticString(value: string): string {
  return secretValuePatterns.reduce((current, pattern) => current.replace(pattern, redacted), value);
}
