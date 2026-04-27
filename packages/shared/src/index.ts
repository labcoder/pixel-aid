export const PIXELAID_APP_NAME = "PixelAid";
export const PIXELAID_VERSION = "0.1.0";

export type {
  AlphaMode,
  AlphaCleanupDiagnostics,
  AlphaCleanupSettings,
  AnimationTag,
  AssetMode,
  AssetType,
  AssetTypeClassification,
  AssetTypeSupport,
  AssetTypeWarning,
  DownscaleMethod,
  FixMetrics,
  FixOptions,
  GridCandidate,
  GridCandidateDiagnostics,
  GridDriftDiagnostics,
  OutlineMode,
  PaletteDiagnostics,
  PaletteDitheringMode,
  PaletteDriftDiagnostics,
  PaletteLockScope,
  PaletteMode,
  PaletteSettings,
  PaletteStrategy,
  Pivot,
  PixelAssetManifest,
  PixelFixDiagnostics,
  PixelFixResult,
  Rect,
  RGBAImage,
  SheetLayoutDetection,
  SheetLayoutDiagnostics,
  SheetRowLabel,
  SheetSliceOptions,
  SpriteAnimation,
  SpriteFrame,
  TransferableImage,
  WorkerProgress
} from "./types";

export { assetTypeDefinitions, assetTypeToMode, getAssetTypeDefinition } from "./assetTypes";
export type { AssetTypeDefinition } from "./assetTypes";
