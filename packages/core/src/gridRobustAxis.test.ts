import { nativeSizeInferenceFixtures } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { inferRobustAxisHypotheses } from "./gridRobustAxis";
import { buildRobustGridEvidence } from "./gridRobustEvidence";

describe("robust axis inference", () => {
  test.each(nativeSizeInferenceFixtures)("$id retains the authored cell count among ranked axis hypotheses", (fixture) => {
    const evidence = buildRobustGridEvidence(fixture.createImage(), { maxPeriod: 32 });
    const x = inferRobustAxisHypotheses(evidence.axisX, { maxPeriod: 32 });
    const y = inferRobustAxisHypotheses(evidence.axisY, { maxPeriod: 32 });

    expect(x.map((item) => item.cellCount)).toContain(fixture.nativeWidth);
    expect(y.map((item) => item.cellCount)).toContain(fixture.nativeHeight);
  });

  test("ranks the fundamental period ahead of its divisor harmonic", () => {
    const fixture = nativeSizeInferenceFixtures.find((item) => item.failureClass === "harmonic")!;
    const evidence = buildRobustGridEvidence(fixture.createImage(), { maxPeriod: 32 });
    const x = inferRobustAxisHypotheses(evidence.axisX, { maxPeriod: 32 });
    const fundamentalIndex = x.findIndex((item) => item.cellCount === fixture.nativeWidth);
    const divisorIndex = x.findIndex((item) => item.cellCount === fixture.nativeWidth * 2);

    expect(fundamentalIndex).toBeGreaterThanOrEqual(0);
    expect(divisorIndex).toBeGreaterThanOrEqual(0);
    expect(fundamentalIndex).toBeLessThan(divisorIndex);
  });

  test("keeps non-square axis periods independent", () => {
    const fixture = nativeSizeInferenceFixtures.find((item) => item.failureClass === "non-square")!;
    const evidence = buildRobustGridEvidence(fixture.createImage(), { maxPeriod: 32 });
    const [x] = inferRobustAxisHypotheses(evidence.axisX, { maxPeriod: 32 });
    const [y] = inferRobustAxisHypotheses(evidence.axisY, { maxPeriod: 32 });

    expect(x!.period).not.toBeCloseTo(y!.period, 1);
  });
});
