import { step1gNativeSizeCorpus } from "@pixelaid/fixtures";
import { describe, expect, test } from "vitest";
import baseline from "./step1g-characterization-baseline.json";
import {
  characterizeStep1GFixture,
  type Step1GCharacterization
} from "./step1gCharacterization.test-utils";

describe("Step 1G robust detector characterization", () => {
  test("records every fixture once without treating current failures as acceptance", () => {
    const fixtureIds = step1gNativeSizeCorpus.map((fixture) => fixture.id).sort();
    const baselineIds = baseline.cases.map((entry) => entry.id).sort();

    expect(baseline.schemaVersion).toBe(1);
    expect(baselineIds).toEqual(fixtureIds);
  });

  test("produces deterministic bounded measurements without mutating fixtures", async () => {
    const first: Step1GCharacterization[] = [];
    const second: Step1GCharacterization[] = [];
    for (const fixture of step1gNativeSizeCorpus) {
      first.push(await characterizeStep1GFixture(fixture));
      second.push(await characterizeStep1GFixture(fixture));
    }

    expect(second).toEqual(first);
    for (const characterization of first) {
      expect(characterization.topCandidates.length).toBeGreaterThan(0);
      expect(characterization.topCandidates.length).toBeLessThanOrEqual(5);
    }
  });

  test("prints a baseline only when explicitly requested", async () => {
    if (process.env.PIXELAID_PRINT_STEP1G_BASELINE !== "1") {
      expect(true).toBe(true);
      return;
    }

    const cases: Step1GCharacterization[] = [];
    for (const fixture of step1gNativeSizeCorpus) {
      cases.push(await characterizeStep1GFixture(fixture));
    }
    console.log(JSON.stringify(cases, null, 2));
  });
});
