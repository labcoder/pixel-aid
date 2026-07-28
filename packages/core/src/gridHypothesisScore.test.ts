import {
  createGoldenSignature,
  nativeSizeInferenceFixtures
} from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { detectGridCandidates } from "./grid";
import { scoreGridHypotheses } from "./gridHypothesisScore";

describe("grid hypothesis reconstruction scoring", () => {
  test("scores at most three provisional block-aware reconstructions deterministically", () => {
    const source = nativeSizeInferenceFixtures.find(
      (fixture) => fixture.id === "soft-bilinear"
    )!.createImage();
    const candidates = detectGridCandidates(source, {
      strategy: "robust",
      cropToBounds: false
    });
    const before = createGoldenSignature(source);
    const first = scoreGridHypotheses(source, candidates);
    const second = scoreGridHypotheses(source, candidates);

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(createGoldenSignature(source)).toEqual(before);
    for (const score of first) {
      expect(score.totalScore).toBeGreaterThanOrEqual(0);
      expect(score.totalScore).toBeLessThanOrEqual(1);
      expect(score.sampledCells).toBeGreaterThan(0);
      expect(score.sampledCells).toBeLessThanOrEqual(4_096);
      expect(score.sampledPixels).toBeGreaterThan(0);
    }
  });

  test("prefers the authored soft-grid reconstruction over nearby detector alternatives", () => {
    const fixture = nativeSizeInferenceFixtures.find(
      (item) => item.id === "soft-bilinear"
    )!;
    const source = fixture.createImage();
    const detected = detectGridCandidates(source, {
      strategy: "robust",
      cropToBounds: false
    });
    const correct = detected.find(
      (candidate) =>
        candidate.outputWidth === fixture.nativeWidth &&
        candidate.outputHeight === fixture.nativeHeight
    )!;
    const alternatives = detected.filter((candidate) => candidate !== correct);
    const scored = scoreGridHypotheses(
      source,
      [alternatives[0]!, correct, alternatives[1]!],
      { maxHypotheses: 3 }
    );

    expect(scored[0]!.candidate.outputWidth).toBe(fixture.nativeWidth);
    expect(scored[0]!.candidate.outputHeight).toBe(fixture.nativeHeight);
  });
});
