import { createGoldenSignature, nativeSizeInferenceFixtures } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { buildRobustGridEvidence } from "./gridRobustEvidence";

describe("robust grid evidence", () => {
  test.each(nativeSizeInferenceFixtures)("$id builds deterministic independent axis evidence", (fixture) => {
    const source = fixture.createImage();
    const before = createGoldenSignature(source);
    const first = buildRobustGridEvidence(source, { maxPeriod: 32 });
    const second = buildRobustGridEvidence(source, { maxPeriod: 32 });

    expect(first).toEqual(second);
    expect(createGoldenSignature(source)).toEqual(before);
    expect(first.axisX.length).toBe(source.width);
    expect(first.axisY.length).toBe(source.height);
    expect(first.axisX.transitionTotal).toBeGreaterThan(0);
    expect(first.axisY.transitionTotal).toBeGreaterThan(0);
    expect(first.axisX.curvatureTotal).toBeGreaterThan(0);
    expect(first.axisY.curvatureTotal).toBeGreaterThan(0);
    expect(sum(first.axisX.runHistogram)).toBeGreaterThan(0);
    expect(sum(first.axisY.runHistogram)).toBeGreaterThan(0);
  });

  test("sampled evidence keeps complete coordinate profiles while reducing perpendicular scans", () => {
    const source = nativeSizeInferenceFixtures[0]!.createImage();
    const full = buildRobustGridEvidence(source, { maxPeriod: 32, sampleStep: 1 });
    const sampled = buildRobustGridEvidence(source, { maxPeriod: 32, sampleStep: 4 });

    expect(sampled.axisX.transitionProfile).toHaveLength(full.axisX.transitionProfile.length);
    expect(sampled.axisY.transitionProfile).toHaveLength(full.axisY.transitionProfile.length);
    expect(sampled.axisX.runSampleCount).toBeLessThan(full.axisX.runSampleCount);
    expect(sampled.axisY.runSampleCount).toBeLessThan(full.axisY.runSampleCount);
  });

  test("activates centered ramp evidence for softened boundaries but not crisp blocks", () => {
    const crisp = nativeSizeInferenceFixtures.find(
      (fixture) => fixture.id === "harmonic-clean-nearest"
    )!;
    const softened = nativeSizeInferenceFixtures.find(
      (fixture) => fixture.id === "soft-bilinear"
    )!;
    const crispEvidence = buildRobustGridEvidence(crisp.createImage(), {
      maxPeriod: 32
    });
    const softenedEvidence = buildRobustGridEvidence(softened.createImage(), {
      maxPeriod: 32
    });

    expect(crispEvidence.axisX.broadTransitionRatio).toBe(0);
    expect(crispEvidence.axisY.broadTransitionRatio).toBe(0);
    expect(crispEvidence.axisX.rampTotal).toBe(0);
    expect(crispEvidence.axisY.rampTotal).toBe(0);
    expect(softenedEvidence.axisX.broadTransitionRatio).toBeGreaterThan(0.08);
    expect(softenedEvidence.axisY.broadTransitionRatio).toBeGreaterThan(0.08);
    expect(softenedEvidence.axisX.rampTotal).toBeGreaterThan(0);
    expect(softenedEvidence.axisY.rampTotal).toBeGreaterThan(0);
  });
});

function sum(values: Float64Array): number {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    total += values[index]!;
  }
  return total;
}
