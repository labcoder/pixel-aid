import { describe, expect, test } from "vitest";
import { getImportViewMode } from "./importViewMode";

describe("import view mode", () => {
  test("starts newly imported assets on the input view", () => {
    expect(getImportViewMode()).toBe("before");
  });
});
