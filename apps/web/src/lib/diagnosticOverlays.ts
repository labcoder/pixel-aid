import type { OutlineColorCandidate } from "@pixelaid/core";
import type { GridCandidate, RGBAImage, Rect } from "@pixelaid/shared";

export type DiagnosticOverlayMode =
  | "none"
  | "changedPixels"
  | "removedAlpha"
  | "paletteRemap"
  | "sourceGrid"
  | "outlineCandidates"
  | "outlineFringeSuspects";

export type DiagnosticOverlayMask = {
  width: number;
  height: number;
  data: Uint8Array;
  color: string;
  alpha: number;
};

export type DiagnosticOverlayGrid = {
  rect: Rect;
  scaleX: number;
  scaleY: number;
  phaseX: number;
  phaseY: number;
  color: string;
  alpha: number;
};

export type DiagnosticOverlayLegendItem = {
  label: string;
  value: string;
  color: string;
};

export type DiagnosticOverlayModel = {
  mode: DiagnosticOverlayMode;
  label: string;
  active: boolean;
  sourceMask?: DiagnosticOverlayMask;
  fixedMask?: DiagnosticOverlayMask;
  sourceGrid?: DiagnosticOverlayGrid;
  legend: DiagnosticOverlayLegendItem[];
  summary: string;
};

export type DiagnosticOverlayInput = {
  mode: DiagnosticOverlayMode;
  sourceImage: RGBAImage | null;
  fixedImage: RGBAImage | null;
  grid?: GridCandidate;
  palette?: readonly string[];
  alphaThreshold?: number;
  outlineCandidateColors?: readonly string[];
  outlineSourceCandidates?: readonly OutlineColorCandidate[];
  outlineFringeCandidates?: readonly OutlineColorCandidate[];
};

type BackgroundSample = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const visibleAlphaThreshold = 16;
const colorDifferenceThreshold = 18;
const paletteRemapDifferenceThreshold = 4;
const outlineColorDistanceThreshold = 30;
const backgroundTolerance = 28;

const overlayMeta: Record<DiagnosticOverlayMode, { label: string; color: string }> = {
  none: { label: "None", color: "#87928d" },
  changedPixels: { label: "Changed pixels", color: "#e85361" },
  removedAlpha: { label: "Removed alpha", color: "#f1c75b" },
  paletteRemap: { label: "Palette remap", color: "#35c6b6" },
  sourceGrid: { label: "Source grid", color: "#f1c75b" },
  outlineCandidates: { label: "Outline candidates", color: "#b78cff" },
  outlineFringeSuspects: { label: "Outline fringe suspects", color: "#ff8f57" }
};

export const diagnosticOverlayOptions: ReadonlyArray<{ mode: DiagnosticOverlayMode; label: string }> = [
  { mode: "none", label: overlayMeta.none.label },
  { mode: "changedPixels", label: overlayMeta.changedPixels.label },
  { mode: "removedAlpha", label: overlayMeta.removedAlpha.label },
  { mode: "paletteRemap", label: overlayMeta.paletteRemap.label },
  { mode: "sourceGrid", label: overlayMeta.sourceGrid.label },
  { mode: "outlineCandidates", label: overlayMeta.outlineCandidates.label },
  { mode: "outlineFringeSuspects", label: overlayMeta.outlineFringeSuspects.label }
];

export function createDiagnosticOverlayModel(input: DiagnosticOverlayInput): DiagnosticOverlayModel {
  const mode = input.mode;
  const meta = overlayMeta[mode];
  if (mode === "none") {
    return inactiveModel(mode, "Diagnostics overlays are off.");
  }

  if (!input.sourceImage) {
    return inactiveModel(mode, "Import an asset to inspect diagnostics overlays.");
  }

  if (mode === "sourceGrid") {
    const grid = input.grid;
    if (!grid) {
      return inactiveModel(mode, "Run a fix or select a grid candidate to inspect source crop and blocks.");
    }

    const sourceRect = getGridSourceRect(input.sourceImage, grid, input.fixedImage);
    return {
      mode,
      label: meta.label,
      active: true,
      sourceGrid: {
        rect: sourceRect,
        scaleX: grid.scaleX,
        scaleY: grid.scaleY,
        phaseX: grid.phaseX,
        phaseY: grid.phaseY,
        color: meta.color,
        alpha: 0.88
      },
      legend: [
        { label: "Source crop", value: `${sourceRect.w}x${sourceRect.h}`, color: meta.color },
        { label: "Block", value: `${formatScale(grid.scaleX)}x${formatScale(grid.scaleY)}`, color: "#35c6b6" },
        { label: "Confidence", value: `${Math.round(grid.confidence * 100)}%`, color: "#8ccf70" }
      ],
      summary: `Showing inferred source crop and ${formatScale(grid.scaleX)}x${formatScale(grid.scaleY)} pseudo-pixel blocks.`
    };
  }

  if (mode === "outlineCandidates") {
    const candidateColors = normalizeHexColors(input.outlineCandidateColors ?? []);
    if (candidateColors.length === 0) {
      return inactiveModel(mode, "No outline candidate colors are available for this asset.");
    }

    const sourceMask = createOutlineCandidateMask(input.sourceImage, candidateColors, input.alphaThreshold ?? visibleAlphaThreshold, meta.color);
    const count = countMask(sourceMask.data);
    return {
      mode,
      label: meta.label,
      active: count > 0,
      sourceMask,
      legend: [
        { label: "Candidate pixels", value: count.toLocaleString(), color: meta.color },
        { label: "Colors", value: String(candidateColors.length), color: "#35c6b6" }
      ],
      summary:
        count > 0
          ? `Highlighting ${count.toLocaleString()} source pixels that match detected outline colors and touch the background.`
          : "Detected outline colors did not match any edge pixels in the current source."
    };
  }

  if (mode === "outlineFringeSuspects") {
    const routedFringeCandidates = input.outlineFringeCandidates ?? [];
    const legacySuspectSourceCandidates = (input.outlineSourceCandidates ?? []).filter(
      (candidate) => candidate.isFringeSuspect === true
    );
    const suspectColors = normalizeHexColors(
      [...routedFringeCandidates, ...legacySuspectSourceCandidates].map((candidate) => candidate.color)
    );
    if (suspectColors.length === 0) {
      return inactiveModel(mode, "No suspect outline fringe candidates are available for this asset.");
    }

    const sourceMask = createOutlineCandidateMask(input.sourceImage, suspectColors, input.alphaThreshold ?? visibleAlphaThreshold, meta.color);
    const count = countMask(sourceMask.data);
    return {
      mode,
      label: meta.label,
      active: count > 0,
      sourceMask,
      legend: [
        { label: "Suspect fringe pixels", value: count.toLocaleString(), color: meta.color },
        { label: "Suspect colors", value: String(suspectColors.length), color: "#35c6b6" }
      ],
      summary:
        count > 0
          ? `Highlighting ${count.toLocaleString()} source pixels that match suspect exterior fringe colors; these are not recommended repair-safe outline sources.`
          : "Suspect outline fringe candidates did not match any source-edge pixels in the current source."
    };
  }

  if (!input.fixedImage || !input.grid) {
    return inactiveModel(mode, "Run Fix to compare input and output diagnostics.");
  }

  if (mode === "removedAlpha") {
    return createComparisonMaskModel({
      mode,
      source: input.sourceImage,
      fixed: input.fixedImage,
      grid: input.grid,
      color: meta.color,
      alpha: 0.72,
      match: ({ sourceAlpha, fixedAlpha }) => sourceAlpha >= visibleAlphaThreshold && fixedAlpha < visibleAlphaThreshold
    });
  }

  if (mode === "paletteRemap") {
    const palette = normalizePalette(input.palette ?? []);
    if (palette.size === 0) {
      return inactiveModel(mode, "Run Fix with palette output to inspect remapped pixels.");
    }

    return createComparisonMaskModel({
      mode,
      source: input.sourceImage,
      fixed: input.fixedImage,
      grid: input.grid,
      color: meta.color,
      alpha: 0.66,
      match: ({ sourceColor, fixedColor, sourceAlpha, fixedAlpha }) => {
        if (sourceAlpha < visibleAlphaThreshold || fixedAlpha < visibleAlphaThreshold) {
          return false;
        }
        return !palette.has(quantizeRgb(sourceColor)) && colorDistance(sourceColor, fixedColor) > paletteRemapDifferenceThreshold;
      }
    });
  }

  return createComparisonMaskModel({
    mode,
    source: input.sourceImage,
    fixed: input.fixedImage,
    grid: input.grid,
    color: meta.color,
    alpha: 0.68,
    match: ({ sourceColor, fixedColor, sourceAlpha, fixedAlpha }) => {
      if (Math.abs(sourceAlpha - fixedAlpha) > 24) {
        return true;
      }
      return sourceAlpha >= visibleAlphaThreshold && fixedAlpha >= visibleAlphaThreshold && colorDistance(sourceColor, fixedColor) > colorDifferenceThreshold;
    }
  });
}

function inactiveModel(mode: DiagnosticOverlayMode, summary: string): DiagnosticOverlayModel {
  return {
    mode,
    label: overlayMeta[mode].label,
    active: false,
    legend: [],
    summary
  };
}

function createComparisonMaskModel({
  mode,
  source,
  fixed,
  grid,
  color,
  alpha,
  match
}: {
  mode: DiagnosticOverlayMode;
  source: RGBAImage;
  fixed: RGBAImage;
  grid: GridCandidate;
  color: string;
  alpha: number;
  match: (sample: { sourceColor: number; fixedColor: number; sourceAlpha: number; fixedAlpha: number }) => boolean;
}): DiagnosticOverlayModel {
  const sourceMask: DiagnosticOverlayMask = {
    width: source.width,
    height: source.height,
    data: new Uint8Array(source.width * source.height),
    color,
    alpha: Math.min(0.5, alpha)
  };
  const fixedMask: DiagnosticOverlayMask = {
    width: fixed.width,
    height: fixed.height,
    data: new Uint8Array(fixed.width * fixed.height),
    color,
    alpha
  };
  const sourceRect = getGridSourceRect(source, grid, fixed);

  for (let y = 0; y < fixed.height; y += 1) {
    for (let x = 0; x < fixed.width; x += 1) {
      const sourceBox = getSourceBox(sourceRect, fixed.width, fixed.height, x, y, source.width, source.height);
      const sample = sampleSourceBox(source, sourceBox);
      const fixedOffset = (y * fixed.width + x) * 4;
      const fixedColor = packRgb(fixed.data[fixedOffset]!, fixed.data[fixedOffset + 1]!, fixed.data[fixedOffset + 2]!);
      const fixedAlpha = fixed.data[fixedOffset + 3]!;
      if (!match({ sourceColor: sample.color, fixedColor, sourceAlpha: sample.alpha, fixedAlpha })) {
        continue;
      }

      fixedMask.data[y * fixed.width + x] = 1;
      markSourceMask(sourceMask.data, source.width, sourceBox);
    }
  }

  const fixedCount = countMask(fixedMask.data);
  const sourceCount = countMask(sourceMask.data);
  const active = fixedCount > 0 || sourceCount > 0;
  return {
    mode,
    label: overlayMeta[mode].label,
    active,
    sourceMask,
    fixedMask,
    legend: [
      { label: "Output pixels", value: fixedCount.toLocaleString(), color },
      { label: "Source area", value: sourceCount.toLocaleString(), color: "#f1c75b" }
    ],
    summary: active ? `${overlayMeta[mode].label} overlay marks ${fixedCount.toLocaleString()} output pixels.` : `No ${overlayMeta[mode].label.toLowerCase()} found for the current fix.`
  };
}

function getGridSourceRect(source: RGBAImage, grid: GridCandidate, fixed: RGBAImage | null | undefined): Rect {
  if (grid.sourceRect) {
    return clampRect(grid.sourceRect, source.width, source.height);
  }

  const outputWidth = fixed?.width ?? grid.outputWidth;
  const outputHeight = fixed?.height ?? grid.outputHeight;
  return clampRect(
    {
      x: grid.phaseX,
      y: grid.phaseY,
      w: outputWidth * grid.scaleX,
      h: outputHeight * grid.scaleY
    },
    source.width,
    source.height
  );
}

function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = clampInteger(rect.x, 0, width);
  const y = clampInteger(rect.y, 0, height);
  const right = clampInteger(rect.x + rect.w, x, width);
  const bottom = clampInteger(rect.y + rect.h, y, height);
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

function getSourceBox(sourceRect: Rect, outputWidth: number, outputHeight: number, x: number, y: number, sourceWidth: number, sourceHeight: number): Rect {
  const left = sourceRect.x + (x / outputWidth) * sourceRect.w;
  const top = sourceRect.y + (y / outputHeight) * sourceRect.h;
  const right = sourceRect.x + ((x + 1) / outputWidth) * sourceRect.w;
  const bottom = sourceRect.y + ((y + 1) / outputHeight) * sourceRect.h;
  return clampRect(
    {
      x: Math.floor(left),
      y: Math.floor(top),
      w: Math.max(1, Math.ceil(right) - Math.floor(left)),
      h: Math.max(1, Math.ceil(bottom) - Math.floor(top))
    },
    sourceWidth,
    sourceHeight
  );
}

function sampleSourceBox(image: RGBAImage, rect: Rect): { color: number; alpha: number } {
  let rTotal = 0;
  let gTotal = 0;
  let bTotal = 0;
  let aTotal = 0;
  let count = 0;

  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    const rowOffset = y * image.width * 4;
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const offset = rowOffset + x * 4;
      rTotal += image.data[offset]!;
      gTotal += image.data[offset + 1]!;
      bTotal += image.data[offset + 2]!;
      aTotal += image.data[offset + 3]!;
      count += 1;
    }
  }

  if (count === 0) {
    return { color: 0, alpha: 0 };
  }

  return {
    color: packRgb(rTotal / count, gTotal / count, bTotal / count),
    alpha: aTotal / count
  };
}

function markSourceMask(mask: Uint8Array, width: number, rect: Rect): void {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    const rowStart = y * width;
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      mask[rowStart + x] = 1;
    }
  }
}

function createOutlineCandidateMask(source: RGBAImage, colors: readonly number[], alphaThreshold: number, color: string): DiagnosticOverlayMask {
  const mask = new Uint8Array(source.width * source.height);
  const background = estimateCornerBackground(source);

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4;
      const alpha = source.data[offset + 3]!;
      if (alpha < alphaThreshold || isBackgroundPixel(source, x, y, background)) {
        continue;
      }

      const sourceColor = packRgb(source.data[offset]!, source.data[offset + 1]!, source.data[offset + 2]!);
      if (!colors.some((candidate) => colorDistance(sourceColor, candidate) <= outlineColorDistanceThreshold)) {
        continue;
      }

      if (hasOutsideNeighbor(source, x, y, alphaThreshold, background)) {
        mask[y * source.width + x] = 1;
      }
    }
  }

  return {
    width: source.width,
    height: source.height,
    data: mask,
    color,
    alpha: 0.72
  };
}

function hasOutsideNeighbor(image: RGBAImage, x: number, y: number, alphaThreshold: number, background: BackgroundSample): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
        return true;
      }
      const offset = (ny * image.width + nx) * 4;
      if (image.data[offset + 3]! < alphaThreshold || isBackgroundPixel(image, nx, ny, background)) {
        return true;
      }
    }
  }
  return false;
}

function isBackgroundPixel(image: RGBAImage, x: number, y: number, background: BackgroundSample): boolean {
  const offset = (y * image.width + x) * 4;
  return (
    Math.abs(image.data[offset]! - background.r) +
      Math.abs(image.data[offset + 1]! - background.g) +
      Math.abs(image.data[offset + 2]! - background.b) +
      Math.abs(image.data[offset + 3]! - background.a) <=
    backgroundTolerance
  );
}

function estimateCornerBackground(image: RGBAImage): BackgroundSample {
  const sampleSize = Math.max(1, Math.min(8, Math.floor(Math.min(image.width, image.height) / 4)));
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      const offsets = [
        (y * image.width + x) * 4,
        (y * image.width + image.width - sampleSize + x) * 4,
        ((image.height - sampleSize + y) * image.width + x) * 4,
        ((image.height - sampleSize + y) * image.width + image.width - sampleSize + x) * 4
      ];
      for (const offset of offsets) {
        r += image.data[offset]!;
        g += image.data[offset + 1]!;
        b += image.data[offset + 2]!;
        a += image.data[offset + 3]!;
        count += 1;
      }
    }
  }

  return {
    r: r / count,
    g: g / count,
    b: b / count,
    a: a / count
  };
}

function normalizePalette(palette: readonly string[]): Set<number> {
  return new Set(normalizeHexColors(palette).map(quantizeRgb));
}

function normalizeHexColors(colors: readonly string[]): number[] {
  const seen = new Set<number>();
  const normalized: number[] = [];
  for (const color of colors) {
    const parsed = parseHexColor(color);
    if (parsed === null || seen.has(parsed)) {
      continue;
    }
    seen.add(parsed);
    normalized.push(parsed);
  }
  return normalized;
}

function parseHexColor(value: string): number | null {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }
  return Number.parseInt(hex, 16);
}

function quantizeRgb(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return packRgb(Math.round(r / 8) * 8, Math.round(g / 8) * 8, Math.round(b / 8) * 8);
}

function packRgb(r: number, g: number, b: number): number {
  return (clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}

function colorDistance(left: number, right: number): number {
  return (
    Math.abs(((left >> 16) & 0xff) - ((right >> 16) & 0xff)) +
    Math.abs(((left >> 8) & 0xff) - ((right >> 8) & 0xff)) +
    Math.abs((left & 0xff) - (right & 0xff))
  );
}

function countMask(mask: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) {
    count += mask[index] === 1 ? 1 : 0;
  }
  return count;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}

function formatScale(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
