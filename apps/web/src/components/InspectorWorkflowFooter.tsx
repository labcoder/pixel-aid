import { SlidersHorizontal, WandSparkles } from "lucide-react";
import type { ReactNode } from "react";

export function InspectorWorkflowFooter({
  selected,
  busy,
  advancedOpen,
  onToggleAdvanced,
  onRunFix,
  children
}: {
  selected: boolean;
  busy: boolean;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  onRunFix: () => void | Promise<unknown>;
  children: ReactNode;
}) {
  return (
    <div className="inspector-workflow-finish">
      <section className="inspector-more-controls" aria-label="More controls">
        <div>
          <strong>More controls</strong>
          <small>Palette, cleanup, grid tuning, and export details.</small>
        </div>
        <button
          type="button"
          className={advancedOpen ? "active" : ""}
          disabled={!selected}
          aria-expanded={advancedOpen}
          onClick={onToggleAdvanced}
        >
          <SlidersHorizontal size={14} />
          {advancedOpen ? "Hide" : "Open"}
        </button>
      </section>
      {advancedOpen ? <div className="inspector-advanced-groups">{children}</div> : null}
      <div className="inspector-run-bar">
        <div>
          <span>{busy ? "Processing asset" : selected ? "Settings ready" : "No asset selected"}</span>
          <small>{selected ? "Fix uses every setting above." : "Import or paste an image to begin."}</small>
        </div>
        <button
          type="button"
          className="guided-fix-action"
          disabled={!selected || busy}
          onClick={onRunFix}
        >
          <WandSparkles size={15} />
          {busy ? "Fixing…" : "Run Fix"}
        </button>
      </div>
    </div>
  );
}
