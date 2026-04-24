import {
  Ban,
  Download,
  Eye,
  FileImage,
  Gauge,
  Layers,
  Play,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  WandSparkles
} from "lucide-react";
import type { DragEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AlphaMode, AssetMode, DownscaleMethod, FixOptions, PixelFixResult } from "@pixelaid/shared";
import { createPixelAssetManifest } from "@pixelaid/exporters";
import { AssetThumbnail } from "./components/AssetThumbnail";
import { ViewportCanvas, type ViewMode } from "./components/ViewportCanvas";
import { removeAssetAndSelectNext } from "./lib/assets";
import { assetBaseName, downloadBlob, jsonBlob, rgbaImageToPngBlob } from "./lib/exportFiles";
import { suggestFixSettings } from "./lib/fixSuggestions";
import type { FixJob } from "./lib/fixWorkerClient";
import { startFixJob } from "./lib/fixWorkerClient";
import { decodeImageFile, type ImportedImageAsset } from "./lib/imageDecode";

const defaultLogLines = ["Workspace initialized", "Worker pipeline ready", "Waiting for image import"];

export function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [assets, setAssets] = useState<ImportedImageAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [logs, setLogs] = useState(defaultLogLines);
  const [isDropActive, setIsDropActive] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(8);
  const [mode, setMode] = useState<AssetMode>("single");
  const [targetWidth, setTargetWidth] = useState(64);
  const [targetHeight, setTargetHeight] = useState(64);
  const [maxColors, setMaxColors] = useState(16);
  const [gridDetect, setGridDetect] = useState<"auto" | "manual">("auto");
  const [gridScale, setGridScale] = useState(8);
  const [downscale, setDownscale] = useState<DownscaleMethod>("dominant");
  const [alpha, setAlpha] = useState<AlphaMode>("preserve");
  const [suggestionReason, setSuggestionReason] = useState("Import an asset, then use Auto Suggest to seed the controls.");
  const [fixResult, setFixResult] = useState<PixelFixResult | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const [assetMenu, setAssetMenu] = useState<{ assetId: string; x: number; y: number } | null>(null);
  const activeJobRef = useRef<FixJob | null>(null);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null;

  const appendLog = useCallback((line: string) => {
    setLogs((current) => [line, ...current].slice(0, 8));
  }, []);

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        appendLog("No image files found in import");
        return;
      }

      for (const file of imageFiles) {
        try {
          const asset = await decodeImageFile(file);
          setAssets((current) => {
            const withoutDuplicate = current.filter((item) => item.id !== asset.id);
            return [asset, ...withoutDuplicate];
          });
          setSelectedAssetId(asset.id);
          setFixResult(null);
          const suggestion = suggestFixSettings(asset.image);
          setMode(suggestion.mode);
          setTargetWidth(suggestion.targetWidth);
          setTargetHeight(suggestion.targetHeight);
          setGridScale(suggestion.gridScale);
          setGridDetect(suggestion.gridDetect);
          setDownscale(suggestion.downscale);
          setMaxColors(suggestion.maxColors);
          setSuggestionReason(suggestion.reason);
          appendLog(`Imported ${asset.name} (${asset.image.width}x${asset.image.height})`);
        } catch (error) {
          appendLog(error instanceof Error ? error.message : `Failed to import ${file.name}`);
        }
      }
    },
    [appendLog]
  );

  const buildFixOptions = useCallback((): FixOptions => {
    const options: FixOptions = {
      mode,
      maxColors,
      grid: {
        detect: gridDetect,
        phaseX: 0,
        phaseY: 0
      },
      downscale,
      alpha,
      cleanup: {
        removeOrphans: false,
        jaggyCleanup: false,
        preserveSinglePixelDetails: true
      }
    };

    if (gridDetect === "manual") {
      options.targetWidth = targetWidth;
      options.targetHeight = targetHeight;
      options.grid.scale = gridScale;
    }

    return options;
  }, [alpha, downscale, gridDetect, gridScale, maxColors, mode, targetHeight, targetWidth]);

  const runFix = useCallback(() => {
    if (!selectedAsset || isFixing) {
      return;
    }

    const options = buildFixOptions();
    const job = startFixJob(selectedAsset.image, options);
    activeJobRef.current = job;
    setIsFixing(true);
    appendLog(`Fix started (${options.grid.detect} grid, ${options.maxColors} colors)`);

    void job.promise
      .then((result) => {
        setFixResult(result);
        setViewMode("after");
        appendLog(
          `Fix complete: ${result.image.width}x${result.image.height}, ${result.palette.length} colors, ${result.metrics.durationMs.toFixed(1)}ms`
        );
      })
      .catch((error) => {
        appendLog(error instanceof Error ? error.message : "Fix failed");
      })
      .finally(() => {
        if (activeJobRef.current?.requestId === job.requestId) {
          activeJobRef.current = null;
        }
        setIsFixing(false);
      });
  }, [appendLog, buildFixOptions, isFixing, selectedAsset]);

  const cancelFix = useCallback(() => {
    activeJobRef.current?.cancel();
  }, []);

  const autoSuggest = useCallback(() => {
    if (!selectedAsset) {
      return;
    }

    const suggestion = suggestFixSettings(selectedAsset.image);
    setMode(suggestion.mode);
    setTargetWidth(suggestion.targetWidth);
    setTargetHeight(suggestion.targetHeight);
    setMaxColors(suggestion.maxColors);
    setGridDetect(suggestion.gridDetect);
    setGridScale(suggestion.gridScale);
    setDownscale(suggestion.downscale);
    setSuggestionReason(`${suggestion.reason} Confidence ${Math.round(suggestion.confidence * 100)}%.`);
    appendLog(`Auto suggested ${suggestion.mode} at ${suggestion.targetWidth}x${suggestion.targetHeight}`);
  }, [appendLog, selectedAsset]);

  const selectAsset = useCallback(
    (assetId: string) => {
      if (assetId !== selectedAsset?.id) {
        setFixResult(null);
      }
      setSelectedAssetId(assetId);
      setAssetMenu(null);
    },
    [selectedAsset?.id]
  );

  const removeAsset = useCallback(
    (assetId: string) => {
      setAssets((current) => {
        const result = removeAssetAndSelectNext(current, assetId, selectedAsset?.id ?? null);
        setSelectedAssetId(result.selectedAssetId);
        return result.assets;
      });
      if (assetId === selectedAsset?.id) {
        setFixResult(null);
      }
      setAssetMenu(null);
      appendLog("Removed asset");
    },
    [appendLog, selectedAsset?.id]
  );

  const exportFixedAsset = useCallback(() => {
    if (!selectedAsset || !fixResult) {
      return;
    }

    const baseName = assetBaseName(selectedAsset.name);
    const imageName = `${baseName}_fixed.png`;
    const manifestName = `${baseName}_manifest.json`;
    const manifest = createPixelAssetManifest({
      result: fixResult,
      imageName,
      originalFilename: selectedAsset.name,
      generatedAt: new Date().toISOString()
    });

    void rgbaImageToPngBlob(fixResult.image)
      .then((png) => {
        downloadBlob(png, imageName);
        downloadBlob(jsonBlob(manifest), manifestName);
        appendLog(`Exported ${imageName} and ${manifestName}`);
      })
      .catch((error) => {
        appendLog(error instanceof Error ? error.message : "Export failed");
      });
  }, [appendLog, fixResult, selectedAsset]);

  useEffect(() => {
    const closeAssetMenu = () => setAssetMenu(null);
    const onPaste = (event: ClipboardEvent) => {
      if (event.clipboardData?.files.length) {
        void importFiles(event.clipboardData.files);
      }
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("click", closeAssetMenu);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("click", closeAssetMenu);
    };
  }, [importFiles]);

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDropActive(false);
    void importFiles(event.dataTransfer.files);
  };

  return (
    <main
      className={`editor-shell${isDropActive ? " is-drop-active" : ""}`}
      aria-label="PixelAid editor"
      onDragEnter={() => setIsDropActive(true)}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setIsDropActive(false);
        }
      }}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        className="file-input"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          if (event.currentTarget.files) {
            void importFiles(event.currentTarget.files);
          }
          event.currentTarget.value = "";
        }}
      />

      <header className="top-toolbar">
        <div className="brand-lockup">
          <span className="brand-mark">PA</span>
          <div>
            <h1>PixelAid</h1>
            <p>Fake-pixel fixer</p>
          </div>
        </div>
        <nav className="toolbar-actions" aria-label="Primary editor actions">
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            Import
          </button>
          <button type="button" disabled={!selectedAsset || isFixing} onClick={runFix}>
            <WandSparkles size={16} />
            {isFixing ? "Fixing" : "Fix"}
          </button>
          <button type="button" disabled={!isFixing} onClick={cancelFix} aria-label="Cancel active fix job">
            <Ban size={16} />
            Cancel
          </button>
          <button type="button" onClick={() => setViewMode(viewMode === "after" ? "before" : "after")}>
            <Eye size={16} />
            Preview
          </button>
          <button type="button" disabled={!fixResult} onClick={exportFixedAsset}>
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
          <h2>Assets</h2>
          <ul className="asset-list">
            {assets.length === 0 ? (
              <li className="muted-row">
                <FileImage size={15} />
                <span>No asset selected</span>
              </li>
            ) : (
              assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className={`asset-row${asset.id === selectedAsset?.id ? " active-asset" : ""}`}
                    onClick={() => selectAsset(asset.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setAssetMenu({ assetId: asset.id, x: event.clientX, y: event.clientY });
                    }}
                  >
                    <AssetThumbnail image={asset.image} label={asset.name} />
                    <span className="asset-meta">
                      <strong>{asset.name}</strong>
                      <small>
                        Source {asset.image.width}x{asset.image.height}
                      </small>
                    </span>
                    <span
                      className="icon-button danger"
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove ${asset.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeAsset(asset.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          removeAsset(asset.id);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {assetMenu ? (
            <div
              className="context-menu"
              style={{ left: assetMenu.x, top: assetMenu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              <button type="button" onClick={() => removeAsset(assetMenu.assetId)}>
                <Trash2 size={14} />
                Delete asset
              </button>
            </div>
          ) : null}
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
            <span>{viewMode} view</span>
          </div>
          <div className="view-controls" aria-label="Viewport mode controls">
            <button type="button" className={viewMode === "before" ? "active" : ""} onClick={() => setViewMode("before")}>
              Before
            </button>
            <button type="button" className={viewMode === "split" ? "active" : ""} onClick={() => setViewMode("split")}>
              Split
            </button>
            <button type="button" className={viewMode === "after" ? "active" : ""} onClick={() => setViewMode("after")}>
              After
            </button>
          </div>
          <div className="viewport-readouts">
            <span>
              Native: {selectedAsset ? `${selectedAsset.image.width}x${selectedAsset.image.height}` : "--"}
            </span>
            <span>Zoom: {zoom * 100}%</span>
            <span>Grid: {showGrid ? "on" : "off"}</span>
          </div>
        </div>
        <ViewportCanvas
          sourceImage={selectedAsset?.image ?? null}
          fixedImage={fixResult?.image ?? null}
          viewMode={viewMode}
          zoom={zoom}
          showGrid={showGrid}
          onZoomChange={setZoom}
        />
      </section>

      <aside className="right-panel panel" aria-label="Inspector">
        <PanelHeader icon={<SlidersHorizontal size={16} />} title="Inspector" />
        <details className="control-group" open>
          <summary>Fix Settings</summary>
          <button type="button" className="wide-tool-button" disabled={!selectedAsset} onClick={autoSuggest}>
            <WandSparkles size={15} />
            Auto Suggest
          </button>
          <p className="control-hint">{suggestionReason}</p>
          <SelectField
            label="Mode"
            value={mode}
            options={[
              ["single", "Single sprite"],
              ["spriteSheet", "Sprite sheet"],
              ["characterSheet", "Character sheet"],
              ["tileSheet", "Tile sheet"]
            ]}
            onChange={(value) => setMode(value as AssetMode)}
          />
          <NumberField
            label="Target W"
            value={targetWidth}
            min={1}
            disabled={gridDetect === "auto"}
            onChange={setTargetWidth}
          />
          <NumberField
            label="Target H"
            value={targetHeight}
            min={1}
            disabled={gridDetect === "auto"}
            onChange={setTargetHeight}
          />
          <NumberField label="Max colors" value={maxColors} min={1} max={64} onChange={setMaxColors} />
          <SelectField
            label="Downscale"
            value={downscale}
            options={[
              ["dominant", "Dominant"],
              ["median", "Median"],
              ["adaptive", "Adaptive"],
              ["averageThenPalette", "Average + palette"]
            ]}
            onChange={(value) => setDownscale(value as DownscaleMethod)}
          />
          <SelectField
            label="Alpha"
            value={alpha}
            options={[
              ["preserve", "Preserve"],
              ["binary", "Binary"],
              ["backgroundFloodFill", "Flood fill"]
            ]}
            onChange={(value) => setAlpha(value as AlphaMode)}
          />
        </details>
        <details className="control-group" open>
          <summary>Grid</summary>
          <p className="control-hint">
            Auto grid chooses output from the detected pseudo-pixel blocks. Manual target uses Target W/H and Scale.
          </p>
          <SelectField
            label="Detect"
            value={gridDetect}
            options={[
              ["auto", "Auto candidate"],
              ["manual", "Manual target"]
            ]}
            onChange={(value) => setGridDetect(value as "auto" | "manual")}
          />
          <NumberField label="Scale" value={gridScale} min={1} onChange={setGridScale} />
          <ReadonlyField label="Phase X" value="0" />
          <ReadonlyField label="Phase Y" value="0" />
          <label className="toggle-row">
            <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.currentTarget.checked)} />
            Show grid overlay
          </label>
          <label className="field-row">
            <span>Zoom</span>
            <input
              type="range"
              min="1"
              max="16"
              step="1"
              value={zoom}
              onChange={(event) => setZoom(Number(event.currentTarget.value))}
            />
          </label>
        </details>
        <details className="control-group" open>
          <summary>Export</summary>
          <Field label="Target" value="Generic JSON" />
          <ReadonlyField label="PNG" value={fixResult ? "ready" : "pending"} text />
          <ReadonlyField label="Manifest" value={fixResult ? "ready" : "pending"} text />
          <ReadonlyField label="Spacing" value="0" />
          <ReadonlyField label="Extrude" value="1" />
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
              {logs.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </section>
          <section>
            <h2>Metrics</h2>
            <dl className="metric-grid">
              <div>
                <dt>Source</dt>
                <dd>{selectedAsset ? `${selectedAsset.image.width}x${selectedAsset.image.height}` : "--"}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd>{fixResult ? `${fixResult.image.width}x${fixResult.image.height}` : `${targetWidth}x${targetHeight}`}</dd>
              </div>
              <div>
                <dt>Palette</dt>
                <dd>{fixResult ? fixResult.palette.length : "--"}</dd>
              </div>
              <div>
                <dt>Grid</dt>
                <dd>{fixResult ? `${Math.round(fixResult.grid.confidence * 100)}%` : "--"}</dd>
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
      <select value={value} onChange={() => undefined}>
        <option>{value}</option>
      </select>
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function ReadonlyField({ label, value, text = false }: { label: string; value: string; text?: boolean }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input type={text ? "text" : "number"} value={value} readOnly />
    </label>
  );
}
