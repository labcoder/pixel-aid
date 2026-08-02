import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { evaluateRobustInferenceEligibility, fixImage } from "@pixelaid/core";
import {
  PIXELAID_VERSION,
  createRobustEvidenceAssignment,
  createRobustEvidenceCandidate,
  createRobustEvidenceFixOptions,
  createRobustEvidenceImageHashBytes,
  createRobustEvidenceRecord,
  createRobustEvidenceSettingsSnapshot,
  robustEvidenceSettingsMatch,
  stableStringifyRobustEvidenceValue,
  type PixelFixResult,
  type RGBAImage,
  type RobustEvidenceRecord,
  type RobustEvidenceSharingPermission,
  type RobustEvidenceSurface
} from "@pixelaid/shared";
import { encodePngFile, readRgbaImageFile } from "./imageIo";
import { normalizeFixOptions, type AutomationFixOptionsInput } from "./options";
import { planOutputFile, relativeToDirectory, writeJsonOutput } from "./paths";
import {
  assertAutomationNotCancelled,
  cancellationFailure,
  reportAutomationProgress,
  toFixRuntime,
  type AutomationRuntimeOptions
} from "./progress";
import { automationError, automationOk, type AutomationResult } from "./result";
import type { AutomationFileRecord } from "./operations";

export type CreateRobustEvidenceDryRunRequest = {
  inputPath: string;
  outDir: string;
  collectionId: string;
  options?: AutomationFixOptionsInput;
  sharingPermission?: RobustEvidenceSharingPermission;
  participantId?: string;
  assignmentIndex?: number;
  surface?: Extract<RobustEvidenceSurface, "cli" | "automation" | "internal-dry-run">;
  platform?: string;
  overwrite?: boolean;
};

export type RobustEvidenceDryRunResult = {
  record: RobustEvidenceRecord;
  files: AutomationFileRecord[];
  warnings: string[];
};

export async function createRobustEvidenceDryRun(
  request: CreateRobustEvidenceDryRunRequest,
  runtime?: AutomationRuntimeOptions
): Promise<AutomationResult<RobustEvidenceDryRunResult>> {
  const operation = "robust_evidence_dry_run" as const;
  const outDir = path.resolve(request.outDir);
  const classicPath = path.join(outDir, "classic.png");
  const robustPath = path.join(outDir, "robust.png");
  const recordPath = path.join(outDir, "evidence.json");
  const scopedRuntime: AutomationRuntimeOptions | undefined = runtime
    ? { ...runtime, inputPath: runtime.inputPath ?? request.inputPath, outputPath: runtime.outputPath ?? recordPath }
    : undefined;
  const writtenPaths: string[] = [];

  try {
    assertAutomationNotCancelled(scopedRuntime);
    const planned = await Promise.all([
      planOutputFile(classicPath, { overwrite: request.overwrite }),
      planOutputFile(robustPath, { overwrite: request.overwrite }),
      planOutputFile(recordPath, { overwrite: request.overwrite })
    ]);
    const conflict = planned.find((entry) => !entry.ok);
    if (conflict && !conflict.ok) return conflict;

    reportAutomationProgress(scopedRuntime, operation, "input-read", 5, "Reading decoded source image");
    const imageResult = await readRgbaImageFile(request.inputPath);
    if (!imageResult.ok) return imageResult;

    const normalized = normalizeFixOptions(request.options ?? {});
    if (!normalized.ok) return normalized;
    const classicOptions = createRobustEvidenceFixOptions(normalized.value, "classic");
    const robustOptions = createRobustEvidenceFixOptions(normalized.value, "robust");
    const settingsMatch = robustEvidenceSettingsMatch(classicOptions, robustOptions);
    const eligibility = evaluateRobustInferenceEligibility({
      mode: classicOptions.mode,
      assetType: classicOptions.assetType,
      ...(classicOptions.grid.cropToBounds !== undefined ? { cropToBounds: classicOptions.grid.cropToBounds } : {}),
      ...(classicOptions.outputSizeMode !== undefined ? { outputSizeMode: classicOptions.outputSizeMode } : {})
    });
    if (!eligibility.eligible) {
      return automationError("invalid_options", eligibility.message, 2, {
        ...(eligibility.reasonCode ? { reasonCode: eligibility.reasonCode } : {})
      });
    }
    if (!settingsMatch) {
      return automationError("processing_failed", "Classic and Robust evidence settings do not match.", 3);
    }

    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "analysis", 12, "Running Classic comparison candidate");
    const classic = runEvidenceFix(imageResult.value, classicOptions, scopedRuntime, 12, 45);
    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "analysis", 46, "Running Robust Guarded comparison candidate");
    const robust = runEvidenceFix(imageResult.value, robustOptions, scopedRuntime, 46, 79);

    reportAutomationProgress(scopedRuntime, operation, "analysis", 80, "Hashing decoded source and candidate outputs");
    const settings = createRobustEvidenceSettingsSnapshot(classicOptions);
    const settingsSha256 = sha256Text(stableStringifyRobustEvidenceValue(settings));
    const sourceSha256 = sha256Image(imageResult.value);
    const classicSha256 = sha256Image(classic.image);
    const robustSha256 = sha256Image(robust.image);
    const assignmentIndex = Number.isSafeInteger(request.assignmentIndex) ? Math.max(0, request.assignmentIndex ?? 0) : 0;
    const assignment = createRobustEvidenceAssignment(assignmentIndex);
    const createdAt = new Date().toISOString();
    const fallback = robust.reconstruction?.usedStrategy === "classic" || robust.grid.diagnostics?.selection?.decision === "fallback";
    const record = createRobustEvidenceRecord({
      recordId: `record:${randomUUID()}`,
      participantId: request.participantId ?? "participant:phase8-dry-run",
      createdAt,
      proceduralDryRun: true,
      app: {
        version: PIXELAID_VERSION,
        surface: request.surface ?? "automation",
        platform: request.platform ?? process.platform
      },
      source: {
        sha256: sourceSha256,
        width: imageResult.value.width,
        height: imageResult.value.height,
        assetType: classicOptions.assetType,
        collectionId: request.collectionId,
        sharingPermission: request.sharingPermission ?? "none"
      },
      comparison: {
        settingsSha256,
        settings,
        assignmentToken: `assignment:${randomUUID()}`,
        assignment,
        outputsIdentical: classicSha256 === robustSha256,
        classic: createRobustEvidenceCandidate(classic, "classic", classicSha256, settingsSha256),
        robust: createRobustEvidenceCandidate(robust, "robust", robustSha256, settingsSha256)
      },
      review: {
        preference: "tie",
        ratings: {
          candidateA: { geometry: "unsure", severity: "none", manualOverride: "not-needed", failureClasses: [] },
          candidateB: { geometry: "unsure", severity: "none", manualOverride: "not-needed", failureClasses: [] }
        },
        fallbackAppropriate: fallback ? "unsure" : "not-applicable",
        notes: "Procedural dry run only; no human quality judgment was recorded.",
        completedAt: createdAt
      },
      validation: { eligible: true, settingsMatch, valid: true, exclusionReasons: [] }
    });

    assertAutomationNotCancelled(scopedRuntime);
    reportAutomationProgress(scopedRuntime, operation, "output-write", 86, "Writing local comparison candidates");
    const classicWrite = await encodePngFile(classic.image, classicPath);
    if (!classicWrite.ok) return classicWrite;
    writtenPaths.push(classicPath);
    const robustWrite = await encodePngFile(robust.image, robustPath);
    if (!robustWrite.ok) {
      await cleanup(writtenPaths);
      return robustWrite;
    }
    writtenPaths.push(robustPath);
    const recordWrite = await writeJsonOutput(recordPath, record, { overwrite: true });
    if (!recordWrite.ok) {
      await cleanup(writtenPaths);
      return recordWrite;
    }
    writtenPaths.push(recordPath);

    const files: AutomationFileRecord[] = [
      fileRecord("image", classicPath, outDir),
      fileRecord("image", robustPath, outDir),
      fileRecord("json", recordPath, outDir)
    ];
    const warnings = [
      "Procedural dry-run records are excluded from Robust Preview promotion decisions.",
      ...(fallback ? ["Robust Guarded selected the Classic fallback for this input."] : []),
      ...(classicSha256 === robustSha256 ? ["Classic and Robust produced identical decoded output pixels."] : [])
    ];
    reportAutomationProgress(scopedRuntime, operation, "complete", 100, "Robust comparison dry run complete");
    return automationOk({ record, files, warnings }, warnings);
  } catch (error) {
    const cancelled = cancellationFailure(error, scopedRuntime, operation);
    if (cancelled) {
      await cleanup(writtenPaths);
      return cancelled;
    }
    throw error;
  }
}

function runEvidenceFix(
  image: RGBAImage,
  options: Parameters<typeof fixImage>[1],
  runtime: AutomationRuntimeOptions | undefined,
  startPercent: number,
  endPercent: number
): PixelFixResult {
  const startedAt = performance.now();
  const result = fixImage(image, options, toFixRuntime(runtime, "robust_evidence_dry_run", startPercent, endPercent));
  return {
    ...result,
    metrics: { ...result.metrics, durationMs: Math.max(0, Number((performance.now() - startedAt).toFixed(2))) }
  };
}

function sha256Image(image: RGBAImage): string {
  return createHash("sha256").update(createRobustEvidenceImageHashBytes(image)).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fileRecord(kind: AutomationFileRecord["kind"], filePath: string, baseDir: string): AutomationFileRecord {
  return { kind, path: filePath, relativePath: relativeToDirectory(baseDir, filePath) };
}

async function cleanup(filePaths: readonly string[]): Promise<void> {
  await Promise.all(filePaths.map((filePath) => rm(filePath, { force: true }).catch(() => undefined)));
}
