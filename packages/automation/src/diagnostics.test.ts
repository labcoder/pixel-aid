import { describe, expect, it } from "vitest";
import {
  createDiagnosticReport,
  sanitizeDiagnosticValue,
  type DiagnosticReport,
} from "./diagnostics";
import { automationError } from "./result";

describe("diagnostic sanitization", () => {
  it("redacts likely secrets, tokens, and private prompts from nested values", () => {
    const sanitized = sanitizeDiagnosticValue({
      apiKey: "fixture-api-key-redacted",
      access_token: "token-value",
      nested: {
        authorization: "Bearer abc.def.ghi",
        prompt: "private character prompt",
        safe: "keep this",
      },
      log: "request failed with OPENAI_API_KEY=fixture-api-key-redacted and bearer fixture-token-redacted",
      args: ["--api-key", "fixture-api-key-redacted", "--target", "64x64"],
    });

    expect(sanitized).toEqual({
      apiKey: "[REDACTED]",
      access_token: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]",
        prompt: "[REDACTED]",
        safe: "keep this",
      },
      log: "request failed with OPENAI_API_KEY=[REDACTED] and bearer [REDACTED]",
      args: ["--api-key", "[REDACTED]", "--target", "64x64"],
    });
  });

  it("keeps useful non-secret paths, numbers, booleans, and bounded strings", () => {
    const sanitized = sanitizeDiagnosticValue({
      inputPath: "C:/assets/hero.png",
      outputPath: "C:/assets/out/hero.fixed.png",
      maxColors: 24,
      overwrite: false,
      note: "palette over budget",
    });

    expect(sanitized).toEqual({
      inputPath: "C:/assets/hero.png",
      outputPath: "C:/assets/out/hero.fixed.png",
      maxColors: 24,
      overwrite: false,
      note: "palette over budget",
    });
  });
});

describe("diagnostic reports", () => {
  it("creates a deterministic sanitized failure report with recovery hints", () => {
    const failure = automationError("invalid_options", "Invalid apiKey=fixture-api-key-redacted in prompt private text.", 2, {
      apiKey: "fixture-api-key-redacted",
      prompt: "draw a private hero",
      target: "bad",
    });
    const report = createDiagnosticReport({
      app: { name: "PixelAid", version: "1.0.0", packageName: "@pixelaid/cli" },
      command: "fix",
      operation: "fix_sprite",
      timestamp: "2026-05-01T18:00:00.000Z",
      status: "failure",
      exitCode: failure.error.exitCode,
      error: failure.error,
      options: { target: "bad", apiKey: "fixture-api-key-redacted" },
      paths: { inputPath: "C:/assets/hero.png", outputPath: "C:/out/hero.png" },
      metadata: { argv: ["fix", "hero.png", "--api-key", "fixture-api-key-redacted"] },
    });

    expect(report).toMatchObject<DiagnosticReport>({
      schemaVersion: 1,
      app: { name: "PixelAid", version: "1.0.0", packageName: "@pixelaid/cli" },
      command: "fix",
      operation: "fix_sprite",
      timestamp: "2026-05-01T18:00:00.000Z",
      status: "failure",
      exitCode: 2,
      error: {
        code: "invalid_options",
        message: "Invalid apiKey=[REDACTED] in prompt [REDACTED].",
        exitCode: 2,
        details: { apiKey: "[REDACTED]", prompt: "[REDACTED]", target: "bad" },
      },
      options: { target: "bad", apiKey: "[REDACTED]" },
      paths: { inputPath: "C:/assets/hero.png", outputPath: "C:/out/hero.png" },
      metadata: { argv: ["fix", "hero.png", "--api-key", "[REDACTED]"] },
    });
    expect(report.recoveryHints).toContain("Check the command flags and option values, then retry.");
  });

  it("creates a sanitized success report without an error envelope", () => {
    const report = createDiagnosticReport({
      app: { name: "PixelAid", version: "1.0.0", packageName: "@pixelaid/cli" },
      command: "inspect",
      operation: "inspect_image",
      timestamp: "2026-05-01T18:00:00.000Z",
      status: "success",
      exitCode: 0,
      options: { maxColors: 8 },
      metadata: { summary: "Exact colors: 4" },
      warnings: ["Low grid confidence"],
    });

    expect(report.error).toBeUndefined();
    expect(report).toMatchObject({
      status: "success",
      exitCode: 0,
      options: { maxColors: 8 },
      warnings: ["Low grid confidence"],
      recoveryHints: ["No recovery action needed."],
    });
  });
});
