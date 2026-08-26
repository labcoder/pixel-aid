import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { InspectorWorkflowFooter } from "./InspectorWorkflowFooter";
import { OutputCanvasChoicePicker } from "./OutputCanvasChoicePicker";

describe("inspector workflow hierarchy", () => {
  test("renders more controls before the single contextual Run Fix action", () => {
    const markup = renderToStaticMarkup(
      <InspectorWorkflowFooter
        selected
        busy={false}
        advancedOpen
        onToggleAdvanced={() => undefined}
        onRunFix={() => undefined}
      >
        <div>Palette controls</div>
      </InspectorWorkflowFooter>
    );

    expect(markup.indexOf("More controls")).toBeLessThan(markup.indexOf("Palette controls"));
    expect(markup.indexOf("Palette controls")).toBeLessThan(markup.indexOf("Run Fix"));
    expect(markup.match(/Run Fix/g)).toHaveLength(1);
  });

  test("renders the three explicit output intents and predicted dimensions", () => {
    const markup = renderToStaticMarkup(
      <OutputCanvasChoicePicker
        value="composition"
        prediction={{
          choice: "composition",
          size: "1254x1254",
          detail: "Keep composition · native pixels"
        }}
        onChange={() => undefined}
      />
    );

    expect(markup).toContain("Keep composition");
    expect(markup).toContain("Trim to subject");
    expect(markup).toContain("Custom canvas");
    expect(markup).toContain("Expected output");
    expect(markup).toContain("1254x1254");
  });
});
