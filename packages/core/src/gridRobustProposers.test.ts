import {
  nativeSizeInferenceFixtures,
  step1gNativeSizeCorpus
} from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { buildRobustGridEvidence } from "./gridRobustEvidence";
import {
  proposeAutocorrelationAxisHypotheses,
  proposeIndependentAxisHypotheses,
  proposeRunSpacingAxisHypotheses
} from "./gridRobustProposers";

describe("robust independent axis proposers", () => {
  test.each(nativeSizeInferenceFixtures)(
    "$id returns deterministic bounded proposals",
    (fixture) => {
      const evidence = buildRobustGridEvidence(
        fixture.createImage(),
        { maxPeriod: 32 }
      );
      const firstX = proposeIndependentAxisHypotheses(
        evidence.axisX,
        { maxPeriod: 32, maxCandidates: 10 }
      );
      const secondX = proposeIndependentAxisHypotheses(
        evidence.axisX,
        { maxPeriod: 32, maxCandidates: 10 }
      );

      expect(firstX).toEqual(secondX);
      expect(firstX).toHaveLength(20);
      expect(
        firstX.filter((item) => item.proposer === "autocorrelation")
      ).toHaveLength(10);
      expect(
        firstX.filter((item) => item.proposer === "run-spacing")
      ).toHaveLength(10);
      for (const proposal of firstX) {
        expect(proposal.cellCount).toBeGreaterThan(0);
        expect(proposal.period).toBeGreaterThanOrEqual(1.5);
        expect(proposal.period).toBeLessThanOrEqual(32);
        expect(proposal.score).toBeGreaterThanOrEqual(0);
        expect(proposal.score).toBeLessThanOrEqual(1);
      }
    }
  );

  test("run spacing retains the clean harmonic fundamental", () => {
    const fixture = nativeSizeInferenceFixtures.find(
      (item) => item.id === "harmonic-clean-nearest"
    )!;
    const evidence = buildRobustGridEvidence(
      fixture.createImage(),
      { maxPeriod: 32 }
    );
    const x = proposeRunSpacingAxisHypotheses(
      evidence.axisX,
      { maxPeriod: 32, maxCandidates: 10 }
    );
    const y = proposeRunSpacingAxisHypotheses(
      evidence.axisY,
      { maxPeriod: 32, maxCandidates: 10 }
    );

    expect(x.map((item) => item.cellCount)).toContain(
      fixture.nativeWidth
    );
    expect(y.map((item) => item.cellCount)).toContain(
      fixture.nativeHeight
    );
  });

  test("autocorrelation supplies an authored axis missing from integrated color-field evidence", () => {
    const fixture = step1gNativeSizeCorpus.find(
      (item) => item.failureClass === "color-field"
    )!;
    const evidence = buildRobustGridEvidence(
      fixture.createPreCodecImage(),
      { maxPeriod: 32 }
    );
    const y = proposeAutocorrelationAxisHypotheses(
      evidence.axisY,
      { maxPeriod: 32, maxCandidates: 10 }
    );

    expect(y.map((item) => item.cellCount)).toContain(
      fixture.nativeHeight
    );
  });

  test("the two proposers expose separate independence groups", () => {
    const fixture = nativeSizeInferenceFixtures[0]!;
    const evidence = buildRobustGridEvidence(
      fixture.createImage(),
      { maxPeriod: 32 }
    );
    const autocorrelation = proposeAutocorrelationAxisHypotheses(
      evidence.axisX
    );
    const runs = proposeRunSpacingAxisHypotheses(evidence.axisX);

    expect(
      new Set(
        [...autocorrelation, ...runs].map(
          (item) => item.independenceGroup
        )
      )
    ).toEqual(
      new Set(["autocorrelation", "run-spacing"])
    );
  });
});
