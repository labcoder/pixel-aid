import {
  Download,
  Eye,
  FileImage,
  Gauge,
  Layers,
  Play,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Upload,
  WandSparkles
} from "lucide-react";
import type { ReactNode } from "react";
import { ViewportCanvas } from "./components/ViewportCanvas";

const importedAssets = ["No asset selected"];
const logLines = [
  "Workspace initialized",
  "Worker pipeline ready",
  "Waiting for image import"
];

export function App() {
  return (
    <main className="editor-shell" aria-label="PixelAid editor">
      <header className="top-toolbar">
        <div className="brand-lockup">
          <span className="brand-mark">PA</span>
          <div>
            <h1>PixelAid</h1>
            <p>Fake-pixel fixer</p>
          </div>
        </div>
        <nav className="toolbar-actions" aria-label="Primary editor actions">
          <button type="button">
            <Upload size={16} />
            Import
          </button>
          <button type="button">
            <WandSparkles size={16} />
            Fix
          </button>
          <button type="button">
            <Eye size={16} />
            Preview
          </button>
          <button type="button">
            <Download size={16} />
            Export
          </button>
          <button type="button">
            <SlidersHorizontal size={16} />
            Presets
          </button>
        </nav>
      </header>

      <aside className="left-panel panel" aria-label="Project assets">
        <PanelHeader icon={<Layers size={16} />} title="Project" />
        <section className="panel-section">
          <h2>Imported Assets</h2>
          <ul className="asset-list">
            {importedAssets.map((asset) => (
              <li key={asset}>
                <FileImage size={15} />
                <span>{asset}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel-section">
          <h2>Palettes</h2>
          <div className="swatch-row" aria-label="Default palette preview">
            {["#111111", "#f4d35e", "#2ec4b6", "#e71d36", "#f7fff7"].map((color) => (
              <span key={color} style={{ backgroundColor: color }} />
            ))}
          </div>
        </section>
        <section className="panel-section">
          <h2>Presets</h2>
          <button type="button" className="preset-row">
            <Sparkles size={15} />
            64px sprite, 16 colors
          </button>
        </section>
      </aside>

      <section className="viewport-panel" aria-label="Pixel preview viewport">
        <div className="viewport-strip">
          <div>
            <strong>Before / After</strong>
            <span>split view</span>
          </div>
          <div className="viewport-readouts">
            <span>Native: --</span>
            <span>Zoom: 800%</span>
            <span>Grid: --</span>
          </div>
        </div>
        <ViewportCanvas />
      </section>

      <aside className="right-panel panel" aria-label="Inspector">
        <PanelHeader icon={<SlidersHorizontal size={16} />} title="Inspector" />
        <details className="control-group" open>
          <summary>Fix Settings</summary>
          <Field label="Mode" value="Single sprite" />
          <NumberField label="Target W" value="64" />
          <NumberField label="Target H" value="64" />
          <NumberField label="Max colors" value="16" />
          <Field label="Downscale" value="Dominant" />
        </details>
        <details className="control-group" open>
          <summary>Grid</summary>
          <Field label="Detect" value="Auto" />
          <NumberField label="Scale" value="8" />
          <NumberField label="Phase X" value="0" />
          <NumberField label="Phase Y" value="0" />
        </details>
        <details className="control-group" open>
          <summary>Export</summary>
          <Field label="Target" value="Generic JSON" />
          <NumberField label="Spacing" value="0" />
          <NumberField label="Extrude" value="1" />
        </details>
      </aside>

      <footer className="bottom-panel panel" aria-label="Timeline logs and metrics">
        <div className="tab-strip" role="tablist" aria-label="Bottom panels">
          <button type="button" className="active">
            <Play size={15} />
            Timeline
          </button>
          <button type="button">
            <Terminal size={15} />
            Logs
          </button>
          <button type="button">
            <Gauge size={15} />
            Metrics
          </button>
        </div>
        <div className="bottom-content">
          <section>
            <h2>Sprite Player</h2>
            <div className="timeline-rail">
              <span />
              <span />
              <span />
              <span />
            </div>
          </section>
          <section>
            <h2>Console</h2>
            <ol className="log-list">
              {logLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </section>
          <section>
            <h2>Metrics</h2>
            <dl className="metric-grid">
              <div>
                <dt>Duration</dt>
                <dd>--</dd>
              </div>
              <div>
                <dt>Palette</dt>
                <dd>--</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>--</dd>
              </div>
            </dl>
          </section>
        </div>
      </footer>
    </main>
  );
}

function PanelHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-header">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <select defaultValue={value}>
        <option>{value}</option>
      </select>
    </label>
  );
}

function NumberField({ label, value }: { label: string; value: string }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input type="number" defaultValue={value} />
    </label>
  );
}
