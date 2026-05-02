import { describe, expect, test } from "vitest";
import { canToggleEditorPanel, getEditorPanelMenuItems } from "./editorShell";

describe("editor shell", () => {
  test("keeps required panels locked while optional panels can be toggled", () => {
    expect(canToggleEditorPanel("assets")).toBe(false);
    expect(canToggleEditorPanel("viewport")).toBe(false);
    expect(canToggleEditorPanel("inspector")).toBe(false);
    expect(canToggleEditorPanel("bottom")).toBe(true);
  });

  test("builds view menu items with required panels checked and disabled", () => {
    expect(getEditorPanelMenuItems({ bottomPanelVisible: false })).toEqual([
      { id: "assets", label: "Assets", checked: true, disabled: true },
      { id: "viewport", label: "Input / Output", checked: true, disabled: true },
      { id: "inspector", label: "Inspector", checked: true, disabled: true },
      { id: "bottom", label: "Timeline / Metrics", checked: false, disabled: false }
    ]);
  });
});
