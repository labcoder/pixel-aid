export type DocsSection = {
  id: string;
  title: string;
  tooltip: string;
  markdown: string;
};

export const docsSections: DocsSection[] = [
  {
    id: "assets",
    title: "Assets",
    tooltip: "Imported source files, dimensions, thumbnails, and removal controls.",
    markdown: `# Assets

Assets are imported source images. Each item keeps the original filename, source dimensions, and a thumbnail preview.

- Select an asset to preview and fix it.
- Delete removes the asset from the editor session.
- The source image remains separate from the fixed output so destructive changes are reversible.`
  },
  {
    id: "fix-settings",
    title: "Fix Settings",
    tooltip: "Controls the asset mode, target size, palette limit, downscale method, and alpha handling.",
    markdown: `# Fix Settings

Mode describes the kind of source you are fixing.

- Single sprite: one sprite, prop, icon, or object.
- Sprite sheet: multiple frames arranged in rows or columns.
- Character sheet: character poses or directions that will later need animation tags and pivots.
- Tile sheet: tiles or tilesets where frame dimensions and grid alignment matter.

Auto Suggest seeds these controls from the current source. It does not lock them; every value remains editable.`
  },
  {
    id: "grid",
    title: "Grid",
    tooltip: "Controls pseudo-pixel grid detection and manual output sizing.",
    markdown: `# Grid

Auto candidate detects likely pseudo-pixel block size, phase, and native output dimensions. In this mode, Target W and Target H are informational because detected grid candidates choose the output size.

Manual target uses Target W, Target H, and Scale. Use it when auto detection chooses the wrong native size or when you already know the intended output dimensions.`
  },
  {
    id: "viewport",
    title: "Viewport",
    tooltip: "Canvas preview, pan, zoom, grid overlay, split comparison, and rulers.",
    markdown: `# Viewport

The viewport renders images through Canvas2D with smoothing disabled.

- Mouse wheel zooms around the cursor.
- Hold the left mouse button and drag to pan.
- Double-click the viewport to recenter.
- Rulers show native pixel positions and adapt their tick spacing as zoom changes.
- Split view compares source and fixed output with a draggable divider.`
  },
  {
    id: "export",
    title: "Export",
    tooltip: "Downloads the fixed image and manifest for engine workflows.",
    markdown: `# Export

The first export target is a generic engine-ready bundle.

- Fixed PNG contains the native-size pixel-art output.
- JSON manifest includes source dimensions, output dimensions, palette, grid metadata, frame rects, pivots, and operation settings.
- ZIP export packages the PNG and manifest together.`
  }
];

export function getDocsSection(id: string): DocsSection | undefined {
  return docsSections.find((section) => section.id === id);
}
