import { describe, expect, test } from "vitest";
import { getTimelineViewportLayout } from "./timelineViewportLayout";

describe("timeline viewport layout", () => {
  test("centers a single source pane with integer pixel scale", () => {
    const layout = getTimelineViewportLayout({
      viewport: { width: 800, height: 500 },
      mode: "input",
      inputCanvas: { width: 64, height: 64 },
      outputCanvas: null
    });

    expect(layout.panes).toEqual([
      {
        id: "input",
        label: "Input",
        drawRect: { x: 176, y: 26, w: 448, h: 448 },
        canvas: { width: 64, height: 64 },
        scale: 7
      }
    ]);
  });

  test("lays out input and output panes for compare mode", () => {
    const layout = getTimelineViewportLayout({
      viewport: { width: 900, height: 420 },
      mode: "compare",
      inputCanvas: { width: 64, height: 64 },
      outputCanvas: { width: 64, height: 64 }
    });

    expect(layout.panes.map((pane) => pane.id)).toEqual(["input", "output"]);
    expect(layout.panes[0]?.scale).toBe(5);
    expect(layout.panes[1]?.scale).toBe(5);
    expect(layout.dividerX).toBe(450);
  });

  test("can use a slider comparison layout for animation frames", () => {
    const layout = getTimelineViewportLayout({
      viewport: { width: 900, height: 420 },
      mode: "compare",
      compareMode: "split",
      inputCanvas: { width: 64, height: 64 },
      outputCanvas: { width: 64, height: 64 }
    });

    expect(layout.compareMode).toBe("split");
    expect(layout.panes.map((pane) => pane.id)).toEqual(["input", "output"]);
    expect(layout.panes[0]?.drawRect).toEqual(layout.panes[1]?.drawRect);
    expect(layout.dividerX).toBe(450);
  });

  test("falls back to input pane when output is unavailable", () => {
    const layout = getTimelineViewportLayout({
      viewport: { width: 500, height: 300 },
      mode: "output",
      inputCanvas: { width: 32, height: 48 },
      outputCanvas: null
    });

    expect(layout.panes.map((pane) => pane.id)).toEqual(["input"]);
  });
});
