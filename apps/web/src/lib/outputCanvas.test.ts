import type { OutputPackagingOptions } from "@pixelaid/shared";
import { describe, expect, test } from "vitest";
import { applyOutputCanvasChoice, getOutputCanvasChoice, getOutputCanvasPrediction } from "./outputCanvas";

const legacyPreservedContent: OutputPackagingOptions = {
  canvasMode: "content",
  framing: "preserveComposition",
  scale: "native",
  anchor: "center"
};

describe("output canvas choices", () => {
  test("treats the legacy content plus preserved-composition state as Keep composition", () => {
    expect(getOutputCanvasChoice(legacyPreservedContent)).toBe("composition");
    expect(
      getOutputCanvasPrediction({
        packaging: legacyPreservedContent,
        nativeSizeMode: "manual",
        targetWidth: 1254,
        targetHeight: 1254
      })
    ).toEqual({
      choice: "composition",
      size: "1254x1254",
      detail: "Keep composition · native pixels"
    });
  });

  test("maps explicit choices to non-contradictory packaging options", () => {
    expect(applyOutputCanvasChoice(legacyPreservedContent, "composition", { width: 96, height: 80 })).toMatchObject({
      canvasMode: "native",
      framing: "preserveComposition",
      scale: "native",
      anchor: "center"
    });
    expect(applyOutputCanvasChoice(legacyPreservedContent, "subject", { width: 96, height: 80 })).toMatchObject({
      canvasMode: "content",
      framing: "packSubject",
      scale: "native",
      anchor: "topLeft"
    });
    expect(applyOutputCanvasChoice(legacyPreservedContent, "custom", { width: 96, height: 80 })).toMatchObject({
      canvasMode: "exact",
      width: 96,
      height: 80
    });
  });

  test("describes subject and custom outputs before Fix", () => {
    const subject = applyOutputCanvasChoice(legacyPreservedContent, "subject", { width: 96, height: 80 });
    expect(
      getOutputCanvasPrediction({
        packaging: subject,
        nativeSizeMode: "manual",
        targetWidth: 96,
        targetHeight: 80
      })
    ).toMatchObject({ size: "Subject bounds after Fix", detail: "Trim to subject · native pixels" });

    const custom = {
      ...applyOutputCanvasChoice(legacyPreservedContent, "custom", { width: 96, height: 80 }),
      width: 128,
      height: 128,
      scale: "integerFit" as const
    };
    expect(
      getOutputCanvasPrediction({
        packaging: custom,
        nativeSizeMode: "manual",
        targetWidth: 96,
        targetHeight: 80
      })
    ).toMatchObject({ size: "128x128", detail: "Custom canvas · integer fit" });
  });
});
