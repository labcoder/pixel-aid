import { describe, expect, test } from "vitest";
import { getSamplePickerButtonLabel } from "./samplePicker";

describe("sample picker", () => {
  test("formats a compact sample picker button label", () => {
    expect(getSamplePickerButtonLabel(0)).toBe("Samples");
    expect(getSamplePickerButtonLabel(1)).toBe("Samples (1)");
    expect(getSamplePickerButtonLabel(5)).toBe("Samples (5)");
  });
});
