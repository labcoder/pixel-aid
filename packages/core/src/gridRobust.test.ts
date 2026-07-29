import { createSingleSpriteCleanupFixture, nativeSizeInferenceFixtures } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import { detectGridCandidates } from "./grid";

describe("robust grid candidates", () => {
  test.each(nativeSizeInferenceFixtures)("$id ranks the authored native dimensions first", (fixture) => {
    const candidates = detectGridCandidates(fixture.createImage(), {
      strategy: "robust",
      maxScale: 32,
      sampling: "full",
      cropToBounds: false
    });
    const [candidate] = candidates;

    expect(candidate).toBeDefined();
    expect(candidate!.outputWidth).toBe(fixture.nativeWidth);
    expect(candidate!.outputHeight).toBe(fixture.nativeHeight);
    expect(Math.abs(candidate!.scaleX - fixture.expectedScaleX)).toBeLessThanOrEqual(1 / fixture.nativeWidth);
    expect(Math.abs(candidate!.scaleY - fixture.expectedScaleY)).toBeLessThanOrEqual(1 / fixture.nativeHeight);
    expect(candidate!.sourceRect).toBeUndefined();
    expect(candidate!.diagnostics?.robust).toMatchObject({
      strategy: "robust",
      fullCanvasCellCount: {
        columns: fixture.nativeWidth,
        rows: fixture.nativeHeight
      },
      cropPolicy: "full-canvas"
    });
  });

  test("returns deterministic bounded diagnostics and at most five candidates", () => {
    const source = nativeSizeInferenceFixtures[0]!.createImage();
    const first = detectGridCandidates(source, { strategy: "robust", cropToBounds: false });
    const second = detectGridCandidates(source, { strategy: "robust", cropToBounds: false });

    expect(first).toEqual(second);
    expect(first.length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(first).length).toBeLessThan(20_000);
    expect(first[0]!.diagnostics?.robust?.reconstructionRerank).toMatchObject({
      decisionBasis: "reconstruction-total",
      switchThreshold: 0.03
    });
    expect(first[0]!.diagnostics?.robust?.provenance).toMatchObject({
      axisX: {
        selectedCellCount: 16,
      },
      axisY: {
        selectedCellCount: 16,
      },
      pairProposers: [
        "integrated",
        "autocorrelation",
        "phase-spectrum",
        "run-spacing"
      ],
      independentSupport: 4,
      ambiguityPreserved: false
    });
    expect(
      first[0]!.diagnostics?.robust?.provenance.axisX.proposals
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposer: "integrated",
          independenceGroup: "integrated-profile",
          cellCount: 16,
          rank: 0
        }),
        expect.objectContaining({
          proposer: "autocorrelation",
          independenceGroup: "autocorrelation",
          cellCount: 16
        }),
        expect.objectContaining({
          proposer: "run-spacing",
          independenceGroup: "run-spacing",
          cellCount: 16
        }),
        expect.objectContaining({
          proposer: "phase-spectrum",
          independenceGroup: "phase-spectrum",
          cellCount: 16
        })
      ])
    );
    expect(
      first[0]!.diagnostics?.robust?.reconstructionRerank?.hypotheses
    ).toHaveLength(3);
  });

  test("retains the existing foreground-bounds crop policy unless explicitly disabled", () => {
    const fixture = createSingleSpriteCleanupFixture();
    const [cropped] = detectGridCandidates(fixture.image, {
      strategy: "robust",
      maxScale: 16,
      sampling: "sampled"
    });
    const [fullCanvas] = detectGridCandidates(fixture.image, {
      strategy: "robust",
      maxScale: 16,
      sampling: "sampled",
      cropToBounds: false
    });

    expect(cropped!.sourceRect).toEqual(fixture.expected.foregroundBounds);
    expect(cropped!.diagnostics?.robust?.cropPolicy).toBe("bounds");
    expect(fullCanvas!.sourceRect).toBeUndefined();
    expect(fullCanvas!.diagnostics?.robust?.cropPolicy).toBe("full-canvas");
  });
});
