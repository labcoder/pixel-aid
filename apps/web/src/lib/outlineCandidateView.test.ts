import { describe, expect, test } from "vitest";
import type { OutlineColorCandidate } from "@pixelaid/core";
import {
  createOutlineCandidateView,
  getManualSuspectOutlineSourceColors,
  hasManualSuspectOutlineSource
} from "./outlineCandidateView";

const candidate = (overrides: Partial<OutlineColorCandidate>): OutlineColorCandidate => ({
  color: "#101112",
  count: 8,
  outsideContact: 8,
  luma: 18,
  score: 12,
  ...overrides
});

describe("outline candidate view", () => {
  test("labels deliberate high-confidence candidates as repair-safe", () => {
    const view = createOutlineCandidateView(
      candidate({ color: "#f4f6ff", count: 18, classification: "deliberate", confidence: 0.91, repairSafeScore: 0.82 })
    );

    expect(view.kind).toBe("repair-safe");
    expect(view.label).toBe("Repair-safe");
    expect(view.className).toContain("outline-source-candidate-safe");
    expect(view.title).toContain("#f4f6ff (18 edge pixels)");
    expect(view.title).toContain("Repair-safe");
    expect(view.title).toContain("confidence 91%");
    expect(view.ariaLabel).toContain("repair-safe outline source #f4f6ff");
  });

  test("labels fringe-suspect candidates and includes fringe score", () => {
    const view = createOutlineCandidateView(
      candidate({ color: "#2f7b53", count: 11, isFringeSuspect: true, confidence: 0.88, fringeSuspectScore: 0.64 })
    );

    expect(view.kind).toBe("suspect-fringe");
    expect(view.label).toBe("Suspect fringe");
    expect(view.className).toContain("outline-source-candidate-suspect");
    expect(view.title).toContain("#2f7b53 (11 edge pixels)");
    expect(view.title).toContain("Suspect fringe");
    expect(view.title).toContain("confidence 88%");
    expect(view.title).toContain("fringe score 64%");
    expect(view.ariaLabel).toContain("suspect fringe outline source #2f7b53");
  });

  test("labels all other candidates as weak or partial", () => {
    const view = createOutlineCandidateView(candidate({ color: "#665544", count: 1, classification: "partial", confidence: 0.62 }));

    expect(view.kind).toBe("weak-or-partial");
    expect(view.label).toBe("Weak/partial");
    expect(view.className).toContain("outline-source-candidate-weak");
    expect(view.title).toContain("Weak/partial");
    expect(view.title).toContain("confidence 62%");
  });

  test("detects selected manual colors that match suspect fringe candidates", () => {
    const candidates = [
      candidate({ color: "#101112", isFringeSuspect: false }),
      candidate({ color: "#2f7b53", isFringeSuspect: true })
    ];

    expect(getManualSuspectOutlineSourceColors(["#2F7B53", "#ffffff"], candidates)).toEqual(["#2f7b53"]);
    expect(hasManualSuspectOutlineSource(["#2F7B53"], candidates)).toBe(true);
    expect(hasManualSuspectOutlineSource(["#ffffff"], candidates)).toBe(false);
  });
});
