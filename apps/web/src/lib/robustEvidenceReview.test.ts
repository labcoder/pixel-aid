import { describe, expect, test } from "vitest";
import type { FixOptions, RGBAImage } from "@pixelaid/shared";
import {
  comparisonSettingsMatch,
  createBlindAssignment,
  createEvidenceFixOptions,
  getOrCreateEvidenceParticipantId,
  hashEvidenceImage,
  resolveBlindCandidate,
  takeNextBlindAssignment
} from "./robustEvidenceReview";

const options: FixOptions = {
  mode: "single",
  assetType: "sprite",
  reconstruction: { sizeMode: "auto" },
  packaging: { canvasMode: "exact", width: 128, height: 128, framing: "preserveComposition", scale: "native", anchor: "center" },
  maxColors: 24,
  grid: { detect: "auto", autoStrategy: "classic", cropToBounds: true },
  downscale: "adaptive",
  alpha: "preserve",
  cleanup: { removeOrphans: false, jaggyCleanup: false, preserveSinglePixelDetails: true }
};

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

describe("Robust evidence review helpers", () => {
  test("changes only the reconstruction strategy and Guarded safety", () => {
    const classic = createEvidenceFixOptions(options, "classic");
    const robust = createEvidenceFixOptions(options, "robust");

    expect(classic.grid).toMatchObject({ detect: "auto", autoStrategy: "classic", robustSafety: "guarded" });
    expect(robust.grid).toMatchObject({ detect: "auto", autoStrategy: "robust", robustSafety: "guarded" });
    expect(comparisonSettingsMatch(classic, robust)).toBe(true);
  });

  test("balances and resolves concealed assignments deterministically", () => {
    const even = createBlindAssignment("assignment:even", 0);
    const odd = createBlindAssignment("assignment:odd", 1);
    expect(even.assignment).toEqual({ candidateA: "classic", candidateB: "robust" });
    expect(odd.assignment).toEqual({ candidateA: "robust", candidateB: "classic" });
    expect(resolveBlindCandidate("candidateA", odd.assignment, { classic: "C", robust: "R" })).toBe("R");
  });

  test("persists an opaque participant ID and alternating assignment index", () => {
    const storage = memoryStorage();
    let uuidIndex = 0;
    const uuid = () => `00000000-0000-4000-8000-${String(uuidIndex++).padStart(12, "0")}`;
    const firstParticipant = getOrCreateEvidenceParticipantId(storage, uuid);
    expect(getOrCreateEvidenceParticipantId(storage, uuid)).toBe(firstParticipant);
    expect(takeNextBlindAssignment(storage, uuid).assignment.candidateA).toBe("classic");
    expect(takeNextBlindAssignment(storage, uuid).assignment.candidateA).toBe("robust");
  });

  test("hashes decoded dimensions and RGBA bytes", async () => {
    const image: RGBAImage = { width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) };
    await expect(hashEvidenceImage(image)).resolves.toMatch(/^[a-f0-9]{64}$/u);
    await expect(hashEvidenceImage({ ...image, width: 2 })).resolves.not.toBe(await hashEvidenceImage(image));
  });
});
