import { CircleHelp, FileImage, Layers, Sparkles, Trash2, Upload } from "lucide-react";
import { getAssetTypeDefinition } from "@pixelaid/shared";

import type { AssetDirtyState } from "../lib/assetSessionDirty";
import type { ImportedImageAsset } from "../lib/imageDecode";
import { createReactSafeRgbaImage } from "../lib/reactSafeImage";
import { AssetThumbnail } from "./AssetThumbnail";

export type AssetBrowserMenuState = {
  assetId: string;
  x: number;
  y: number;
};

export type AssetBrowserPanelProps = {
  assets: readonly ImportedImageAsset[];
  selectedAssetId: string | null;
  assetDirtyStates: Record<string, AssetDirtyState>;
  assetPanelStatus: string | null;
  assetMenu: AssetBrowserMenuState | null;
  isEditorBusy: boolean;
  samplePickerButtonLabel: string;
  getThumbnailSurface: (asset: ImportedImageAsset) => CanvasImageSource | null;
  onDocs: (sectionId: string) => void;
  onImport: () => void;
  onOpenSamplePicker: () => void;
  onSelectAsset: (assetId: string) => void;
  onOpenAssetMenu: (menu: AssetBrowserMenuState) => void;
  onRequestAssetDeletion: (assetId: string) => void;
};

export function AssetBrowserPanel({
  assets,
  selectedAssetId,
  assetDirtyStates,
  assetPanelStatus,
  assetMenu,
  isEditorBusy,
  samplePickerButtonLabel,
  getThumbnailSurface,
  onDocs,
  onImport,
  onOpenSamplePicker,
  onSelectAsset,
  onOpenAssetMenu,
  onRequestAssetDeletion
}: AssetBrowserPanelProps) {
  return (
    <>
      <div className="panel-header">
        <Layers size={16} />
        <h2>Project</h2>
      </div>
      <section className="panel-section">
        <div className="section-title">
          <h2>Assets</h2>
          <button
            type="button"
            className="help-button"
            aria-label="Read docs for assets"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDocs("assets");
            }}
          >
            <CircleHelp size={13} />
            <span className="tooltip-panel">
              Imported source files, dimensions, thumbnails, and removal controls.
              <strong> Read docs</strong>
            </span>
          </button>
        </div>
        {assetPanelStatus ? (
          <div className="import-status" role="status" aria-live="polite">
            <span className="activity-dot" />
            <span>{assetPanelStatus}</span>
          </div>
        ) : null}
        <div className="asset-panel-actions">
          <button type="button" onClick={onImport} disabled={isEditorBusy}>
            <Upload size={14} />
            Import
          </button>
          <button type="button" onClick={onOpenSamplePicker} disabled={isEditorBusy}>
            <Sparkles size={14} />
            {samplePickerButtonLabel}
          </button>
        </div>
        <ul className="asset-list">
          {assets.length === 0 ? (
            <li className="muted-row">
              <FileImage size={15} />
              <span>No asset selected</span>
            </li>
          ) : (
            assets.map((asset) => {
              const dirtyState = assetDirtyStates[asset.id];
              const isDirty = dirtyState?.isDirty ?? false;

              return (
                <li key={asset.id} className="asset-list-entry">
                  <button
                    type="button"
                    className={`asset-row${asset.id === selectedAssetId ? " active-asset" : ""}${isDirty ? " dirty-asset" : ""}`}
                    aria-label={`Select ${asset.name}${isDirty ? ", unsaved edits in memory" : ""}`}
                    disabled={isEditorBusy}
                    onClick={() => onSelectAsset(asset.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onOpenAssetMenu({ assetId: asset.id, x: event.clientX, y: event.clientY });
                    }}
                  >
                    <AssetThumbnail image={createReactSafeRgbaImage(asset.image)} label={asset.name} surface={getThumbnailSurface(asset)} />
                    <span className="asset-meta">
                      <strong>{asset.name}</strong>
                      <small>
                        {getAssetTypeDefinition(asset.assetType).shortLabel} / Source {asset.image.width}x{asset.image.height}
                      </small>
                      {isDirty ? <small className="asset-dirty-label">Unsaved in memory</small> : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Remove ${asset.name}`}
                    disabled={isEditorBusy}
                    onClick={() => onRequestAssetDeletion(asset.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {assetMenu ? (
          <div className="context-menu" style={{ left: assetMenu.x, top: assetMenu.y }} onClick={(event) => event.stopPropagation()}>
            <button type="button" disabled={isEditorBusy} onClick={() => onRequestAssetDeletion(assetMenu.assetId)}>
              <Trash2 size={14} />
              Delete asset
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}
