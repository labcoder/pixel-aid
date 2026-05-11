import { describe, expect, test } from "vitest";
import { createOperationErrorReport, createWebDiagnosticReport, sanitizeDiagnosticValue } from "./diagnosticReport";

describe("diagnostic report", () => {
  test("redacts secret-like keys and prompt fields", () => {
    const sanitized = sanitizeDiagnosticValue({
      apiKey: "fixture-api-key-secret",
      provenance: {
        prompt: "private prompt",
        sourceImage: "robot.png"
      },
      settings: {
        maxColors: 16
      }
    });

    expect(sanitized).toEqual({
      apiKey: "[redacted]",
      provenance: {
        prompt: "[redacted]",
        sourceImage: "robot.png"
      },
      settings: {
        maxColors: 16
      }
    });
  });

  test("redacts secret-like values inside logs", () => {
    const report = createWebDiagnosticReport({
      appVersion: "0.1.0",
      generatedAt: "2026-05-01T00:00:00.000Z",
      route: "/",
      logs: ["OPENAI_API_KEY=fixture-api-key-secret failed"],
      settings: { maxColors: 16 }
    });

    expect(report.logs[0]).toBe("[redacted] failed");
  });

  test("creates operation errors with recovery guidance", () => {
    const error = createOperationErrorReport("fix", new Error("Worker failed"), "Try a smaller target.", "2026-05-01T00:00:00.000Z", {
      authorization: "Bearer abcdefghijklmnop"
    });

    expect(error).toEqual({
      operation: "fix",
      message: "Worker failed",
      occurredAt: "2026-05-01T00:00:00.000Z",
      recovery: "Try a smaller target.",
      details: {
        authorization: "[redacted]"
      }
    });
  });
});
