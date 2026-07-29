import {
  nativeSizeInferenceFixtures,
  step1gNativeSizeCorpus,
  step1kNativeSizeCorpus,
  step1mNativeSizeCorpus
} from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { buildRobustGridEvidence } from "./gridRobustEvidence";
import {
  proposeAutocorrelationAxisHypotheses,
  proposeBlurBandAxisHypotheses,
  proposeIndependentAxisHypotheses,
  proposePhaseSpectrumAxisHypotheses,
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
      expect(firstX.length).toBeGreaterThanOrEqual(30);
      expect(firstX.length).toBeLessThanOrEqual(40);
      expect(
        firstX.filter((item) => item.proposer === "autocorrelation")
      ).toHaveLength(10);
      expect(
        firstX.filter((item) => item.proposer === "run-spacing")
      ).toHaveLength(10);
      expect(
        firstX.filter((item) => item.proposer === "phase-spectrum")
      ).toHaveLength(10);
      expect([0, 10]).toContain(
        firstX.filter(
          (item) => item.proposer === "blur-band"
        ).length
      );
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

  test.each(
    step1mNativeSizeCorpus.filter(
      (fixture) => fixture.failureClass === "grid-soften"
    )
  )(
    "$id exposes authored axes through centered blur bands",
    (fixture) => {
      const evidence = buildRobustGridEvidence(
        fixture.createInputImage(),
        { maxPeriod: 32, sampleStep: 1 }
      );
      const x = proposeBlurBandAxisHypotheses(
        evidence.axisX,
        { maxPeriod: 32, maxCandidates: 16 }
      );
      const y = proposeBlurBandAxisHypotheses(
        evidence.axisY,
        { maxPeriod: 32, maxCandidates: 16 }
      );

      expect(x.map((item) => item.cellCount)).toContain(
        fixture.nativeWidth
      );
      expect(y.map((item) => item.cellCount)).toContain(
        fixture.nativeHeight
      );
    }
  );

  test("does not invent blur-band proposals for a crisp grid", () => {
    const fixture = step1mNativeSizeCorpus.find(
      (item) =>
        item.id === "step1m-control-crisp-grid-26x22"
    )!;
    const evidence = buildRobustGridEvidence(
      fixture.createInputImage(),
      { maxPeriod: 32, sampleStep: 1 }
    );

    expect(
      proposeBlurBandAxisHypotheses(evidence.axisX)
    ).toEqual([]);
    expect(
      proposeBlurBandAxisHypotheses(evidence.axisY)
    ).toEqual([]);
  });

  test("the four proposers expose separate independence groups", () => {
    const fixture = step1mNativeSizeCorpus.find(
      (item) =>
        item.id === "step1m-grid-soften-emblem-24x24"
    )!;
    const evidence = buildRobustGridEvidence(
      fixture.createInputImage(),
      { maxPeriod: 32 }
    );
    const autocorrelation = proposeAutocorrelationAxisHypotheses(
      evidence.axisX
    );
    const phaseSpectrum = proposePhaseSpectrumAxisHypotheses(
      evidence.axisX
    );
    const blurBands = proposeBlurBandAxisHypotheses(
      evidence.axisX
    );
    const runs = proposeRunSpacingAxisHypotheses(evidence.axisX);

    expect(
      new Set(
        [
          ...autocorrelation,
          ...blurBands,
          ...phaseSpectrum,
          ...runs
        ].map(
          (item) => item.independenceGroup
        )
      )
    ).toEqual(
      new Set([
        "autocorrelation",
        "blur-band-center",
        "phase-spectrum",
        "run-spacing"
      ])
    );
  });

  test.each([
    "step1k-sparse-harmonic-36x28",
    "step1k-anisotropic-portrait-22x38",
    "step1k-anisotropic-banner-48x20"
  ])("%s retains the authored axes through phase concentration", (id) => {
    const fixture = step1kNativeSizeCorpus.find(
      (item) => item.id === id
    )!;
    const evidence = buildRobustGridEvidence(
      fixture.createInputImage(),
      { maxPeriod: 32, sampleStep: 1 }
    );
    const x = proposePhaseSpectrumAxisHypotheses(
      evidence.axisX,
      { maxPeriod: 32, maxCandidates: 16 }
    );
    const y = proposePhaseSpectrumAxisHypotheses(
      evidence.axisY,
      { maxPeriod: 32, maxCandidates: 16 }
    );

    expect(x.map((item) => item.cellCount)).toContain(
      fixture.nativeWidth
    );
    expect(y.map((item) => item.cellCount)).toContain(
      fixture.nativeHeight
    );
  });
});
