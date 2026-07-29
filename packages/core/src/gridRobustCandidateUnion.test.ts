import {
  nativeSizeInferenceFixtures,
  step1gNativeSizeCorpus
} from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import {
  buildRobustAxisCandidateUnion,
  pairProposerSupport
} from "./gridRobustCandidateUnion";
import { inferRobustAxisHypotheses } from "./gridRobustAxis";
import { buildRobustGridEvidence } from "./gridRobustEvidence";
import { proposeIndependentAxisHypotheses } from "./gridRobustProposers";

describe("robust provenance-aware candidate union", () => {
  test.each(nativeSizeInferenceFixtures)(
    "$id retains the authored axes within a bounded deterministic union",
    (fixture) => {
      const evidence = buildRobustGridEvidence(
        fixture.createImage(),
        { maxPeriod: 32 }
      );
      const firstX = unionFor(evidence.axisX);
      const secondX = unionFor(evidence.axisX);
      const y = unionFor(evidence.axisY);

      expect(firstX).toEqual(secondX);
      expect(firstX.length).toBeLessThanOrEqual(20);
      expect(y.length).toBeLessThanOrEqual(20);
      expect(
        firstX.map((item) => item.hypothesis.cellCount)
      ).toContain(fixture.nativeWidth);
      expect(
        y.map((item) => item.hypothesis.cellCount)
      ).toContain(fixture.nativeHeight);
    }
  );

  test("independent proposals restore the missing color-field axis to the union", () => {
    const fixture = step1gNativeSizeCorpus.find(
      (item) => item.failureClass === "color-field"
    )!;
    const evidence = buildRobustGridEvidence(
      fixture.createPreCodecImage(),
      { maxPeriod: 32 }
    );
    const integratedY = inferRobustAxisHypotheses(
      evidence.axisY,
      { maxPeriod: 32, maxCandidates: 12 }
    );
    const unionY = buildRobustAxisCandidateUnion(
      evidence.axisY,
      integratedY,
      proposeIndependentAxisHypotheses(evidence.axisY, {
        maxPeriod: 32,
        maxCandidates: 10
      })
    );

    expect(
      integratedY.map((item) => item.cellCount)
    ).not.toContain(fixture.nativeHeight);
    const restored = unionY.find(
      (item) =>
        item.hypothesis.cellCount === fixture.nativeHeight
    );
    expect(restored).toBeDefined();
    const independentProposers = restored!.proposals
      .map((item) => item.proposer)
      .filter((proposer) => proposer !== "integrated");
    expect(independentProposers.length).toBeGreaterThan(0);
  });

  test("pair support counts only proposers present on both axes", () => {
    const fixture = nativeSizeInferenceFixtures[0]!;
    const evidence = buildRobustGridEvidence(
      fixture.createImage(),
      { maxPeriod: 32 }
    );
    const x = unionFor(evidence.axisX).find(
      (item) =>
        item.hypothesis.cellCount === fixture.nativeWidth
    )!;
    const y = unionFor(evidence.axisY).find(
      (item) =>
        item.hypothesis.cellCount === fixture.nativeHeight
    )!;
    const support = pairProposerSupport(x, y);

    expect(support.proposers).toContain("integrated");
    expect(support.independentSupport).toBeGreaterThanOrEqual(1);
    expect(support.independentSupport).toBeLessThanOrEqual(4);
  });
});

function unionFor(
  evidence: ReturnType<typeof buildRobustGridEvidence>["axisX"]
) {
  return buildRobustAxisCandidateUnion(
    evidence,
    inferRobustAxisHypotheses(evidence, {
      maxPeriod: 32,
      maxCandidates: 12
    }),
    proposeIndependentAxisHypotheses(evidence, {
      maxPeriod: 32,
      maxCandidates: 10
    })
  );
}
