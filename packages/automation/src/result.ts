export type AutomationExitCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8;

export type AutomationErrorCode =
  | "unexpected_error"
  | "invalid_options"
  | "input_not_found"
  | "unsupported_format"
  | "decode_failed"
  | "encode_failed"
  | "write_failed"
  | "output_exists"
  | "unsafe_output"
  | "processing_failed"
  | "export_failed"
  | "cancelled";

export type AutomationError = {
  code: AutomationErrorCode;
  message: string;
  exitCode: AutomationExitCode;
  details?: Record<string, unknown>;
};

export type AutomationSuccess<T> = {
  ok: true;
  value: T;
  warnings: string[];
};

export type AutomationFailure = {
  ok: false;
  error: AutomationError;
};

export type AutomationResult<T> = AutomationSuccess<T> | AutomationFailure;

export function automationOk<T>(value: T, warnings: string[] = []): AutomationSuccess<T> {
  return { ok: true, value, warnings };
}

export function automationError(
  code: AutomationErrorCode,
  message: string,
  exitCode: AutomationExitCode,
  details?: Record<string, unknown>,
): AutomationFailure {
  return {
    ok: false,
    error: details === undefined ? { code, message, exitCode } : { code, message, exitCode, details },
  };
}

export function unknownAutomationError(error: unknown, fallbackMessage: string): AutomationFailure {
  return automationError("unexpected_error", fallbackMessage, 1, {
    cause: error instanceof Error ? error.message : String(error),
  });
}
