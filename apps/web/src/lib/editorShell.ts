export type EditorPanelId = "assets" | "viewport" | "inspector" | "bottom";

export type EditorPanelMenuItem = {
  id: EditorPanelId;
  label: string;
  checked: boolean;
  disabled: boolean;
};

const requiredEditorPanels = new Set<EditorPanelId>(["assets", "viewport", "inspector"]);

export function canToggleEditorPanel(panel: EditorPanelId): boolean {
  return !requiredEditorPanels.has(panel);
}

export function getEditorPanelMenuItems({ bottomPanelVisible }: { bottomPanelVisible: boolean }): EditorPanelMenuItem[] {
  return [
    { id: "assets", label: "Assets", checked: true, disabled: true },
    { id: "viewport", label: "Input / Output", checked: true, disabled: true },
    { id: "inspector", label: "Inspector", checked: true, disabled: true },
    { id: "bottom", label: "Timeline / Metrics", checked: bottomPanelVisible, disabled: !canToggleEditorPanel("bottom") }
  ];
}
