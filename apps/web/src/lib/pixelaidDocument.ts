import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { AssetProvenance, AssetType, AssetTypeWarning, GridCandidate, PixelFixResult } from "@pixelaid/shared";

export const pixelaidDocumentVersion = 1;
export const pixelaidDocumentFormat = "pixelaid.asset-document";

export type PixelAidDocumentAssetMetadata = {
  id: string;
  name: string;
  importedAt: string;
  width: number;
  height: number;
  assetType: AssetType;
  assetTypeSource: "auto" | "manual";
  assetTypeWarnings: AssetTypeWarning[];
  categoryReason: string;
  categoryConfidence: number;
  provenance?: AssetProvenance;
};

export type PixelAidDocumentManifest = {
  format: typeof pixelaidDocumentFormat;
  version: typeof pixelaidDocumentVersion;
  app: {
    name: "PixelAid";
    version: string;
  };
  createdAt: string;
  asset: PixelAidDocumentAssetMetadata;
  files: {
    source: "source.png";
    session: "metadata/session.json";
    fixed?: "fixed.png";
    gridCandidates?: "metadata/grid-candidates.json";
    sourceAnalysis?: "metadata/source-analysis.json";
    qualityReports?: "metadata/quality-reports.json";
  };
};

export type PixelAidDocumentFixResult = Omit<PixelFixResult, "image">;

export type PixelAidDocumentArchiveOptions = {
  appVersion: string;
  asset: PixelAidDocumentAssetMetadata;
  sourcePngBytes: Uint8Array;
  session: unknown;
  fixedPngBytes?: Uint8Array;
  gridCandidates?: GridCandidate[];
  sourceAnalysis?: unknown;
  qualityReports?: unknown;
  createdAt?: string;
};

export type PixelAidDocumentArchive = {
  manifest: PixelAidDocumentManifest;
  bytes: Uint8Array;
};

export type ParsedPixelAidDocumentArchive = {
  manifest: PixelAidDocumentManifest;
  sourcePngBytes: Uint8Array;
  fixedPngBytes?: Uint8Array;
  session: unknown;
  gridCandidates?: GridCandidate[];
  sourceAnalysis?: unknown;
  qualityReports?: unknown;
};

export function isPixelAidDocumentFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".pixelaid");
}

export function defaultPixelAidDocumentFilename(filename: string): string {
  return `${sanitizeDocumentBaseName(filename)}.pixelaid`;
}

export function createPixelAidDocumentArchive(options: PixelAidDocumentArchiveOptions): PixelAidDocumentArchive {
  const manifest: PixelAidDocumentManifest = {
    format: pixelaidDocumentFormat,
    version: pixelaidDocumentVersion,
    app: {
      name: "PixelAid",
      version: options.appVersion
    },
    createdAt: options.createdAt ?? new Date().toISOString(),
    asset: options.asset,
    files: {
      source: "source.png",
      session: "metadata/session.json",
      ...(options.fixedPngBytes ? { fixed: "fixed.png" } : {}),
      ...(options.gridCandidates ? { gridCandidates: "metadata/grid-candidates.json" } : {}),
      ...(options.sourceAnalysis ? { sourceAnalysis: "metadata/source-analysis.json" } : {}),
      ...(options.qualityReports ? { qualityReports: "metadata/quality-reports.json" } : {})
    }
  };

  const files: Record<string, Uint8Array> = {
    "manifest.json": jsonBytes(manifest),
    [manifest.files.source]: options.sourcePngBytes,
    [manifest.files.session]: jsonBytes(options.session)
  };

  if (manifest.files.fixed && options.fixedPngBytes) {
    files[manifest.files.fixed] = options.fixedPngBytes;
  }
  if (manifest.files.gridCandidates && options.gridCandidates) {
    files[manifest.files.gridCandidates] = jsonBytes(options.gridCandidates);
  }
  if (manifest.files.sourceAnalysis && options.sourceAnalysis) {
    files[manifest.files.sourceAnalysis] = jsonBytes(options.sourceAnalysis);
  }
  if (manifest.files.qualityReports && options.qualityReports) {
    files[manifest.files.qualityReports] = jsonBytes(options.qualityReports);
  }

  return {
    manifest,
    bytes: zipSync(files, { level: 6 })
  };
}

export function readPixelAidDocumentArchive(bytes: Uint8Array): ParsedPixelAidDocumentArchive {
  const entries = unzipSync(bytes);
  const manifest = parseJsonEntry<PixelAidDocumentManifest>(entries, "manifest.json");
  validatePixelAidDocumentManifest(manifest);

  const sourcePngBytes = getRequiredEntry(entries, manifest.files.source);
  const fixedPngBytes = manifest.files.fixed ? entries[manifest.files.fixed] : undefined;
  const session = parseJsonEntry(entries, manifest.files.session);

  return {
    manifest,
    sourcePngBytes,
    ...(fixedPngBytes ? { fixedPngBytes } : {}),
    session,
    ...(manifest.files.gridCandidates ? { gridCandidates: parseJsonEntry<GridCandidate[]>(entries, manifest.files.gridCandidates) } : {}),
    ...(manifest.files.sourceAnalysis ? { sourceAnalysis: parseJsonEntry(entries, manifest.files.sourceAnalysis) } : {}),
    ...(manifest.files.qualityReports ? { qualityReports: parseJsonEntry(entries, manifest.files.qualityReports) } : {})
  };
}

export function validatePixelAidDocumentManifest(manifest: PixelAidDocumentManifest): void {
  if (manifest.format !== pixelaidDocumentFormat) {
    throw new Error("File is not a PixelAid asset document");
  }

  if (manifest.version > pixelaidDocumentVersion) {
    throw new Error(`PixelAid document version ${manifest.version} is newer than this app supports`);
  }

  if (manifest.version < 1) {
    throw new Error("PixelAid document version is invalid");
  }

  if (manifest.files.source !== "source.png") {
    throw new Error("PixelAid document is missing source.png");
  }

  if (manifest.files.session !== "metadata/session.json") {
    throw new Error("PixelAid document is missing metadata/session.json");
  }
}

export function serializePixelFixResultForDocument(result: PixelFixResult | null): PixelAidDocumentFixResult | null {
  if (!result) {
    return null;
  }

  return {
    palette: result.palette,
    grid: result.grid,
    metrics: result.metrics,
    settings: result.settings,
    ...(result.diagnostics ? { diagnostics: result.diagnostics } : {})
  };
}

export function hydratePixelFixResultFromDocument(payload: PixelAidDocumentFixResult | null, image: PixelFixResult["image"] | null): PixelFixResult | null {
  if (!payload || !image) {
    return null;
  }

  return {
    ...payload,
    image
  };
}

function parseJsonEntry<T = unknown>(entries: Record<string, Uint8Array>, path: string): T {
  return JSON.parse(strFromU8(getRequiredEntry(entries, path))) as T;
}

function getRequiredEntry(entries: Record<string, Uint8Array>, path: string): Uint8Array {
  const entry = entries[path];
  if (!entry) {
    throw new Error(`PixelAid document is missing ${path}`);
  }
  return entry;
}

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

function sanitizeDocumentBaseName(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  const safe = withoutExtension
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return safe || "pixelaid_asset";
}
