import { describe, expect, test } from "vitest";
import type { FixOptions, PixelFixResult } from "./types";
import {
  createRobustEvidenceCandidate,
  createRobustEvidenceRecord,
  createRobustEvidenceSettingsSnapshot,
  sanitizeRobustEvidenceText,
  stableStringifyRobustEvidenceValue,
  validateRobustEvidenceRecord
} from "./robustEvidence";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const settingsHash = "c".repeat(64);

const options: FixOptions = {
  mode: "single",
  assetType: "sprite",
  reconstruction: { sizeMode: "auto" },
  packaging: { canvasMode: "exact", width: 128, height: 128, framing: "preserveComposition", scale: "native", anchor: "center" },
  maxColors: 24,
  grid: { detect: "auto", autoStrategy: "robust", robustSafety: "guarded", cropToBounds: true },
  downscale: "adaptive",
  alpha: "preserve",
  cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true }
};

function result(requested: "classic" | "robust", selected = requested): PixelFixResult {
  return {
    image: { width: 128, height: 128, data: new Uint8ClampedArray(128 * 128 * 4) },
    palette: ["#000000", "#ffffff"],
    grid: {
      outputWidth: 81,
      outputHeight: 102,
      scaleX: 11,
      scaleY: 11,
      phaseX: 1,
      phaseY: 3,
      confidence: 0.57,
      reason: "fixture",
      diagnostics: {
        edgeScore: 0.5,
        runScore: 0.6,
        sizeScore: 1,
        scaleScore: 1,
        divisibilityScore: 1,
        cropUsed: true,
        sourceCoverage: 0.6,
        confidenceLabel: "medium",
        notes: [],
        selection: {
          requestedStrategy: requested,
          selectedStrategy: selected,
          robustSafety: "guarded",
          decision: selected === requested ? "selected" : "fallback",
          reasonCodes: selected === requested ? ["robust-selected"] : ["moderate-anisotropy"],
          message: "fixture"
        }
      }
    },
    reconstruction: {
      nativeCanvas: { width: 113, height: 113 },
      reconstructedImage: { width: 81, height: 102 },
      compositionPlacement: { x: 14, y: 5, w: 81, h: 102 },
      contentBounds: { x: 1, y: 1, w: 80, h: 101 },
      contentBoundsSource: "alpha",
      requestedStrategy: requested,
      usedStrategy: selected
    },
    packaging: {
      canvasMode: "exact",
      framing: "preserveComposition",
      scaleMode: "native",
      anchor: "center",
      canvas: { width: 128, height: 128 },
      placement: { x: 21, y: 12, w: 81, h: 102 },
      appliedScale: 1,
      trimOffset: { x: 0, y: 0 },
      warnings: []
    },
    metrics: {
      durationMs: 12.3456789,
      sourceWidth: 1254,
      sourceHeight: 1254,
      outputWidth: 128,
      outputHeight: 128,
      paletteCount: 2,
      gridConfidence: 0.57
    },
    settings: { ...options, grid: { ...options.grid, autoStrategy: requested } }
  };
}

describe("Robust Preview evidence", () => {
  test("normalizes comparison settings without strategy or safety", () => {
    const snapshot = createRobustEvidenceSettingsSnapshot(options);
    expect(snapshot.grid).toEqual({ cropToBounds: true, detect: "auto" });
    expect(stableStringifyRobustEvidenceValue({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  test("extracts Guarded fallback provenance without image bytes", () => {
    const candidate = createRobustEvidenceCandidate(result("robust", "classic"), "robust", hashB, settingsHash);
    expect(candidate).toMatchObject({
      requestedStrategy: "robust",
      selectedStrategy: "classic",
      decision: "fallback",
      reasonCodes: ["moderate-anisotropy"],
      output: { width: 128, height: 128 },
      packagingCanvas: { width: 128, height: 128 }
    });
    expect(JSON.stringify(candidate)).not.toContain("data");
  });

  test("creates a valid sanitized record", () => {
    const classic = createRobustEvidenceCandidate(result("classic"), "classic", hashA, settingsHash);
    const robust = createRobustEvidenceCandidate(result("robust", "classic"), "robust", hashA, settingsHash);
    const record = createRobustEvidenceRecord({
      recordId: "record:fixture-001",
      participantId: "participant:fixture",
      proceduralDryRun: true,
      app: { version: "0.2.0", surface: "internal-dry-run", platform: "windows" },
      source: {
        sha256: hashB,
        width: 1254,
        height: 1254,
        assetType: "sprite",
        collectionId: "collection:first-party",
        sharingPermission: "public"
      },
      comparison: {
        settingsSha256: settingsHash,
        settings: createRobustEvidenceSettingsSnapshot(options),
        assignmentToken: "assignment:fixture",
        assignment: { candidateA: "robust", candidateB: "classic" },
        outputsIdentical: true,
        classic,
        robust
      },
      review: {
        preference: "tie",
        geometry: "pass",
        severity: "none",
        manualOverride: "not-needed",
        fallbackAppropriate: "yes",
        failureClasses: [],
        notes: "Contact me at test@example.com; C:\\private\\hero.png; sk-test_abcdefghijklmnopqrstuvwxyz",
        completedAt: "2026-08-01T12:00:00.000Z"
      },
      validation: { eligible: true, settingsMatch: true, valid: true, exclusionReasons: [] }
    });

    expect(validateRobustEvidenceRecord(record)).toEqual({ valid: true, errors: [] });
    expect(record.review.notes).toBe("Contact me at [redacted-email]; [redacted-path] [redacted-secret]");
    expect(JSON.stringify(record)).not.toContain("hero.png");
  });

  test("rejects a mismatched comparison settings hash", () => {
    const classic = createRobustEvidenceCandidate(result("classic"), "classic", hashA, settingsHash);
    const robust = createRobustEvidenceCandidate(result("robust"), "robust", hashB, hashB);
    const invalid = {
      kind: "pixelaid-robust-evidence",
      schemaVersion: 1,
      campaignId: "robust-preview-0.2.0-phase8-v1",
      frozenBaseline: "f125d8f",
      recordId: "record:fixture-002",
      participantId: "participant:fixture",
      createdAt: "2026-08-01T12:00:00.000Z",
      source: { sha256: hashA },
      comparison: {
        settingsSha256: settingsHash,
        settings: {},
        assignment: { candidateA: "classic", candidateB: "robust" },
        classic,
        robust
      },
      review: { completedAt: "2026-08-01T12:00:00.000Z" },
      validation: {}
    };

    expect(validateRobustEvidenceRecord(invalid)).toEqual({
      valid: false,
      errors: ["robust candidate settings do not match the comparison."]
    });
  });

  test("rejects source identity fields and private settings metadata", () => {
    const classic = createRobustEvidenceCandidate(result("classic"), "classic", hashA, settingsHash);
    const robust = createRobustEvidenceCandidate(result("robust"), "robust", hashB, settingsHash);
    const invalid = {
      kind: "pixelaid-robust-evidence",
      schemaVersion: 1,
      campaignId: "robust-preview-0.2.0-phase8-v1",
      frozenBaseline: "f125d8f",
      recordId: "record:fixture-003",
      participantId: "participant:fixture",
      createdAt: "2026-08-01T12:00:00.000Z",
      source: { sha256: hashA, filename: "private.png" },
      comparison: {
        settingsSha256: settingsHash,
        settings: { prompt: "private prompt" },
        assignment: { candidateA: "classic", candidateB: "robust" },
        classic,
        robust
      },
      review: { completedAt: "2026-08-01T12:00:00.000Z" },
      validation: {}
    };

    expect(validateRobustEvidenceRecord(invalid).errors).toEqual([
      "Source metadata contains unsupported fields.",
      "Comparison settings contain unsupported private metadata."
    ]);
  });

  test("sanitizes and bounds free-form feedback", () => {
    expect(sanitizeRobustEvidenceText(`/Users/me/private.png ${"x".repeat(1_100)}`, 40)).toHaveLength(40);
    expect(sanitizeRobustEvidenceText("/Users/me/private.png")).toBe("[redacted-path]");
  });
});
