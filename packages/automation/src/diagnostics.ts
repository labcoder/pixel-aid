import type {
  AutomationError,
  AutomationErrorCode,
  AutomationExitCode,
} from "./result";

export type DiagnosticStatus = "success" | "failure";

export type DiagnosticAppInfo = {
  name: string;
  version: string;
  packageName: string;
};

export type DiagnosticReport = {
  schemaVersion: 1;
  app: DiagnosticAppInfo;
  command: string;
  operation?: string;
  timestamp: string;
  status: DiagnosticStatus;
  exitCode: AutomationExitCode | 0;
  error?: AutomationError;
  options?: unknown;
  paths?: unknown;
  metadata?: unknown;
  warnings: string[];
  recoveryHints: string[];
};

export type CreateDiagnosticReportInput = {
  app: DiagnosticAppInfo;
  command: string;
  operation?: string;
  timestamp?: string | Date;
  status: DiagnosticStatus;
  exitCode: AutomationExitCode | 0;
  error?: AutomationError;
  options?: unknown;
  paths?: unknown;
  metadata?: unknown;
  warnings?: readonly string[];
  recoveryHints?: readonly string[];
};

const redacted = "[REDACTED]";
const maxStringLength = 4_000;
const secretKeyPattern = /(?:api[-_]?key|token|secret|password|passwd|authorization|auth|credential|private[-_]?prompt|negative[-_]?prompt|prompt)/i;
const secretFlagPattern = /^--?(?:api[-_]?key|token|secret|password|authorization|auth|prompt|private[-_]?prompt|negative[-_]?prompt)$/i;

export function createDiagnosticReport(input: CreateDiagnosticReportInput): DiagnosticReport {
  const report: DiagnosticReport = {
    schemaVersion: 1,
    app: {
      name: input.app.name,
      version: input.app.version,
      packageName: input.app.packageName,
    },
    command: input.command,
    ...(input.operation ? { operation: input.operation } : {}),
    timestamp: normalizeTimestamp(input.timestamp),
    status: input.status,
    exitCode: input.exitCode,
    ...(input.error ? { error: sanitizeAutomationError(input.error) } : {}),
    ...(input.options !== undefined ? { options: sanitizeDiagnosticValue(input.options) } : {}),
    ...(input.paths !== undefined ? { paths: sanitizeDiagnosticValue(input.paths) } : {}),
    ...(input.metadata !== undefined ? { metadata: sanitizeDiagnosticValue(input.metadata) } : {}),
    warnings: sanitizeStringArray(input.warnings ?? []),
    recoveryHints: sanitizeStringArray(input.recoveryHints ?? recoveryHintsFor(input.status, input.error?.code)),
  };

  return report;
}

export function sanitizeDiagnosticValue(value: unknown): unknown {
  return sanitizeValue(value, undefined, new WeakSet<object>());
}

function sanitizeAutomationError(error: AutomationError): AutomationError {
  return {
    code: error.code,
    message: sanitizeString(error.message),
    exitCode: error.exitCode,
    ...(error.details !== undefined ? { details: sanitizeDiagnosticValue(error.details) as Record<string, unknown> } : {}),
  };
}

function sanitizeValue(value: unknown, key: string | undefined, seen: WeakSet<object>): unknown {
  if (key && secretKeyPattern.test(key)) {
    return redacted;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return sanitizeArray(value, seen);
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      output[entryKey] = sanitizeValue(entryValue, entryKey, seen);
    }
    seen.delete(value);
    return output;
  }

  return String(value);
}

function sanitizeArray(values: readonly unknown[], seen: WeakSet<object>): unknown[] {
  const sanitized: unknown[] = [];
  let redactNext = false;

  for (const value of values) {
    if (redactNext) {
      sanitized.push(redacted);
      redactNext = false;
      continue;
    }

    if (typeof value === "string" && secretFlagPattern.test(value)) {
      sanitized.push(value);
      redactNext = true;
      continue;
    }

    sanitized.push(sanitizeValue(value, undefined, seen));
  }

  return sanitized;
}

function sanitizeString(value: string): string {
  let output = value;
  output = output.replace(/\b(Bearer)\s+([A-Za-z0-9._~+/=-]{8,})\b/gi, "$1 [REDACTED]");
  output = output.replace(/\b([A-Z0-9_]*(?:API[-_]?KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION)[A-Z0-9_]*)\s*=\s*([^\s,;]+)/gi, "$1=[REDACTED]");
  output = output.replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g, redacted);
  output = output.replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, redacted);
  output = output.replace(/\b(prompt)\s+[^.\n\r]+/gi, "$1 [REDACTED]");
  if (output.length > maxStringLength) {
    return `${output.slice(0, maxStringLength)}...[truncated]`;
  }
  return output;
}

function sanitizeStringArray(values: readonly string[]): string[] {
  return values.map((value) => sanitizeString(value));
}

function normalizeTimestamp(timestamp: string | Date | undefined): string {
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  return timestamp ?? new Date().toISOString();
}

function recoveryHintsFor(status: DiagnosticStatus, code: AutomationErrorCode | undefined): string[] {
  if (status === "success") {
    return ["No recovery action needed."];
  }

  switch (code) {
    case "invalid_options":
      return ["Check the command flags and option values, then retry."];
    case "input_not_found":
    case "unsupported_format":
    case "decode_failed":
      return ["Verify the input file exists, is readable, and is a supported PNG image."];
    case "output_exists":
      return ["Choose a different output path or pass --overwrite when replacing generated files is intended."];
    case "unsafe_output":
      return ["Use an output path inside the requested output directory."];
    case "encode_failed":
    case "write_failed":
      return ["Check output permissions and available disk space, then retry."];
    case "processing_failed":
      return ["Inspect the source image and try explicit grid, target size, or sheet settings."];
    case "export_failed":
      return ["Review export target settings and retry with a single engine target if needed."];
    case "cancelled":
      return ["Rerun the command when you are ready for the operation to complete."];
    default:
      return ["Review the sanitized error and rerun with --diagnostics if support needs the report."];
  }
}
