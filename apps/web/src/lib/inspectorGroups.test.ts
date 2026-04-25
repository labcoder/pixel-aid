import { describe, expect, test } from "vitest";
import { defaultInspectorGroupOrder, moveInspectorGroup } from "./inspectorGroups";

describe("inspector groups", () => {
  test("puts cleanup before grid by default", () => {
    expect(defaultInspectorGroupOrder).toEqual(["asset", "cleanup", "grid", "frame", "viewport", "export"]);
  });

  test("moves groups up and down without losing entries", () => {
    expect(moveInspectorGroup(defaultInspectorGroupOrder, "grid", "up")).toEqual([
      "asset",
      "grid",
      "cleanup",
      "frame",
      "viewport",
      "export"
    ]);

    expect(moveInspectorGroup(defaultInspectorGroupOrder, "cleanup", "down")).toEqual([
      "asset",
      "grid",
      "cleanup",
      "frame",
      "viewport",
      "export"
    ]);
  });

  test("keeps boundary groups in place", () => {
    expect(moveInspectorGroup(defaultInspectorGroupOrder, "asset", "up")).toEqual(defaultInspectorGroupOrder);
    expect(moveInspectorGroup(defaultInspectorGroupOrder, "export", "down")).toEqual(defaultInspectorGroupOrder);
  });
});
