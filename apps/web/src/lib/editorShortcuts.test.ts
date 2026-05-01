import { describe, expect, test } from "vitest";
import { getEditorShortcutAction } from "./editorShortcuts";

describe("editor shortcuts", () => {
  test("maps primary command shortcuts", () => {
    expect(getEditorShortcutAction({ key: "o", ctrlKey: true })).toBe("import");
    expect(getEditorShortcutAction({ key: "Enter", metaKey: true })).toBe("fix");
    expect(getEditorShortcutAction({ key: "E", ctrlKey: true, shiftKey: true })).toBe("export");
  });

  test("maps viewport and playback shortcuts without modifiers", () => {
    expect(getEditorShortcutAction({ key: "g" })).toBe("toggleGrid");
    expect(getEditorShortcutAction({ key: " " })).toBe("togglePlayback");
    expect(getEditorShortcutAction({ key: "ArrowLeft" })).toBe("previousFrame");
    expect(getEditorShortcutAction({ key: "ArrowRight" })).toBe("nextFrame");
  });

  test("maps undo and redo shortcuts", () => {
    expect(getEditorShortcutAction({ key: "z", ctrlKey: true })).toBe("undoFrameEdit");
    expect(getEditorShortcutAction({ key: "z", metaKey: true, shiftKey: true })).toBe("redoFrameEdit");
    expect(getEditorShortcutAction({ key: "y", ctrlKey: true })).toBe("redoFrameEdit");
  });

  test("ignores shortcuts while focus is in editable controls", () => {
    expect(getEditorShortcutAction({ key: "g", isEditableTarget: true })).toBeNull();
    expect(getEditorShortcutAction({ key: "z", ctrlKey: true, isEditableTarget: true })).toBeNull();
  });

  test("does not treat modified playback keys as shortcuts", () => {
    expect(getEditorShortcutAction({ key: "ArrowRight", ctrlKey: true })).toBeNull();
    expect(getEditorShortcutAction({ key: " ", altKey: true })).toBeNull();
  });
});
