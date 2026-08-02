import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  createRobustEvidenceImageHashBytes,
  validateRobustEvidenceRecord,
  type RGBAImage
} from "@pixelaid/shared";
import { decodePngFile, encodePngFile } from "./imageIo";
import { createRobustEvidenceDryRun } from "./robustEvidence";

describe("Robust evidence automation", () => {
  test("writes a procedural comparison with canonical decoded-pixel hashes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pixelaid-evidence-"));
    const inputPath = path.join(dir, "private-source-name.png");
    const outDir = path.join(dir, "evidence");
    try {
      await encodePngFile(createPseudoPixelFixture(), inputPath);
      const created = await createRobustEvidenceDryRun({
        inputPath,
        outDir,
        collectionId: "collection:first-party",
        participantId: "participant:automation-test",
        assignmentIndex: 1,
        sharingPermission: "public",
        options: {
          assetType: "sprite",
          reconstruction: { sizeMode: "auto" },
          packaging: { canvasMode: "native", framing: "preserveComposition", scale: "native", anchor: "center" },
          maxColors: 16,
          grid: { detect: "auto", cropToBounds: true }
        }
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.value.record).toMatchObject({
        proceduralDryRun: true,
        app: { surface: "automation" },
        comparison: { assignment: { candidateA: "robust", candidateB: "classic" } },
        validation: { eligible: true, settingsMatch: true, valid: true }
      });
      expect(validateRobustEvidenceRecord(created.value.record)).toEqual({ valid: true, errors: [] });
      expect(JSON.stringify(created.value.record)).not.toContain("private-source-name");

      const classic = await decodePngFile(path.join(outDir, "classic.png"));
      const robust = await decodePngFile(path.join(outDir, "robust.png"));
      expect(classic.ok).toBe(true);
      expect(robust.ok).toBe(true);
      if (!classic.ok || !robust.ok) return;
      expect(created.value.record.comparison.classic.outputSha256).toBe(sha256Image(classic.value));
      expect(created.value.record.comparison.robust.outputSha256).toBe(sha256Image(robust.value));

      const stored = JSON.parse(await readFile(path.join(outDir, "evidence.json"), "utf8")) as unknown;
      expect(validateRobustEvidenceRecord(stored)).toEqual({ valid: true, errors: [] });
      expect(created.value.files.map((file) => file.relativePath)).toEqual(["classic.png", "robust.png", "evidence.json"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function createPseudoPixelFixture(): RGBAImage {
  const nativeWidth = 12;
  const nativeHeight = 10;
  const scale = 4;
  const width = nativeWidth * scale;
  const height = nativeHeight * scale;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nativeX = Math.floor(x / scale);
      const nativeY = Math.floor(y / scale);
      const inside = nativeX >= 2 && nativeX <= 9 && nativeY >= 1 && nativeY <= 8;
      const offset = (y * width + x) * 4;
      data[offset] = inside ? (nativeX + nativeY) % 3 === 0 ? 40 : 54 : 14;
      data[offset + 1] = inside ? 180 : 18;
      data[offset + 2] = inside ? 138 : 22;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

function sha256Image(image: RGBAImage): string {
  return createHash("sha256").update(createRobustEvidenceImageHashBytes(image)).digest("hex");
}
