import { describe, expect, test } from "vitest";
import {
  defaultInspectorGroupOrder,
  getVisibleInspectorGroups,
  isInspectorGroupDefaultOpen,
  moveInspectorGroup,
  moveVisibleInspectorGroup,
  shouldShowFrameInspector
} from "./inspectorGroups";

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

  test("hides frame controls for single assets without frame metadata", () => {
    expect(shouldShowFrameInspector({ assetType: "sprite", mode: "single" })).toBe(false);
    expect(shouldShowFrameInspector({ assetType: "icon", mode: "single" })).toBe(false);
    expect(shouldShowFrameInspector({ assetType: "portrait", mode: "single" })).toBe(false);
    expect(shouldShowFrameInspector({ assetType: "uiElement", mode: "single" })).toBe(false);
    expect(shouldShowFrameInspector({ assetType: "background", mode: "single" })).toBe(false);
  });

  test("keeps frame controls for sheet-like assets or existing frame metadata", () => {
    expect(shouldShowFrameInspector({ assetType: "animationSheet", mode: "spriteSheet" })).toBe(true);
    expect(shouldShowFrameInspector({ assetType: "tileset", mode: "tileSheet" })).toBe(true);
    expect(shouldShowFrameInspector({ assetType: "tilemap", mode: "tileSheet" })).toBe(true);
    expect(shouldShowFrameInspector({ assetType: "sprite", mode: "single", frameCount: 1 })).toBe(true);
    expect(shouldShowFrameInspector({ assetType: "sprite", mode: "single", animationCount: 1 })).toBe(true);
  });

  test("filters hidden inspector groups without dropping saved order", () => {
    expect(getVisibleInspectorGroups(defaultInspectorGroupOrder, { assetType: "sprite", mode: "single" })).toEqual([
      "asset",
      "cleanup",
      "grid",
      "viewport",
      "export"
    ]);

    expect(getVisibleInspectorGroups(defaultInspectorGroupOrder, { assetType: "spriteSheet", mode: "spriteSheet" })).toEqual(
      defaultInspectorGroupOrder
    );
  });

  test("moves visible groups across hidden sections", () => {
    const visible = getVisibleInspectorGroups(defaultInspectorGroupOrder, { assetType: "sprite", mode: "single" });

    expect(moveVisibleInspectorGroup(defaultInspectorGroupOrder, visible, "grid", "down")).toEqual([
      "asset",
      "cleanup",
      "viewport",
      "frame",
      "grid",
      "export"
    ]);
  });

  test("opens only the asset inspector group by default", () => {
    expect(isInspectorGroupDefaultOpen("asset")).toBe(true);
    expect(isInspectorGroupDefaultOpen("cleanup")).toBe(false);
    expect(isInspectorGroupDefaultOpen("frame")).toBe(false);
  });
});
