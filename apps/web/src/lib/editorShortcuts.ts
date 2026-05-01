export type EditorShortcutAction =
  | "import"
  | "fix"
  | "export"
  | "toggleGrid"
  | "togglePlayback"
  | "previousFrame"
  | "nextFrame"
  | "undoFrameEdit"
  | "redoFrameEdit";

export type EditorShortcutInput = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  isEditableTarget?: boolean;
  isInteractiveTarget?: boolean;
};

export function getEditorShortcutAction(input: EditorShortcutInput): EditorShortcutAction | null {
  if (input.isEditableTarget) {
    return null;
  }

  const key = input.key.toLowerCase();
  const hasCommandModifier = input.ctrlKey === true || input.metaKey === true;
  const hasAnyModifier = hasCommandModifier || input.shiftKey === true || input.altKey === true;

  if (hasCommandModifier) {
    if (key === "z" && input.shiftKey) {
      return "redoFrameEdit";
    }
    if (key === "z" && !input.altKey) {
      return "undoFrameEdit";
    }
    if (key === "y" && !input.shiftKey && !input.altKey) {
      return "redoFrameEdit";
    }
    if (key === "o" && !input.shiftKey && !input.altKey) {
      return "import";
    }
    if (key === "enter" && !input.shiftKey && !input.altKey) {
      return "fix";
    }
    if (key === "e" && input.shiftKey && !input.altKey) {
      return "export";
    }

    return null;
  }

  if (hasAnyModifier) {
    return null;
  }

  if (input.isInteractiveTarget) {
    return null;
  }

  if (key === "g") {
    return "toggleGrid";
  }
  if (input.key === " ") {
    return "togglePlayback";
  }
  if (key === "arrowleft") {
    return "previousFrame";
  }
  if (key === "arrowright") {
    return "nextFrame";
  }

  return null;
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    isEditableShortcutTarget(target) ||
    target.closest(
      [
        "button",
        "a[href]",
        "summary",
        "[role='button']",
        "[role='tab']",
        "[role='slider']",
        "[role='menuitem']",
        "[role='menuitemcheckbox']",
        "[role='menuitemradio']"
      ].join(",")
    ) !== null
  );
}
