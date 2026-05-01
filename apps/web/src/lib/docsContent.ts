import editorMarkdown from "../../../../docs/editor.md?raw";
import architectureMarkdown from "../../../../docs/architecture.md?raw";
import algorithmsMarkdown from "../../../../docs/algorithms.md?raw";
import performanceMarkdown from "../../../../docs/performance.md?raw";
import licensingMarkdown from "../../../../docs/licensing.md?raw";
import onboardingSamplesMarkdown from "../../../../docs/onboarding-samples.md?raw";
import troubleshootingMarkdown from "../../../../docs/troubleshooting.md?raw";

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
    markdown: extractMarkdownSection(editorMarkdown, "Assets")
  },
  {
    id: "fix-settings",
    title: "Fix Settings",
    tooltip: "Controls asset type, processing mode, target size, sheet sizing hierarchy, palette, downscale, and alpha handling.",
    markdown: extractMarkdownSection(editorMarkdown, "Fix Settings")
  },
  {
    id: "grid",
    title: "Grid",
    tooltip: "Controls pseudo-pixel grid detection and manual output sizing.",
    markdown: extractMarkdownSection(editorMarkdown, "Grid")
  },
  {
    id: "frame-cell",
    title: "Frame / Cell",
    tooltip: "Sheet frame dimensions, rows, columns, margin, and spacing.",
    markdown: extractMarkdownSection(editorMarkdown, "Frame / Cell")
  },
  {
    id: "viewport",
    title: "Viewport",
    tooltip: "Canvas preview, pan, zoom, grid overlay, split comparison, and rulers.",
    markdown: extractMarkdownSection(editorMarkdown, "Viewport")
  },
  {
    id: "timeline",
    title: "Timeline",
    tooltip: "Explains when the sprite player is active and why it may be empty.",
    markdown: extractMarkdownSection(editorMarkdown, "Timeline")
  },
  {
    id: "metrics",
    title: "Metrics",
    tooltip: "Source and output measurements shown after import and fix operations.",
    markdown: extractMarkdownSection(editorMarkdown, "Metrics")
  },
  {
    id: "export",
    title: "Export",
    tooltip: "Downloads the fixed image and manifest for engine workflows.",
    markdown: extractMarkdownSection(editorMarkdown, "Export")
  },
  {
    id: "onboarding-samples",
    title: "Samples",
    tooltip: "Release sample workflows for fake-grid sprites, alpha cleanup, sheets, tilesets, and backgrounds.",
    markdown: onboardingSamplesMarkdown
  },
  {
    id: "architecture",
    title: "Architecture",
    tooltip: "Package boundaries, data flow, and extension points.",
    markdown: architectureMarkdown
  },
  {
    id: "algorithms",
    title: "Algorithms",
    tooltip: "Grid detection, block downsampling, palette, alpha, and sheet slicing.",
    markdown: algorithmsMarkdown
  },
  {
    id: "performance",
    title: "Performance",
    tooltip: "Rendering and worker performance requirements.",
    markdown: performanceMarkdown
  },
  {
    id: "licensing",
    title: "Licensing",
    tooltip: "License strategy and dependency policy.",
    markdown: licensingMarkdown
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    tooltip: "Diagnostics export and common recovery paths.",
    markdown: troubleshootingMarkdown
  }
];

export function getDocsSection(id: string): DocsSection | undefined {
  return docsSections.find((section) => section.id === id);
}

function extractMarkdownSection(markdown: string, heading: string): string {
  const lines = markdown.trim().split("\n");
  const start = lines.findIndex((line) => line.trim() === `# ${heading}`);
  if (start < 0) {
    return `# ${heading}\n\nDocumentation is not available for this section.`;
  }

  const end = lines.findIndex((line, index) => index > start && line.startsWith("# "));
  return lines.slice(start, end < 0 ? undefined : end).join("\n").trim();
}
