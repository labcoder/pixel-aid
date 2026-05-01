import { describe, expect, test } from "vitest";
import type { RGBAImage } from "@pixelaid/shared";
import { createImage, writePixel } from "./image";
import { analyzeTilesetSeams } from "./tileDiagnostics";

function fillRect(
  image: RGBAImage,
  startX: number,
  startY: number,
  width: number,
  height: number,
  color: readonly [number, number, number, number]
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(image, x, y, color[0], color[1], color[2], color[3]);
    }
  }
}

describe("tileset seam diagnostics", () => {
  test("derives sheet geometry and reports clean adjacent seams", () => {
    const image = createImage(4, 4, [40, 80, 120, 255]);

    const diagnostics = analyzeTilesetSeams(image, {
      tileWidth: 2,
      tileHeight: 2
    });

    expect(diagnostics).toMatchObject({
      tileWidth: 2,
      tileHeight: 2,
      rows: 2,
      columns: 2,
      checkedSeams: 4,
      averageEdgeDelta: 0,
      maxEdgeDelta: 0,
      seamRiskScore: 0,
      lightingRiskScore: 0,
      issues: []
    });
  });

  test("flags high RGB differences between neighboring tile edges", () => {
    const image = createImage(4, 2);
    fillRect(image, 0, 0, 2, 2, [0, 0, 0, 255]);
    fillRect(image, 2, 0, 2, 2, [255, 255, 255, 255]);

    const diagnostics = analyzeTilesetSeams(image, {
      tileWidth: 2,
      tileHeight: 2,
      mismatchThreshold: 0.2
    });

    expect(diagnostics.checkedSeams).toBe(1);
    expect(diagnostics.averageEdgeDelta).toBeCloseTo(1, 6);
    expect(diagnostics.maxEdgeDelta).toBeCloseTo(1, 6);
    expect(diagnostics.seamRiskScore).toBeCloseTo(1, 6);
    expect(diagnostics.issues).toContainEqual(
      expect.objectContaining({
        code: "edge-mismatch",
        severity: "error",
        edge: "right-left",
        tileA: { row: 0, column: 0 },
        tileB: { row: 0, column: 1 },
        score: expect.closeTo(1, 6)
      })
    );
    expect(diagnostics.repairSuggestions).toContainEqual(
      expect.objectContaining({
        strategy: "manualRepaint",
        previewOnly: true,
        issueCode: "edge-mismatch",
        edge: "right-left",
        tileA: { row: 0, column: 0 },
        tileB: { row: 0, column: 1 }
      })
    );
  });

  test("flags lighting discontinuity independently from edge mismatch threshold", () => {
    const image = createImage(4, 2);
    fillRect(image, 0, 0, 2, 2, [80, 80, 80, 255]);
    fillRect(image, 2, 0, 2, 2, [120, 120, 120, 255]);

    const diagnostics = analyzeTilesetSeams(image, {
      tileWidth: 2,
      tileHeight: 2,
      mismatchThreshold: 0.5,
      lightingThreshold: 0.1
    });

    expect(diagnostics.issues).toHaveLength(1);
    expect(diagnostics.issues[0]).toMatchObject({
      code: "lighting-discontinuity",
      severity: "warning",
      edge: "right-left"
    });
    expect(diagnostics.repairSuggestions[0]).toMatchObject({
      strategy: "lightingHarmonization",
      message: expect.stringContaining("brightness")
    });
    expect(diagnostics.lightingRiskScore).toBeCloseTo(40 / 255, 6);
  });

  test("treats alpha deltas as seam risk when only one edge pixel is visible", () => {
    const image = createImage(4, 2);
    fillRect(image, 0, 0, 2, 2, [200, 40, 40, 255]);
    fillRect(image, 2, 0, 2, 2, [200, 40, 40, 0]);

    const diagnostics = analyzeTilesetSeams(image, {
      tileWidth: 2,
      tileHeight: 2,
      mismatchThreshold: 0.5
    });

    expect(diagnostics.averageEdgeDelta).toBeCloseTo(1, 6);
    expect(diagnostics.issues[0]).toMatchObject({
      code: "edge-mismatch",
      severity: "error"
    });
  });

  test("honors margin spacing and max issue limits", () => {
    const image = createImage(8, 3, [0, 0, 0, 255]);
    fillRect(image, 1, 0, 2, 2, [0, 0, 0, 255]);
    fillRect(image, 4, 0, 2, 2, [255, 255, 255, 255]);

    const diagnostics = analyzeTilesetSeams(image, {
      tileWidth: 2,
      tileHeight: 2,
      margin: 1,
      spacing: 1,
      mismatchThreshold: 0.2,
      maxIssues: 1
    });

    expect(diagnostics).toMatchObject({
      rows: 1,
      columns: 2,
      checkedSeams: 1
    });
    expect(diagnostics.issues).toHaveLength(1);
  });
});
