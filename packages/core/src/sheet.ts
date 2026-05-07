import type {
  Rect,
  RGBAImage,
  SheetConfidenceDetail,
  SheetConditioningDiagnostics,
  SheetLayoutDetection,
  SheetLayoutDiagnostics,
  SheetLayoutConfidenceModel,
  SheetRowConfidenceExplanation,
  SheetRowLabel,
  SheetSliceOptions,
  SpriteFrame
} from "@pixelaid/shared";
import { analyzeSheetConditioning } from "./sheetConditioning";

type Band = {
  start: number;
  end: number;
};

type Segment = {
  x: number;
  w: number;
};

type ComponentMergeResult = {
  segments: Segment[];
  usedComponentMerging: boolean;
  mergedComponentCount: number;
};

type DriftNormalizationResult = {
  segments: Segment[];
  usedDriftFitting: boolean;
  maxCenterDriftPx: number;
};

type ResolvedSegments = {
  segments: Segment[];
  usedOutlinedCells: boolean;
  usedContentCentering: boolean;
  usedComponentMerging: boolean;
  usedDriftFitting: boolean;
  mergedComponentCount: number;
  maxCenterDriftPx: number;
  rowLabel?: Omit<SheetRowLabel, "rowIndex">;
};

type DetectedRow = {
  band: Band;
  segments: Segment[];
  usedOutlinedCells: boolean;
  usedContentCentering: boolean;
  usedComponentMerging: boolean;
  usedDriftFitting: boolean;
  mergedComponentCount: number;
  maxCenterDriftPx: number;
  rowLabel?: Omit<SheetRowLabel, "rowIndex">;
};

type LabelTemplate = {
  name: string;
  rawText: string;
  text: string;
};

type BinaryTemplate = {
  width: number;
  height: number;
  data: Uint8Array;
};

const labelConfidenceThreshold = 0.72;
const regularAtlasNativeSizes = [16, 24, 32, 48, 64, 96, 128, 192, 208, 256] as const;

const rowLabelTemplates: LabelTemplate[] = [
  { name: "idle", rawText: "IDLE", text: "IDLE" },
  { name: "walk", rawText: "WALK", text: "WALK" },
  { name: "jump", rawText: "JUMP", text: "JUMP" },
  { name: "run", rawText: "RUN", text: "RUN" },
  { name: "cast", rawText: "CAST", text: "CAST" },
  { name: "shoot", rawText: "SHOOT", text: "SHOOT" },
  { name: "take_damage", rawText: "TAKE DAMAGE", text: "TAKE\nDAMAGE" },
  { name: "death", rawText: "DEATH", text: "DEATH" }
];

const labelGlyphs: Record<string, readonly string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"]
};

export function sliceSheetFrames(options: SheetSliceOptions): SpriteFrame[] {
  validateSliceOptions(options);
  const frames: SpriteFrame[] = [];
  const pivot = options.pivot ?? { x: Math.floor(options.frameWidth / 2), y: options.frameHeight };

  for (let row = 0; row < options.rows; row += 1) {
    for (let column = 0; column < options.columns; column += 1) {
      const index = row * options.columns + column;
      const x = options.margin + column * (options.frameWidth + options.spacing);
      const y = options.margin + row * (options.frameHeight + options.spacing);

      frames.push({
        name: `frame_${index.toString().padStart(3, "0")}`,
        rect: { x, y, w: options.frameWidth, h: options.frameHeight },
        pivot: { ...pivot },
        durationMs: 120
      });
    }
  }

  return frames;
}

export function detectSheetLayout(image: RGBAImage): SheetLayoutDetection {
  const background = sampleCornerBackground(image);
  const sourceConditioning = analyzeSheetConditioning(image);
  const regularAtlas = detectRegularAtlasLayout(image, background, sourceConditioning);
  const rowCounts = new Uint16Array(image.height);
  const rowThreshold = Math.max(4, Math.floor(image.width * 0.018));

  for (let y = 0; y < image.height; y += 1) {
    let count = 0;
    for (let x = 0; x < image.width; x += 1) {
      if (isForeground(image, x, y, background)) {
        count += 1;
      }
    }
    rowCounts[y] = count;
  }

  const rowBands = bandsFromCounts(rowCounts, rowThreshold, 3, 12);
  const candidateRows = rowBands
    .map((band) => {
      const resolved = resolveFrameSegments(image, band, background);
      const row: DetectedRow = {
        band,
        segments: resolved.segments,
        usedOutlinedCells: resolved.usedOutlinedCells,
        usedContentCentering: resolved.usedContentCentering,
        usedComponentMerging: resolved.usedComponentMerging,
        usedDriftFitting: resolved.usedDriftFitting,
        mergedComponentCount: resolved.mergedComponentCount,
        maxCenterDriftPx: resolved.maxCenterDriftPx,
        ...(resolved.rowLabel ? { rowLabel: resolved.rowLabel } : {})
      };
      return expandRowToSubtleCellBounds(image, row, background);
    })
    .filter((row) => row.segments.length > 0);
  const footerFilter = filterFooterRows(candidateRows, image.height);
  const conditioning = withFooterConditioningIssue(sourceConditioning, footerFilter.removedCount);
  const hasPresentationArtifacts = conditioning.issues.some((issue) => issue.code === "presentation-sheet-artifacts");
  const rawRows = hasPresentationArtifacts
    ? normalizePresentationRows(alignDetectedRowsToSharedColumns(footerFilter.rows), image.width, image.height)
    : alignDetectedRowsToSharedColumns(footerFilter.rows);

  if (rawRows.length === 0) {
    return regularAtlas ?? emptyDetection("No repeated sheet rows detected");
  }

  const frameSizeRows = selectFrameSizeReferenceRows(rawRows);
  const frameWidths = frameSizeRows.flatMap((row) => {
    const referenceWidth = rowReferenceCellWidth(row);
    return row.segments.map((segment) => Math.max(segment.w, referenceWidth));
  });
  const frameHeights = frameSizeRows.map((row) => row.band.end - row.band.start + 1);
  const frameWidth = Math.max(1, medianInteger(frameWidths));
  const frameHeight = Math.max(1, medianInteger(frameHeights));
  const rowFrameCounts = rawRows.map((row) => row.segments.length);
  const rows = rawRows.length;
  const columns = Math.max(...rowFrameCounts);
  const margin = Math.min(...rawRows.flatMap((row) => row.segments.map((segment) => segment.x)));
  const gaps = rawRows.flatMap((row) => gapsBetween(row.segments));
  const spacing = gaps.length > 0 ? Math.max(0, medianInteger(gaps)) : 0;
  const frames: SpriteFrame[] = [];
  const rowRects: Rect[] = [];
  const usedRowNames = new Set<string>();
  const rowNames = rawRows.map((row, rowIndex) =>
    row.rowLabel && row.rowLabel.confidence >= labelConfidenceThreshold
      ? uniqueAnimationName(row.rowLabel.name, usedRowNames)
      : uniqueAnimationName(`row_${rowIndex + 1}`, usedRowNames)
  );
  const rowLabels: SheetRowLabel[] = rawRows.flatMap((row, rowIndex) =>
    row.rowLabel && row.rowLabel.confidence >= labelConfidenceThreshold
      ? [
          {
            ...row.rowLabel,
            rowIndex,
            name: rowNames[rowIndex]!
          }
        ]
      : []
  );

  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
    const row = rawRows[rowIndex]!;
    const rowName = rowNames[rowIndex]!;
    const minX = Math.min(...row.segments.map((segment) => segment.x));
    const maxX = Math.max(...row.segments.map((segment) => segment.x + segment.w));
    rowRects.push(clampRectInside({ x: minX, y: row.band.start, w: maxX - minX, h: row.band.end - row.band.start + 1 }, image.width, image.height));

    for (let column = 0; column < row.segments.length; column += 1) {
      const segment = row.segments[column]!;
      const rect = clampRectInside({ x: segment.x, y: row.band.start, w: frameWidth, h: frameHeight }, image.width, image.height);
      const sourceRect = hasPresentationArtifacts ? detectPresentationContentBounds(image, rect, background) : rect;
      frames.push({
        name: `${rowName}_${column.toString().padStart(3, "0")}`,
        rect,
        sourceRect,
        pivot: { x: Math.floor(frameWidth / 2), y: frameHeight },
        durationMs: 120,
        tags: [rowName]
      });
    }
  }

  const rowAnimations = rowFrameCounts.map((frameCount, index) => {
    const rowName = rowNames[index]!;
    return {
      name: rowName,
      frameNames: Array.from({ length: frameCount }, (_, frameIndex) => `${rowName}_${frameIndex.toString().padStart(3, "0")}`),
      fps: 8,
      loop: true
    };
  });
  const warnings: string[] = [];
  if (new Set(rowFrameCounts).size > 1) {
    warnings.push("Rows contain different frame counts; rectangular sheet controls will include empty cells unless explicit frames are used.");
  }
  if (rawRows.some((row) => row.usedOutlinedCells)) {
    warnings.push("Detected outlined cell separators; frame boxes may need review if the grid lines are decorative.");
  }
  if (rawRows.some((row) => row.usedContentCentering)) {
    warnings.push("Normalized uneven gutters from content centers; inspect frame boxes before export.");
  }
  if (rawRows.some((row) => row.usedComponentMerging)) {
    warnings.push("Merged nearby disconnected components into frame boxes; inspect effect-heavy frames.");
  }
  if (rawRows.some((row) => row.usedDriftFitting)) {
    warnings.push("Tolerated mild frame-center drift while fitting sheet columns; inspect frame boxes before export.");
  }
  if (rows < 2 || columns < 2) {
    warnings.push("Detected layout has too few repeated frames for high confidence.");
  }
  if (hasPresentationArtifacts) {
    warnings.push("Presentation-style sheet artifacts detected; captions, brackets, and decorative background should be ignored before final output.");
  }

  const repeatedConfidence = Math.min(0.96, 0.52 + Math.min(0.24, rows * 0.06) + Math.min(0.2, columns * 0.04));
  const confidencePenalty = rawRows.some((row) => row.usedDriftFitting) ? 0.04 : 0;
  const confidence = rows >= 2 && columns >= 2 ? Math.max(0.2, repeatedConfidence - confidencePenalty) : Math.min(0.4, repeatedConfidence);
  const diagnostics = createSheetDiagnostics({
    rows,
    columns,
    frameHeights,
    pitchPx: frameWidth + spacing,
    mergedComponentCount: rawRows.reduce((total, row) => total + row.mergedComponentCount, 0),
    maxCenterDriftPx: Math.max(0, ...rawRows.map((row) => row.maxCenterDriftPx)),
    usedComponentMerging: rawRows.some((row) => row.usedComponentMerging),
    usedDriftFitting: rawRows.some((row) => row.usedDriftFitting),
    usedOutlinedCells: rawRows.some((row) => row.usedOutlinedCells),
    usedContentCentering: rawRows.some((row) => row.usedContentCentering),
    labelNames: rowLabels.map((label) => label.name),
    labelRowCount: rowLabels.length,
    labelConfidences: rawRows.map((row) => row.rowLabel?.confidence ?? 0),
    rowExplanations: rawRows,
    warnings,
    conditioning
  });

  const detectedLayout: SheetLayoutDetection = {
    frameWidth,
    frameHeight,
    rows,
    columns,
    margin,
    spacing,
    frames,
    rowRects,
    rowFrameCounts,
    rowAnimations,
    rowLabels,
    confidence,
    diagnostics,
    reason: `Detected ${rows} sprite-sheet row${rows === 1 ? "" : "s"} with up to ${columns} frame${columns === 1 ? "" : "s"} per row`,
    warnings
  };

  return preferRegularAtlasLayout(detectedLayout, regularAtlas);
}

function preferRegularAtlasLayout(detected: SheetLayoutDetection, regularAtlas: SheetLayoutDetection | undefined): SheetLayoutDetection {
  if (!regularAtlas || regularAtlas.confidence < 0.7) {
    return detected;
  }

  if (detected.confidence >= regularAtlas.confidence + 0.08 && detected.frames.length >= regularAtlas.frames.length * 0.5) {
    return detected;
  }

  return regularAtlas;
}

function detectRegularAtlasLayout(
  image: RGBAImage,
  background: [number, number, number, number],
  conditioning: SheetConditioningDiagnostics,
): SheetLayoutDetection | undefined {
  if (image.width < 384 || image.height < 384) {
    return undefined;
  }

  const sourceRatio = image.width / image.height;
  if (sourceRatio < 0.55 || sourceRatio > 1.25) {
    return undefined;
  }

  let best:
    | {
        columns: number;
        rows: number;
        frameWidth: number;
        frameHeight: number;
        score: number;
      }
    | undefined;

  for (let rows = 2; rows <= 12; rows += 1) {
    const heightCandidate = regularAtlasFrameSize(image.height, rows);
    if (!heightCandidate) {
      continue;
    }
    const frameHeight = heightCandidate.size;
    if (frameHeight < 32 || frameHeight > 320) {
      continue;
    }

    for (let columns = 4; columns <= 12; columns += 1) {
      const widthCandidate = regularAtlasFrameSize(image.width, columns);
      if (!widthCandidate) {
        continue;
      }
      const frameWidth = widthCandidate.size;
      if (frameWidth < 32 || frameWidth > 320) {
        continue;
      }

      const cellRatio = frameWidth / frameHeight;
      if (cellRatio < 0.45 || cellRatio > 1.75) {
        continue;
      }

      const occupancy = measureAtlasOccupancy(image, columns, rows, frameWidth, frameHeight, background);
      if (occupancy.activeRatio < 0.5 || occupancy.activeCells < 8 || occupancy.signatureRepeatRatio < 0.3) {
        continue;
      }

      const commonSizeBonus =
        (regularAtlasNativeSizes.includes(frameWidth as (typeof regularAtlasNativeSizes)[number]) ? 0.08 : 0) +
        (regularAtlasNativeSizes.includes(frameHeight as (typeof regularAtlasNativeSizes)[number]) ? 0.08 : 0);
      const codexPetAtlas = columns === 8 && rows === 9 && frameWidth >= 128 && frameHeight >= 128;
      const hasCommonFrameSize = commonSizeBonus >= 0.16;
      if (!codexPetAtlas && !hasCommonFrameSize) {
        continue;
      }

      const dimensionBonus = Math.min(0.2, Math.log2(Math.max(2, columns * rows)) / 30);
      const frameCountBonus = Math.min(0.16, (columns * rows) / 72 * 0.16);
      const aspectBonus = 0.16 - Math.min(0.16, Math.abs(Math.log(cellRatio)) * 0.12);
      const nearDivisibilityPenalty = Math.min(0.08, (widthCandidate.delta + heightCandidate.delta) / Math.max(1, frameWidth + frameHeight));
      const score = codexPetAtlas
        ? 0.99 - nearDivisibilityPenalty
        : Math.min(
            0.96,
            0.24 +
              occupancy.activeRatio * 0.18 +
              occupancy.consistency * 0.1 +
              occupancy.signatureRepeatRatio * 0.18 +
              commonSizeBonus +
              dimensionBonus +
              frameCountBonus +
              aspectBonus -
              nearDivisibilityPenalty
          );

      if (!best || score > best.score) {
        best = { columns, rows, frameWidth, frameHeight, score };
      }
    }
  }

  if (!best || best.score < 0.7) {
    return undefined;
  }

  return createRegularAtlasLayout({
    columns: best.columns,
    rows: best.rows,
    frameWidth: best.frameWidth,
    frameHeight: best.frameHeight,
    confidence: best.score,
    conditioning,
    reason: `Detected a regular ${best.columns}x${best.rows} atlas grid with repeated occupied frame cells.`
  });
}

function regularAtlasFrameSize(sourceSize: number, divisions: number): { size: number; delta: number } | undefined {
  const size = Math.max(1, Math.round(sourceSize / divisions));
  const delta = Math.abs(size * divisions - sourceSize);
  const maxDelta = Math.max(1, Math.min(4, Math.ceil(divisions * 0.5)));
  return delta <= maxDelta ? { size, delta } : undefined;
}

function createRegularAtlasLayout({
  columns,
  rows,
  frameWidth,
  frameHeight,
  confidence,
  conditioning,
  reason
}: {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  confidence: number;
  conditioning: SheetConditioningDiagnostics;
  reason: string;
}): SheetLayoutDetection {
  const frames: SpriteFrame[] = [];
  const rowFrameCounts = Array.from({ length: rows }, () => columns);
  const rowRects: Rect[] = [];
  const rowLabels: SheetRowLabel[] = [];
  const rowAnimations = [];

  for (let row = 0; row < rows; row += 1) {
    const rowName = `row_${row + 1}`;
    const frameNames: string[] = [];
    const rowY = row * frameHeight;
    rowRects.push({ x: 0, y: rowY, w: columns * frameWidth, h: frameHeight });
    rowLabels.push({
      rowIndex: row,
      name: rowName,
      rawText: rowName,
      confidence: 0.82,
      rect: { x: 0, y: rowY, w: 0, h: frameHeight }
    });

    for (let column = 0; column < columns; column += 1) {
      const x = column * frameWidth;
      const name = `${rowName}_${column.toString().padStart(3, "0")}`;
      frameNames.push(name);
      frames.push({
        name,
        rect: { x, y: rowY, w: frameWidth, h: frameHeight },
        sourceRect: { x, y: rowY, w: frameWidth, h: frameHeight },
        pivot: { x: Math.floor(frameWidth / 2), y: frameHeight },
        durationMs: 120,
        tags: [rowName]
      });
    }

    rowAnimations.push({
      name: rowName,
      frameNames,
      fps: 8,
      loop: true
    });
  }

  const diagnostics = createSheetDiagnostics({
    rows,
    columns,
    frameHeights: Array.from({ length: rows }, () => frameHeight),
    pitchPx: frameWidth,
    mergedComponentCount: 0,
    maxCenterDriftPx: 0,
    usedComponentMerging: false,
    usedDriftFitting: false,
    usedOutlinedCells: false,
    usedContentCentering: false,
    labelNames: [],
    labelRowCount: 0,
    labelConfidences: [],
    warnings: ["Detected a regular atlas grid; inspect intentionally unused cells before export."],
    conditioning
  });
  diagnostics.notes.push(reason);

  return {
    frameWidth,
    frameHeight,
    rows,
    columns,
    margin: 0,
    spacing: 0,
    frames,
    rowRects,
    rowFrameCounts,
    rowAnimations,
    rowLabels,
    confidence,
    diagnostics,
    reason,
    warnings: ["Detected a regular atlas grid; inspect intentionally unused cells before export."]
  };
}

function measureAtlasOccupancy(
  image: RGBAImage,
  columns: number,
  rows: number,
  frameWidth: number,
  frameHeight: number,
  background: [number, number, number, number],
): { activeCells: number; activeRatio: number; consistency: number; signatureRepeatRatio: number } {
  const ratios: number[] = [];
  const signatures: string[] = [];
  const sampleColumns = Math.min(24, Math.max(8, Math.floor(frameWidth / 8)));
  const sampleRows = Math.min(24, Math.max(8, Math.floor(frameHeight / 8)));
  const threshold = 54;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let active = 0;
      let total = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      const startX = column * frameWidth;
      const startY = row * frameHeight;

      for (let sy = 0; sy < sampleRows; sy += 1) {
        const y = Math.min(image.height - 1, startY + Math.floor(((sy + 0.5) * frameHeight) / sampleRows));
        for (let sx = 0; sx < sampleColumns; sx += 1) {
          const x = Math.min(image.width - 1, startX + Math.floor(((sx + 0.5) * frameWidth) / sampleColumns));
          const offset = (y * image.width + x) * 4;
          const distance =
            Math.abs(image.data[offset]! - background[0]) +
            Math.abs(image.data[offset + 1]! - background[1]) +
            Math.abs(image.data[offset + 2]! - background[2]) +
            Math.abs(image.data[offset + 3]! - background[3]);
          if (distance > threshold) {
            active += 1;
            r += image.data[offset]!;
            g += image.data[offset + 1]!;
            b += image.data[offset + 2]!;
          }
          total += 1;
        }
      }

      const ratio = active / Math.max(1, total);
      ratios.push(ratio);
      if (ratio >= 0.025) {
        const invActive = 1 / Math.max(1, active);
        signatures.push([
          Math.round((r * invActive) / 32),
          Math.round((g * invActive) / 32),
          Math.round((b * invActive) / 32),
          Math.round(ratio * 8)
        ].join(","));
      }
    }
  }

  const activeRatios = ratios.filter((ratio) => ratio >= 0.025);
  const mean = activeRatios.reduce((sum, ratio) => sum + ratio, 0) / Math.max(1, activeRatios.length);
  const variance = activeRatios.reduce((sum, ratio) => sum + Math.abs(ratio - mean), 0) / Math.max(1, activeRatios.length);
  const signatureCounts = new Map<string, number>();
  for (const signature of signatures) {
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
  }
  const repeatedSignatures = signatures.filter((signature) => (signatureCounts.get(signature) ?? 0) > 1).length;

  return {
    activeCells: activeRatios.length,
    activeRatio: activeRatios.length / Math.max(1, ratios.length),
    consistency: Math.max(0, 1 - variance / Math.max(0.01, mean)),
    signatureRepeatRatio: repeatedSignatures / Math.max(1, signatures.length)
  };
}

function sampleCornerBackground(image: RGBAImage): [number, number, number, number] {
  const sampleSize = Math.max(1, Math.min(12, Math.floor(Math.min(image.width, image.height) / 24)));
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      const offsets = [
        ((y * image.width + x) * 4),
        ((y * image.width + image.width - sampleSize + x) * 4),
        (((image.height - sampleSize + y) * image.width + x) * 4),
        (((image.height - sampleSize + y) * image.width + image.width - sampleSize + x) * 4)
      ];
      for (let i = 0; i < offsets.length; i += 1) {
        const offset = offsets[i]!;
        r += image.data[offset]!;
        g += image.data[offset + 1]!;
        b += image.data[offset + 2]!;
        a += image.data[offset + 3]!;
        count += 1;
      }
    }
  }

  return [r / count, g / count, b / count, a / count];
}

function isForeground(image: RGBAImage, x: number, y: number, background: [number, number, number, number]): boolean {
  const offset = (y * image.width + x) * 4;
  const distance =
    Math.abs(image.data[offset]! - background[0]) +
    Math.abs(image.data[offset + 1]! - background[1]) +
    Math.abs(image.data[offset + 2]! - background[2]) +
    Math.abs(image.data[offset + 3]! - background[3]);
  return distance > 42;
}

function detectPresentationContentBounds(image: RGBAImage, rect: Rect, background: [number, number, number, number]): Rect {
  let minX = rect.x + rect.w;
  let minY = rect.y + rect.h;
  let maxX = rect.x - 1;
  let maxY = rect.y - 1;

  const xEnd = Math.min(image.width, rect.x + rect.w);
  const yEnd = Math.min(image.height, rect.y + rect.h);
  for (let y = Math.max(0, rect.y); y < yEnd; y += 1) {
    for (let x = Math.max(0, rect.x); x < xEnd; x += 1) {
      if (!isPresentationSpritePixel(image, x, y, background)) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return rect;
  }

  const padding = 2;
  const x = Math.max(rect.x, minX - padding);
  const y = Math.max(rect.y, minY - padding);
  const right = Math.min(rect.x + rect.w, maxX + padding + 1);
  const bottom = Math.min(rect.y + rect.h, maxY + padding + 1);
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

function isPresentationSpritePixel(image: RGBAImage, x: number, y: number, background: [number, number, number, number]): boolean {
  const offset = (y * image.width + x) * 4;
  const r = image.data[offset]!;
  const g = image.data[offset + 1]!;
  const b = image.data[offset + 2]!;
  const a = image.data[offset + 3]!;
  if (a <= 0) {
    return false;
  }

  const backgroundDistance = Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]) + Math.abs(a - background[3]);
  if (backgroundDistance <= 28) {
    return false;
  }

  const channelSpread = Math.max(r, g, b) - Math.min(r, g, b);
  const luminance = (r + g + b) / 3;
  const checkerboardGray = channelSpread <= 18 && luminance >= 42 && luminance <= 118;
  const captionOrBracket = channelSpread <= 52 && luminance >= 168;
  return !checkerboardGray && !captionOrBracket;
}

function bandsFromCounts(counts: Uint16Array, threshold: number, maxGap: number, minSize: number): Band[] {
  const bands: Band[] = [];
  let start = -1;
  let lastActive = -1;

  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index]! >= threshold) {
      if (start < 0) {
        start = index;
      }
      lastActive = index;
      continue;
    }

    if (start >= 0 && index - lastActive > maxGap) {
      if (lastActive - start + 1 >= minSize) {
        bands.push({ start, end: lastActive });
      }
      start = -1;
      lastActive = -1;
    }
  }

  if (start >= 0 && lastActive - start + 1 >= minSize) {
    bands.push({ start, end: lastActive });
  }

  return bands;
}

function segmentsForBand(image: RGBAImage, band: Band, background: [number, number, number, number]): Segment[] {
  const counts = new Uint16Array(image.width);
  const threshold = Math.max(2, Math.floor((band.end - band.start + 1) * 0.08));

  for (let x = 0; x < image.width; x += 1) {
    let count = 0;
    for (let y = band.start; y <= band.end; y += 1) {
      if (isForeground(image, x, y, background)) {
        count += 1;
      }
    }
    counts[x] = count;
  }

  return bandsFromCounts(counts, threshold, 1, 12).map((segment) => ({
    x: segment.start,
    w: segment.end - segment.start + 1
  }));
}

function splitMergedFrameSegments(
  image: RGBAImage,
  band: Band,
  background: [number, number, number, number],
  segments: Segment[]
): Segment[] {
  if (segments.length === 0) {
    return segments;
  }

  const bandHeight = band.end - band.start + 1;
  const baseThreshold = Math.max(2, Math.floor(bandHeight * 0.08));
  const typicalWidth =
    segments.length >= 2 ? Math.max(1, medianInteger(segments.map((segment) => segment.w))) : Math.max(1, Math.round(bandHeight * 0.9));
  const splitSegments: Segment[] = [];
  let didSplit = false;

  for (const segment of segments) {
    if (segment.w < Math.max(48, typicalWidth * 1.45, bandHeight * 0.8)) {
      splitSegments.push(segment);
      continue;
    }

    const localSegments = splitSegmentByColumnPeaks(image, band, background, segment, baseThreshold);
    if (localSegments.length < 2) {
      splitSegments.push(segment);
      continue;
    }

    didSplit = true;
    splitSegments.push(...localSegments);
  }

  return didSplit ? splitSegments : segments;
}

function splitSegmentByColumnPeaks(
  image: RGBAImage,
  band: Band,
  background: [number, number, number, number],
  segment: Segment,
  baseThreshold: number
): Segment[] {
  const counts = new Uint16Array(segment.w);
  let maxCount = 0;

  for (let localX = 0; localX < segment.w; localX += 1) {
    let count = 0;
    const x = segment.x + localX;
    for (let y = band.start; y <= band.end; y += 1) {
      if (isForeground(image, x, y, background)) {
        count += 1;
      }
    }
    counts[localX] = count;
    maxCount = Math.max(maxCount, count);
  }

  if (maxCount <= baseThreshold * 2) {
    return [];
  }

  const strongThreshold = Math.max(baseThreshold + 1, Math.floor(maxCount * 0.28));
  const minPeakWidth = Math.max(8, Math.floor((band.end - band.start + 1) * 0.12));
  const peakBands = bandsFromCounts(counts, strongThreshold, Math.max(2, Math.floor(minPeakWidth * 0.18)), minPeakWidth);
  if (peakBands.length < 2 || peakBands.length > 12) {
    return [];
  }

  const medianPeakWidth = Math.max(1, medianInteger(peakBands.map((peak) => peak.end - peak.start + 1)));
  const pad = Math.max(2, Math.round(medianPeakWidth * 0.08));
  return peakBands.map((peak) => {
    const x = Math.max(segment.x, segment.x + peak.start - pad);
    const right = Math.min(segment.x + segment.w, segment.x + peak.end + pad + 1);
    return { x, w: Math.max(1, right - x) };
  });
}

function resolveFrameSegments(image: RGBAImage, band: Band, background: [number, number, number, number]): ResolvedSegments {
  const sourceSegments = segmentsForBand(image, band, background);
  const frameSegments = splitMergedFrameSegments(image, band, background, sourceSegments);
  const contentSegments = chooseFrameSegments(frameSegments);
  const outlinedSegments = outlinedCellSegmentsForBand(image, band, background, frameSegments);
  const labelFrameStart = frameStartForLabelSearch(frameSegments, contentSegments, outlinedSegments);
  const rowLabel = Number.isFinite(labelFrameStart) ? detectRowLabel(image, band, background, labelFrameStart) : undefined;

  if (outlinedSegments.length >= 2 && outlinedSegments.length > contentSegments.length) {
    return {
      segments: outlinedSegments,
      usedOutlinedCells: true,
      usedContentCentering: false,
      usedComponentMerging: false,
      usedDriftFitting: false,
      mergedComponentCount: 0,
      maxCenterDriftPx: 0,
      ...(rowLabel ? { rowLabel } : {})
    };
  }

  const merged = mergeDisconnectedComponents(contentSegments);
  if (merged.usedComponentMerging) {
    const drifted = normalizeDriftedSegmentsByStart(merged.segments, image.width);
    return {
      segments: drifted.segments,
      usedOutlinedCells: false,
      usedContentCentering: false,
      usedComponentMerging: true,
      usedDriftFitting: drifted.usedDriftFitting,
      mergedComponentCount: merged.mergedComponentCount,
      maxCenterDriftPx: drifted.maxCenterDriftPx,
      ...(rowLabel ? { rowLabel } : {})
    };
  }

  const centeredSegments = normalizeUnevenContentSegments(contentSegments, image.width);
  return {
    segments: centeredSegments.segments,
    usedOutlinedCells: false,
    usedContentCentering: centeredSegments.usedContentCentering,
    usedComponentMerging: false,
    usedDriftFitting: false,
    mergedComponentCount: 0,
    maxCenterDriftPx: 0,
    ...(rowLabel ? { rowLabel } : {})
  };
}

function expandRowToSubtleCellBounds(
  image: RGBAImage,
  row: DetectedRow,
  background: [number, number, number, number]
): DetectedRow {
  if (row.segments.length < 2 || row.usedOutlinedCells) {
    return row;
  }

  const centered = normalizeUnevenContentSegments(row.segments, image.width);
  const segments = centered.usedContentCentering ? centered.segments : row.segments;
  const expandedBand = subtleCellBandForRow(image, row.band, segments, background);

  if (!expandedBand) {
    return centered.usedContentCentering
      ? {
          ...row,
          segments,
          usedContentCentering: true
        }
      : row;
  }

  return {
    ...row,
    band: expandedBand,
    segments,
    usedOutlinedCells: true,
    usedContentCentering: row.usedContentCentering || centered.usedContentCentering
  };
}

function subtleCellBandForRow(
  image: RGBAImage,
  band: Band,
  segments: Segment[],
  background: [number, number, number, number]
): Band | undefined {
  if (segments.length < 2) {
    return undefined;
  }

  const xStart = Math.max(0, Math.min(...segments.map((segment) => segment.x)));
  const xEnd = Math.min(image.width, Math.max(...segments.map((segment) => segment.x + segment.w)));
  const rowWidth = xEnd - xStart;
  if (rowWidth < 24) {
    return undefined;
  }

  const typicalWidth = Math.max(1, medianInteger(segments.map((segment) => segment.w)));
  const searchRadius = Math.max(12, Math.min(96, Math.round(typicalWidth * 0.8)));
  const top = findSubtleHorizontalLine(
    image,
    xStart,
    xEnd,
    band.start,
    Math.max(0, band.start - searchRadius),
    -1,
    background
  );
  const bottom = findSubtleHorizontalLine(
    image,
    xStart,
    xEnd,
    band.end,
    Math.min(image.height - 1, band.end + searchRadius),
    1,
    background
  );

  if (top === undefined || bottom === undefined || bottom <= top) {
    return undefined;
  }

  const topStart = extendSubtleHorizontalLineStart(image, xStart, xEnd, top, background);
  const bottomEnd = extendSubtleHorizontalLineEnd(image, xStart, xEnd, bottom, background);
  const height = bottomEnd - topStart + 1;
  if (height < Math.max(16, typicalWidth * 0.55) || height > typicalWidth * 1.55) {
    return undefined;
  }

  return { start: topStart, end: bottomEnd };
}

function findSubtleHorizontalLine(
  image: RGBAImage,
  xStart: number,
  xEnd: number,
  startY: number,
  stopY: number,
  step: 1 | -1,
  background: [number, number, number, number]
): number | undefined {
  for (let y = startY; step > 0 ? y <= stopY : y >= stopY; y += step) {
    if (subtleHorizontalLineScore(image, xStart, xEnd, y, background) >= 0.58) {
      return y;
    }
  }

  return undefined;
}

function extendSubtleHorizontalLineEnd(
  image: RGBAImage,
  xStart: number,
  xEnd: number,
  startY: number,
  background: [number, number, number, number]
): number {
  let y = startY;
  while (y + 1 < image.height && subtleHorizontalLineScore(image, xStart, xEnd, y + 1, background) >= 0.58) {
    y += 1;
  }
  return y;
}

function extendSubtleHorizontalLineStart(
  image: RGBAImage,
  xStart: number,
  xEnd: number,
  startY: number,
  background: [number, number, number, number]
): number {
  let y = startY;
  while (y - 1 >= 0 && subtleHorizontalLineScore(image, xStart, xEnd, y - 1, background) >= 0.58) {
    y -= 1;
  }
  return y;
}

function subtleHorizontalLineScore(
  image: RGBAImage,
  xStart: number,
  xEnd: number,
  y: number,
  background: [number, number, number, number]
): number {
  let count = 0;
  for (let x = xStart; x < xEnd; x += 1) {
    if (isSubtleGridPixel(image, x, y, background)) {
      count += 1;
    }
  }
  return count / Math.max(1, xEnd - xStart);
}

function isSubtleGridPixel(image: RGBAImage, x: number, y: number, background: [number, number, number, number]): boolean {
  const offset = (y * image.width + x) * 4;
  const distance =
    Math.abs(image.data[offset]! - background[0]) +
    Math.abs(image.data[offset + 1]! - background[1]) +
    Math.abs(image.data[offset + 2]! - background[2]) +
    Math.abs(image.data[offset + 3]! - background[3]);
  return distance > 18;
}

function outlinedCellSegmentsForBand(
  image: RGBAImage,
  band: Band,
  background: [number, number, number, number],
  sourceSegments: Segment[]
): Segment[] {
  const bandHeight = band.end - band.start + 1;
  const separatorThreshold = Math.max(4, Math.floor(bandHeight * 0.78));
  const candidates: Segment[][] = [];

  for (const segment of sourceSegments) {
    if (segment.w < bandHeight * 1.8) {
      continue;
    }

    const separators: number[] = [];
    let separatorStart = -1;
    for (let x = segment.x; x < segment.x + segment.w; x += 1) {
      let count = 0;
      for (let y = band.start; y <= band.end; y += 1) {
        if (isForeground(image, x, y, background)) {
          count += 1;
        }
      }

      if (count >= separatorThreshold) {
        if (separatorStart < 0) {
          separatorStart = x;
        }
        continue;
      }

      if (separatorStart >= 0) {
        separators.push(separatorStart);
        separatorStart = -1;
      }
    }

    if (separatorStart >= 0) {
      separators.push(separatorStart);
    }

    const cells = cellsFromSeparators(separators);
    if (cells.length >= 2) {
      candidates.push(cells);
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((a, b) => b.length - a.length || totalSegmentWidth(b) - totalSegmentWidth(a));
  return candidates[0]!;
}

function cellsFromSeparators(separators: number[]): Segment[] {
  if (separators.length < 3) {
    return [];
  }

  const cells: Segment[] = [];
  for (let index = 1; index < separators.length; index += 1) {
    const x = separators[index - 1]!;
    const nextX = separators[index]!;
    const w = nextX - x;
    if (w >= 8) {
      cells.push({ x, w });
    }
  }
  return cells;
}

function chooseFrameSegments(segments: Segment[]): Segment[] {
  if (segments.length <= 2) {
    return segments;
  }

  const gaps = gapsBetween(segments);
  if (gaps.length === 0) {
    return segments;
  }

  const cutIndex = findLabelCutIndex(segments, gaps);
  const trimmed = cutIndex >= 0 ? segments.slice(cutIndex + 1) : segments;
  const startGaps = gapsBetweenStarts(trimmed);
  if (startGaps.length > 0) {
    const pitch = Math.max(1, medianInteger(startGaps));
    const spread = (Math.max(...startGaps) - Math.min(...startGaps)) / pitch;
    if (spread <= 0.24) {
      return trimmed;
    }
  }

  const widths = trimmed.map((segment) => segment.w);
  const typicalWidth = medianInteger(widths);

  return trimmed.filter((segment) => segment.w >= typicalWidth * 0.65 && segment.w <= typicalWidth * 1.45);
}

function frameStartForLabelSearch(sourceSegments: Segment[], contentSegments: Segment[], outlinedSegments: Segment[]): number {
  const gaps = gapsBetween(sourceSegments);
  if (gaps.length > 0) {
    const cutIndex = findLabelCutIndex(sourceSegments, gaps);
    if (cutIndex >= 0) {
      return sourceSegments[cutIndex + 1]!.x;
    }
  }

  return Math.min(contentSegments[0]?.x ?? Number.POSITIVE_INFINITY, outlinedSegments[0]?.x ?? Number.POSITIVE_INFINITY);
}

function findLabelCutIndex(segments: Segment[], gaps: number[]): number {
  if (gaps.length === 0) {
    return -1;
  }

  const typicalGap = Math.max(1, medianInteger(gaps));
  const labelGap = Math.max(20, typicalGap * 1.6);
  return gaps.findIndex((gap, index) => gap >= labelGap && segments.length - index - 1 >= 2 && isLikelyLabelPrefix(segments, index));
}

function isLikelyLabelPrefix(segments: Segment[], cutIndex: number): boolean {
  const after = segments.slice(cutIndex + 1);
  if (after.length < 2) {
    return false;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = -1;
  for (let index = 0; index <= cutIndex; index += 1) {
    const segment = segments[index]!;
    minX = Math.min(minX, segment.x);
    maxX = Math.max(maxX, segment.x + segment.w);
  }

  const nextFrameX = after[0]!.x;
  const afterWidth = Math.max(1, medianInteger(after.slice(0, Math.min(4, after.length)).map((segment) => segment.w)));
  const prefixWidth = maxX - minX;
  const prefixIsInLeftLabelGutter = minX <= 72 && maxX <= nextFrameX * 0.72;
  const prefixIsSingleLabelBlock = cutIndex === 0 && minX <= 72 && prefixWidth <= afterWidth * 0.65;
  const prefixIsMultiGlyphLabel = cutIndex > 0 && maxX <= nextFrameX * 0.78;

  return prefixIsInLeftLabelGutter || prefixIsSingleLabelBlock || prefixIsMultiGlyphLabel;
}

function mergeDisconnectedComponents(segments: Segment[]): ComponentMergeResult {
  if (segments.length < 4) {
    return { segments, usedComponentMerging: false, mergedComponentCount: 0 };
  }

  const nearbyEffects = mergeNearbyEffectSegments(segments);
  if (nearbyEffects.usedComponentMerging) {
    return nearbyEffects;
  }

  const rawStartGaps = gapsBetweenStarts(segments);
  if (rawStartGaps.length === 0) {
    return { segments, usedComponentMerging: false, mergedComponentCount: 0 };
  }

  const rawPitch = Math.max(1, medianInteger(rawStartGaps));
  const rawGapSpread = (Math.max(...rawStartGaps) - Math.min(...rawStartGaps)) / rawPitch;
  if (rawGapSpread < 0.22) {
    return { segments, usedComponentMerging: false, mergedComponentCount: 0 };
  }

  const candidates = [2, 3]
    .filter((groupSize) => segments.length % groupSize === 0 && segments.length / groupSize >= 2)
    .map((groupSize) => createComponentMergeCandidate(segments, groupSize))
    .filter((candidate): candidate is ComponentMergeResult & { score: number } => candidate !== undefined)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best) {
    return { segments, usedComponentMerging: false, mergedComponentCount: 0 };
  }

  return {
    segments: best.segments,
    usedComponentMerging: true,
    mergedComponentCount: best.mergedComponentCount
  };
}

function mergeNearbyEffectSegments(segments: Segment[]): ComponentMergeResult {
  const typicalWidth = Math.max(1, medianInteger(segments.map((segment) => segment.w)));
  const merged: Segment[] = [];
  let mergedComponentCount = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const current = { ...segments[index]! };

    while (index + 1 < segments.length) {
      const next = segments[index + 1]!;
      const gap = next.x - (current.x + current.w);
      const following = segments[index + 2];
      const followingGap = following ? following.x - (next.x + next.w) : Number.POSITIVE_INFINITY;
      const closeGap = gap >= 0 && gap <= Math.max(4, Math.min(12, typicalWidth * 0.55));
      const smallEffect = next.w <= Math.max(8, typicalWidth * 0.72);
      const nextFrameGap = followingGap >= Math.max(gap * 2, typicalWidth * 0.75);

      if (!closeGap || !smallEffect || !nextFrameGap) {
        break;
      }

      current.w = next.x + next.w - current.x;
      mergedComponentCount += 1;
      index += 1;
    }

    merged.push(current);
  }

  if (mergedComponentCount === 0 || merged.length < 2) {
    return { segments, usedComponentMerging: false, mergedComponentCount: 0 };
  }

  const startGaps = gapsBetweenStarts(merged);
  const pitch = Math.max(1, medianInteger(startGaps));
  const fit = fitRegularStarts(merged, pitch);
  const maxStartGap = Math.max(...startGaps);
  const minStartGap = Math.min(...startGaps);
  const spread = (maxStartGap - minStartGap) / pitch;
  if (spread > 0.32 || fit.maxDriftPx > Math.max(8, pitch * 0.18)) {
    return { segments, usedComponentMerging: false, mergedComponentCount: 0 };
  }

  return {
    segments: merged,
    usedComponentMerging: true,
    mergedComponentCount
  };
}

function createComponentMergeCandidate(
  segments: Segment[],
  groupSize: number
): (ComponentMergeResult & { score: number }) | undefined {
  const componentWidths = segments.map((segment) => segment.w);
  const typicalComponentWidth = Math.max(1, medianInteger(componentWidths));
  const groups: Segment[] = [];
  const withinGaps: number[] = [];

  for (let index = 0; index < segments.length; index += groupSize) {
    const group = segments.slice(index, index + groupSize);
    const first = group[0]!;
    const last = group[group.length - 1]!;
    groups.push({ x: first.x, w: last.x + last.w - first.x });
    withinGaps.push(...gapsBetween(group));
  }

  if (withinGaps.length === 0) {
    return undefined;
  }

  const largestWithinGap = Math.max(...withinGaps);
  const withinGapLimit = Math.max(3, Math.min(10, typicalComponentWidth * 0.45));
  if (largestWithinGap > withinGapLimit) {
    return undefined;
  }

  const startGaps = gapsBetweenStarts(groups);
  if (startGaps.length === 0) {
    return undefined;
  }

  const pitch = Math.max(1, medianInteger(startGaps));
  const typicalGroupWidth = Math.max(1, medianInteger(groups.map((group) => group.w)));
  if (pitch < typicalComponentWidth * 1.8 || typicalGroupWidth < typicalComponentWidth * 1.7 || typicalGroupWidth > pitch * 1.05) {
    return undefined;
  }

  const fit = fitRegularStarts(groups, pitch);
  const driftLimit = Math.max(3, Math.min(8, pitch * 0.18));
  if (fit.maxDriftPx > driftLimit) {
    return undefined;
  }

  const mergedComponentCount = segments.length - groups.length;
  const score = groups.length * 10 + groupSize * 2 - fit.maxDriftPx - largestWithinGap * 0.2;
  return {
    segments: groups,
    usedComponentMerging: true,
    mergedComponentCount,
    score
  };
}

function normalizeDriftedSegmentsByStart(segments: Segment[], imageWidth: number): DriftNormalizationResult {
  if (segments.length < 2) {
    return { segments, usedDriftFitting: false, maxCenterDriftPx: 0 };
  }

  const startGaps = gapsBetweenStarts(segments);
  const pitch = Math.max(1, medianInteger(startGaps));
  const fit = fitRegularStarts(segments, pitch);
  const maxX = Math.max(0, imageWidth - pitch);
  const normalized = segments.map((_, index) => ({
    x: Math.max(0, Math.min(maxX, fit.gridStart + index * pitch)),
    w: pitch
  }));

  return {
    segments: normalized,
    usedDriftFitting: fit.maxDriftPx >= 1,
    maxCenterDriftPx: fit.maxDriftPx
  };
}

function filterFooterRows(rows: DetectedRow[], imageHeight: number): { rows: DetectedRow[]; removedCount: number } {
  if (rows.length <= 1) {
    return { rows, removedCount: 0 };
  }

  const frameLikeRows = rows.filter((row) => row.segments.length >= 2);
  const typicalHeight = Math.max(1, medianInteger(frameLikeRows.map((row) => row.band.end - row.band.start + 1)));
  const typicalSegmentWidth = Math.max(1, medianInteger(frameLikeRows.flatMap((row) => row.segments.map((segment) => segment.w))));
  const filtered = rows.filter((row) => !isFooterLikeRow(row, imageHeight, typicalHeight, typicalSegmentWidth));

  return {
    rows: filtered,
    removedCount: rows.length - filtered.length
  };
}

function selectFrameSizeReferenceRows(rows: DetectedRow[]): DetectedRow[] {
  if (rows.length <= 1) {
    return rows;
  }

  const rowWidths = rows.map(rowReferenceCellWidth);
  const widest = Math.max(...rowWidths);
  const narrowest = Math.max(1, Math.min(...rowWidths));
  if (widest < narrowest * 1.8) {
    return rows;
  }

  const largeRows = rows.filter((row, index) => {
    const height = row.band.end - row.band.start + 1;
    return rowWidths[index]! >= widest * 0.55 && height >= Math.max(36, rowWidths[index]! * 0.35);
  });
  return largeRows.length > 0 ? largeRows : rows;
}

function rowReferenceCellWidth(row: DetectedRow): number {
  const segmentWidth = Math.max(1, medianInteger(row.segments.map((segment) => segment.w)));
  const startGaps = gapsBetweenStarts(row.segments);
  if (startGaps.length === 0) {
    return segmentWidth;
  }

  const pitch = Math.max(1, medianInteger(startGaps));
  return pitch >= segmentWidth * 1.65 ? pitch : segmentWidth;
}

function normalizePresentationRows(rows: DetectedRow[], imageWidth: number, imageHeight: number): DetectedRow[] {
  if (rows.length === 0) {
    return rows;
  }

  const rowStartGaps = gapsBetweenStarts(rows.map((row) => ({ x: row.band.start, w: row.band.end - row.band.start + 1 })));
  const rowPitch = rowStartGaps.length > 0 ? Math.max(1, medianInteger(rowStartGaps)) : 0;

  return rows.map((row) => {
    if (row.segments.length < 2) {
      return row;
    }

    const startGaps = gapsBetweenStarts(row.segments);
    const pitch = startGaps.length > 0 ? Math.max(1, medianInteger(startGaps)) : 0;
    const currentWidth = Math.max(1, medianInteger(row.segments.map((segment) => segment.w)));
    const currentHeight = row.band.end - row.band.start + 1;
    const detectedGap = Math.max(0, pitch - currentWidth);
    const expandedWidth = pitch > 0 && detectedGap >= 8 ? Math.min(pitch, currentWidth + Math.round(detectedGap * 0.5)) : currentWidth;
    const leftExpansion = pitch > 0 && detectedGap >= 8 ? Math.round(detectedGap * 0.375) : 0;
    const aspectHeight = Math.round(expandedWidth * 1.25);
    const expandedHeight =
      rowPitch > 0 ? Math.max(currentHeight, Math.min(Math.max(currentHeight, rowPitch - 24), aspectHeight)) : currentHeight;

    return {
      ...row,
      band: { start: row.band.start, end: Math.min(imageHeight - 1, row.band.start + expandedHeight - 1) },
      segments: row.segments.map((segment) => clampSegmentInside({ x: segment.x - leftExpansion, w: expandedWidth }, imageWidth)),
      usedOutlinedCells: true
    };
  });
}

function clampSegmentInside(segment: Segment, imageWidth: number): Segment {
  const w = Math.max(1, Math.min(imageWidth, Math.round(segment.w)));
  return {
    x: Math.max(0, Math.min(Math.max(0, imageWidth - w), Math.round(segment.x))),
    w
  };
}

function isFooterLikeRow(row: DetectedRow, imageHeight: number, typicalHeight: number, typicalSegmentWidth: number): boolean {
  const height = row.band.end - row.band.start + 1;
  const medianSegmentWidth = Math.max(1, medianInteger(row.segments.map((segment) => segment.w)));
  const nearBottom = row.band.start >= imageHeight * 0.82;
  const tooShort = height <= Math.max(16, typicalHeight * 0.42);
  const tooNarrow = medianSegmentWidth <= Math.max(18, typicalSegmentWidth * 0.48);
  const resemblesFooterText = row.segments.length >= 3 && tooNarrow;

  return nearBottom && (tooShort || resemblesFooterText) && !row.rowLabel;
}

function withFooterConditioningIssue(
  conditioning: SheetConditioningDiagnostics,
  removedFooterCount: number
): SheetConditioningDiagnostics {
  if (removedFooterCount <= 0 || conditioning.issues.some((issue) => issue.code === "footer-like-band")) {
    return conditioning;
  }

  return {
    ...conditioning,
    recommendFrameFirst: true,
    issues: [
      ...conditioning.issues,
      {
        code: "footer-like-band",
        severity: "info",
        message: `Ignored ${removedFooterCount} footer-like metadata band${removedFooterCount === 1 ? "" : "s"} during sheet detection.`
      }
    ]
  };
}

function alignDetectedRowsToSharedColumns<
  Row extends {
    segments: Segment[];
    usedComponentMerging: boolean;
    usedDriftFitting: boolean;
    maxCenterDriftPx: number;
  }
>(rows: Row[]): Row[] {
  const driftRows = rows.filter((row) => (row.usedComponentMerging || row.usedDriftFitting) && row.segments.length >= 2);
  if (driftRows.length < 2) {
    return rows;
  }

  const pitches = driftRows.flatMap((row) => [medianInteger(gapsBetweenStarts(row.segments)), medianInteger(row.segments.map((segment) => segment.w))]);
  const pitch = Math.max(1, medianInteger(pitches.filter((value) => value > 0)));
  const gridStart = Math.max(0, medianInteger(driftRows.map((row) => row.segments[0]!.x)));

  return rows.map((row) => {
    if (!driftRows.includes(row)) {
      return row;
    }

    let maxAlignmentDrift = row.maxCenterDriftPx;
    const segments = row.segments.map((segment, index) => {
      const x = gridStart + index * pitch;
      maxAlignmentDrift = Math.max(maxAlignmentDrift, Math.abs(segment.x - x));
      return { x, w: pitch };
    });

    return {
      ...row,
      segments,
      usedDriftFitting: row.usedDriftFitting || maxAlignmentDrift >= 1,
      maxCenterDriftPx: maxAlignmentDrift
    };
  });
}

function detectRowLabel(
  image: RGBAImage,
  band: Band,
  background: [number, number, number, number],
  frameStartX: number
): Omit<SheetRowLabel, "rowIndex"> | undefined {
  const searchEndX = Math.max(0, Math.min(image.width, Math.floor(frameStartX) - 6));
  if (searchEndX < 8) {
    return undefined;
  }

  const rect = labelBoundsBeforeFrame(image, band, searchEndX, background);
  if (!rect || rect.w < 6 || rect.h < 6 || rect.w > searchEndX * 0.95) {
    return undefined;
  }

  let best: (Omit<SheetRowLabel, "rowIndex"> & { score: number }) | undefined;
  for (const candidate of rowLabelTemplates) {
    const template = renderLabelTemplate(candidate.text);
    const confidence = scoreLabelTemplate(image, rect, background, template);
    if (!best || confidence > best.score) {
      best = {
        name: candidate.name,
        rawText: candidate.rawText,
        confidence,
        rect,
        score: confidence
      };
    }
  }

  if (!best || best.confidence < labelConfidenceThreshold) {
    return undefined;
  }

  return {
    name: best.name,
    rawText: best.rawText,
    confidence: best.confidence,
    rect: best.rect
  };
}

function labelBoundsBeforeFrame(
  image: RGBAImage,
  band: Band,
  searchEndX: number,
  background: [number, number, number, number]
): Rect | undefined {
  const counts = new Uint16Array(searchEndX);
  const bandHeight = band.end - band.start + 1;
  const threshold = Math.max(1, Math.floor(bandHeight * 0.03));

  for (let x = 0; x < searchEndX; x += 1) {
    let count = 0;
    for (let y = band.start; y <= band.end; y += 1) {
      if (isForeground(image, x, y, background)) {
        count += 1;
      }
    }
    counts[x] = count;
  }

  const labelBands = bandsFromCounts(counts, threshold, 3, 2);
  if (labelBands.length === 0) {
    return undefined;
  }

  const gaps: number[] = [];
  for (let index = 1; index < labelBands.length; index += 1) {
    gaps.push(labelBands[index]!.start - labelBands[index - 1]!.end - 1);
  }
  const typicalGap = Math.max(1, medianInteger(gaps));
  const largeGap = Math.max(8, Math.min(24, typicalGap * 1.8));
  const cutIndex = gaps.findIndex((gap) => gap >= largeGap);
  const lastLabelBand = labelBands[cutIndex >= 0 ? cutIndex : labelBands.length - 1]!;

  return foregroundBoundsInRegion(image, 0, band.start, lastLabelBand.end + 1, band.end + 1, background);
}

function foregroundBoundsInRegion(
  image: RGBAImage,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  background: [number, number, number, number]
): Rect | undefined {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = Math.max(0, startY); y < Math.min(image.height, endY); y += 1) {
    for (let x = Math.max(0, startX); x < Math.min(image.width, endX); x += 1) {
      if (!isForeground(image, x, y, background)) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return undefined;
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function renderLabelTemplate(text: string): BinaryTemplate {
  const lines = text.split("\n");
  const lineGap = 2;
  const renderedLines = lines.map((line) => renderLabelLine(line));
  const width = Math.max(1, ...renderedLines.map((line) => line.width));
  const height = renderedLines.reduce((total, line) => total + line.height, 0) + Math.max(0, renderedLines.length - 1) * lineGap;
  const data = new Uint8Array(width * height);
  let yOffset = 0;

  for (const line of renderedLines) {
    for (let y = 0; y < line.height; y += 1) {
      for (let x = 0; x < line.width; x += 1) {
        if (line.data[y * line.width + x] === 1) {
          data[(yOffset + y) * width + x] = 1;
        }
      }
    }
    yOffset += line.height + lineGap;
  }

  return { width, height, data };
}

function renderLabelLine(line: string): BinaryTemplate {
  const glyphWidth = 5;
  const glyphHeight = 7;
  const letterGap = 1;
  const wordGap = 3;
  const width = Math.max(1, Array.from(line).reduce((total, char, index) => total + (char === " " ? wordGap : glyphWidth) + (index > 0 ? letterGap : 0), 0));
  const data = new Uint8Array(width * glyphHeight);
  let cursorX = 0;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (index > 0) {
      cursorX += letterGap;
    }

    if (char === " ") {
      cursorX += wordGap;
      continue;
    }

    const glyph = labelGlyphs[char];
    if (!glyph) {
      cursorX += glyphWidth;
      continue;
    }

    for (let y = 0; y < glyphHeight; y += 1) {
      for (let x = 0; x < glyphWidth; x += 1) {
        if (glyph[y]![x] === "1") {
          data[y * width + cursorX + x] = 1;
        }
      }
    }
    cursorX += glyphWidth;
  }

  return { width, height: glyphHeight, data };
}

function scoreLabelTemplate(
  image: RGBAImage,
  rect: Rect,
  background: [number, number, number, number],
  template: BinaryTemplate
): number {
  let intersection = 0;
  let sourceCount = 0;
  let templateCount = 0;

  for (let ty = 0; ty < template.height; ty += 1) {
    const y0 = Math.floor((ty / template.height) * rect.h);
    const y1 = Math.max(y0 + 1, Math.ceil(((ty + 1) / template.height) * rect.h));
    for (let tx = 0; tx < template.width; tx += 1) {
      const x0 = Math.floor((tx / template.width) * rect.w);
      const x1 = Math.max(x0 + 1, Math.ceil(((tx + 1) / template.width) * rect.w));
      const templateOn = template.data[ty * template.width + tx] === 1;
      let foregroundCount = 0;
      let sampleCount = 0;

      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          sampleCount += 1;
          if (isForeground(image, rect.x + x, rect.y + y, background)) {
            foregroundCount += 1;
          }
        }
      }

      const sourceOn = foregroundCount / Math.max(1, sampleCount) >= 0.28;

      if (sourceOn) {
        sourceCount += 1;
      }
      if (templateOn) {
        templateCount += 1;
      }
      if (sourceOn && templateOn) {
        intersection += 1;
      }
    }
  }

  if (sourceCount === 0 || templateCount === 0) {
    return 0;
  }

  const f1 = (2 * intersection) / (sourceCount + templateCount);
  const sourceRatio = rect.w / rect.h;
  const templateRatio = template.width / template.height;
  const aspectPenalty = Math.min(0.55, Math.abs(Math.log(sourceRatio / templateRatio)) * 0.45);
  return f1 * (1 - aspectPenalty);
}

function normalizeUnevenContentSegments(
  segments: Segment[],
  imageWidth: number
): { segments: Segment[]; usedContentCentering: boolean } {
  if (segments.length < 2) {
    return { segments, usedContentCentering: false };
  }

  const centers = segments.map((segment) => segment.x + segment.w / 2);
  const centerGaps: number[] = [];
  for (let index = 1; index < centers.length; index += 1) {
    centerGaps.push(centers[index]! - centers[index - 1]!);
  }

  const pitch = Math.max(1, medianInteger(centerGaps));
  const typicalWidth = Math.max(1, medianInteger(segments.map((segment) => segment.w)));
  const minGap = Math.min(...centerGaps);
  const maxGap = Math.max(...centerGaps);
  const minWidth = Math.min(...segments.map((segment) => segment.w));
  const maxWidth = Math.max(...segments.map((segment) => segment.w));
  const centerGapSpread = (maxGap - minGap) / pitch;
  const widthSpread = (maxWidth - minWidth) / typicalWidth;
  const contentOccupancy = typicalWidth / pitch;

  if (contentOccupancy >= 0.78 || (contentOccupancy >= 0.62 && centerGapSpread < 0.12 && widthSpread < 0.18)) {
    return { segments, usedContentCentering: false };
  }

  if (centerGaps.some((gap) => Math.abs(gap - pitch) > pitch * 0.28)) {
    return { segments, usedContentCentering: false };
  }

  const starts = centers.map((center, index) => center - index * pitch - pitch / 2);
  const gridStart = Math.max(0, Math.round(medianNumber(starts)));
  const maxX = Math.max(0, imageWidth - pitch);
  return {
    segments: segments.map((_, index) => ({
      x: Math.max(0, Math.min(maxX, gridStart + index * pitch)),
      w: pitch
    })),
    usedContentCentering: true
  };
}

function totalSegmentWidth(segments: Segment[]): number {
  return segments.reduce((total, segment) => total + segment.w, 0);
}

function gapsBetween(segments: Segment[]): number[] {
  const gaps: number[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    gaps.push(Math.max(0, segments[index]!.x - (segments[index - 1]!.x + segments[index - 1]!.w)));
  }
  return gaps;
}

function gapsBetweenStarts(segments: Segment[]): number[] {
  const gaps: number[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    gaps.push(Math.max(0, segments[index]!.x - segments[index - 1]!.x));
  }
  return gaps;
}

function fitRegularStarts(segments: Segment[], pitch: number): { gridStart: number; maxDriftPx: number } {
  const starts = segments.map((segment, index) => segment.x - index * pitch);
  const gridStart = Math.max(0, Math.round(medianNumber(starts)));
  let maxDriftPx = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const expectedX = gridStart + index * pitch;
    maxDriftPx = Math.max(maxDriftPx, Math.abs(segments[index]!.x - expectedX));
  }

  return { gridStart, maxDriftPx };
}

function createSheetDiagnostics({
  rows,
  columns,
  frameHeights,
  pitchPx,
  mergedComponentCount,
  maxCenterDriftPx,
  usedComponentMerging,
  usedDriftFitting,
  usedOutlinedCells,
  usedContentCentering,
  labelNames,
  labelRowCount,
  labelConfidences = [],
  rowExplanations = [],
  warnings = [],
  conditioning
}: {
  rows: number;
  columns: number;
  frameHeights: number[];
  pitchPx: number;
  mergedComponentCount: number;
  maxCenterDriftPx: number;
  usedComponentMerging: boolean;
  usedDriftFitting: boolean;
  usedOutlinedCells: boolean;
  usedContentCentering: boolean;
  labelNames: string[];
  labelRowCount: number;
  labelConfidences?: number[];
  rowExplanations?: DetectedRow[];
  warnings?: string[];
  conditioning?: SheetConditioningDiagnostics;
}): SheetLayoutDiagnostics {
  const averageBandHeight =
    frameHeights.length > 0 ? Math.round(frameHeights.reduce((total, height) => total + height, 0) / frameHeights.length) : 0;
  const minHeight = frameHeights.length > 0 ? Math.min(...frameHeights) : 0;
  const maxHeight = frameHeights.length > 0 ? Math.max(...frameHeights) : 0;
  const heightSpreadRatio = averageBandHeight > 0 ? (maxHeight - minHeight) / averageBandHeight : 0;
  const rowBandScore = clampConfidence((rows >= 3 ? 0.9 : rows >= 2 ? 0.68 : 0.34) - Math.min(0.28, heightSpreadRatio * 0.55));
  const columnPitchScore = createColumnPitchScore({
    columns,
    pitchPx,
    maxCenterDriftPx,
    usedComponentMerging
  });
  const rowLabel = confidenceLabel(rowBandScore);
  const columnLabel = confidenceLabel(columnPitchScore);
  const confidenceModel = createSheetConfidenceModel({
    rows,
    columns,
    averageBandHeight,
    heightSpreadRatio,
    rowBandScore,
    columnPitchScore,
    pitchPx,
    maxCenterDriftPx,
    mergedComponentCount,
    usedComponentMerging,
    usedDriftFitting,
    usedContentCentering,
    labelNames,
    labelRowCount,
    labelConfidences,
    rowExplanations,
    warnings
  });
  const notes = [
    `Rows: ${rowLabel} confidence, ${rows} band${rows === 1 ? "" : "s"} detected.`,
    `Columns: ${columnLabel} confidence, ${columns} column${columns === 1 ? "" : "s"} at about ${pitchPx}px pitch.`
  ];

  if (usedComponentMerging) {
    notes.push(`Merged ${mergedComponentCount} nearby component${mergedComponentCount === 1 ? "" : "s"} into frame boxes.`);
  }
  if (usedDriftFitting) {
    notes.push(`Frame-center drift: ${Math.round(maxCenterDriftPx)}px max while fitting columns.`);
  }
  if (usedOutlinedCells) {
    notes.push("Outlined cells provided strong column separators.");
  }
  if (usedContentCentering) {
    notes.push("Uneven visible gutters were normalized from content centers.");
  }
  if (labelNames.length > 0) {
    notes.push(`Labels: ${labelNames.join(", ")} detected.`);
  } else if (rows > 0 && labelRowCount === 0) {
    notes.push("Labels: low confidence; kept row names.");
  }

  return {
    rowConfidence: {
      label: rowLabel,
      rowCount: rows,
      averageBandHeight,
      heightSpreadRatio
    },
    columnConfidence: {
      label: columnLabel,
      columnCount: columns,
      pitchPx,
      maxCenterDriftPx,
      mergedComponentCount
    },
    confidenceModel,
    ...(conditioning ? { conditioning } : {}),
    notes
  };
}

function createSheetConfidenceModel({
  rows,
  columns,
  averageBandHeight,
  heightSpreadRatio,
  rowBandScore,
  columnPitchScore,
  pitchPx,
  maxCenterDriftPx,
  mergedComponentCount,
  usedComponentMerging,
  usedDriftFitting,
  usedContentCentering,
  labelNames,
  labelRowCount,
  labelConfidences,
  rowExplanations,
  warnings
}: {
  rows: number;
  columns: number;
  averageBandHeight: number;
  heightSpreadRatio: number;
  rowBandScore: number;
  columnPitchScore: number;
  pitchPx: number;
  maxCenterDriftPx: number;
  mergedComponentCount: number;
  usedComponentMerging: boolean;
  usedDriftFitting: boolean;
  usedContentCentering: boolean;
  labelNames: string[];
  labelRowCount: number;
  labelConfidences: number[];
  rowExplanations: DetectedRow[];
  warnings: string[];
}): SheetLayoutConfidenceModel {
  const detectedLabelConfidences = labelConfidences.filter((confidence) => confidence > 0);
  const labelCoverage = rows > 0 ? labelRowCount / rows : 0;
  const labelScore =
    detectedLabelConfidences.length > 0
      ? averageNumber(detectedLabelConfidences) * Math.max(0.35, labelCoverage)
      : rows > 0
        ? 0.24
        : 0;
  const gutterScore = usedContentCentering ? 0.64 : 0.9;
  const componentScore = usedComponentMerging ? clampConfidence(0.74 - Math.min(0.24, mergedComponentCount / Math.max(1, rows * columns) * 0.45)) : 0.92;

  return {
    rowBand: createConfidenceDetail({
      score: rowBandScore,
      reasons: [
        `${rows} row band${rows === 1 ? "" : "s"} detected.`,
        `Average band height is ${averageBandHeight}px with ${formatRatio(heightSpreadRatio)} height spread.`
      ],
      warnings: rows < 2 ? ["Only one row band was detected; sheet layout may need manual review."] : []
    }),
    columnPitch: createConfidenceDetail({
      score: columnPitchScore,
      reasons: [
        `${columns} column${columns === 1 ? "" : "s"} at about ${pitchPx}px pitch.`,
        `Max fitted center drift is ${Math.round(maxCenterDriftPx)}px.`
      ],
      warnings: [
        ...(usedDriftFitting ? ["Column pitch needed drift fitting."] : []),
        ...(columns < 2 ? ["Too few columns for a repeated sheet pattern."] : [])
      ]
    }),
    label: createConfidenceDetail({
      score: labelScore,
      reasons:
        labelNames.length > 0
          ? [`Detected labels: ${labelNames.join(", ")}.`, `${labelRowCount} of ${rows} rows had confident labels.`]
          : ["No confident row labels were detected; generated row names are being used."],
      warnings: labelNames.length > 0 ? [] : ["Row labels are low confidence."]
    }),
    gutterNormalization: createConfidenceDetail({
      score: gutterScore,
      reasons: [usedContentCentering ? "Uneven gutters were normalized from frame content centers." : "Visible gutters already fit a regular column pitch."],
      warnings: usedContentCentering ? ["Review normalized gutters before export."] : []
    }),
    componentMerge: createConfidenceDetail({
      score: componentScore,
      reasons: [
        usedComponentMerging
          ? `Merged ${mergedComponentCount} nearby disconnected component${mergedComponentCount === 1 ? "" : "s"} into frame boxes.`
          : "No disconnected component merging was needed."
      ],
      warnings: usedComponentMerging ? ["Merged components can accidentally absorb effects or labels."] : []
    }),
    rows: rowExplanations.map((row, rowIndex) =>
      createRowConfidenceExplanation({
        row,
        rowIndex,
        columns,
        averageBandHeight,
        pitchPx
      })
    ),
    warnings: [...warnings]
  };
}

function createRowConfidenceExplanation({
  row,
  rowIndex,
  columns,
  averageBandHeight,
  pitchPx
}: {
  row: DetectedRow;
  rowIndex: number;
  columns: number;
  averageBandHeight: number;
  pitchPx: number;
}): SheetRowConfidenceExplanation {
  const height = row.band.end - row.band.start + 1;
  const heightDeltaRatio = averageBandHeight > 0 ? Math.abs(height - averageBandHeight) / averageBandHeight : 0;
  const rowWarnings = [
    ...(row.segments.length < columns ? [`Row ${rowIndex + 1} has ${row.segments.length} detected frames; sheet max is ${columns}.`] : []),
    ...(row.usedContentCentering ? [`Row ${rowIndex + 1} needed gutter normalization from content centers.`] : []),
    ...(row.usedComponentMerging ? [`Row ${rowIndex + 1} merged ${row.mergedComponentCount} disconnected component${row.mergedComponentCount === 1 ? "" : "s"}.`] : []),
    ...(row.usedDriftFitting ? [`Row ${rowIndex + 1} needed ${Math.round(row.maxCenterDriftPx)}px max center-drift fitting.`] : [])
  ];

  return {
    rowIndex,
    frameCount: row.segments.length,
    band: {
      start: row.band.start,
      end: row.band.end,
      height
    },
    rowBand: createConfidenceDetail({
      score: clampConfidence(0.94 - Math.min(0.44, heightDeltaRatio * 1.2)),
      reasons: [`Band spans y=${row.band.start}..${row.band.end}.`, `Height differs from the average by ${formatRatio(heightDeltaRatio)}.`],
      warnings: heightDeltaRatio > 0.35 ? [`Row ${rowIndex + 1} height differs substantially from the detected average.`] : []
    }),
    columnPitch: createConfidenceDetail({
      score: createColumnPitchScore({
        columns: row.segments.length,
        pitchPx,
        maxCenterDriftPx: row.maxCenterDriftPx,
        usedComponentMerging: row.usedComponentMerging
      }),
      reasons: [`${row.segments.length} frame segment${row.segments.length === 1 ? "" : "s"} in this row.`, `Max center drift is ${Math.round(row.maxCenterDriftPx)}px.`],
      warnings: row.usedDriftFitting ? [`Row ${rowIndex + 1} needed center-drift fitting.`] : []
    }),
    label: createConfidenceDetail({
      score: row.rowLabel?.confidence ?? 0,
      reasons: row.rowLabel
        ? [`Matched label "${row.rowLabel.rawText}" as ${row.rowLabel.name}.`]
        : ["No confident label matched this row."],
      warnings: row.rowLabel ? [] : [`Row ${rowIndex + 1} is using a generated row name.`]
    }),
    gutterNormalization: createConfidenceDetail({
      score: row.usedContentCentering ? 0.64 : 0.9,
      reasons: [row.usedContentCentering ? "Cell starts were rebuilt from content centers." : "Cell starts fit visible gutters."],
      warnings: row.usedContentCentering ? [`Row ${rowIndex + 1} gutters should be reviewed.`] : []
    }),
    componentMerge: createConfidenceDetail({
      score: row.usedComponentMerging ? clampConfidence(0.74 - Math.min(0.22, row.mergedComponentCount * 0.04)) : 0.92,
      reasons: [
        row.usedComponentMerging
          ? `Merged ${row.mergedComponentCount} nearby component${row.mergedComponentCount === 1 ? "" : "s"}.`
          : "No component merge was needed for this row."
      ],
      warnings: row.usedComponentMerging ? [`Row ${rowIndex + 1} contains merged components.`] : []
    }),
    warnings: rowWarnings
  };
}

function createColumnPitchScore({
  columns,
  pitchPx,
  maxCenterDriftPx,
  usedComponentMerging
}: {
  columns: number;
  pitchPx: number;
  maxCenterDriftPx: number;
  usedComponentMerging: boolean;
}): number {
  if (columns < 2) {
    return 0.28;
  }

  const driftPenalty = Math.min(0.32, maxCenterDriftPx / Math.max(1, pitchPx) * 1.7);
  const mergePenalty = usedComponentMerging ? 0.12 : 0;
  return clampConfidence(0.92 - driftPenalty - mergePenalty);
}

function createConfidenceDetail({
  score,
  reasons,
  warnings
}: {
  score: number;
  reasons: string[];
  warnings: string[];
}): SheetConfidenceDetail {
  const normalizedScore = roundConfidenceScore(score);
  return {
    label: confidenceLabel(normalizedScore),
    score: normalizedScore,
    reasons,
    warnings
  };
}

function confidenceLabel(score: number): SheetConfidenceDetail["label"] {
  if (score >= 0.75) {
    return "high";
  }
  if (score >= 0.5) {
    return "medium";
  }
  return "low";
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundConfidenceScore(value: number): number {
  return Math.round(clampConfidence(value) * 100) / 100;
}

function averageNumber(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatRatio(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function uniqueAnimationName(baseName: string, usedNames: Set<string>): string {
  let candidate = baseName;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function medianInteger(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return Math.round(sorted[middle]!);
  }

  return Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

function medianNumber(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle]!;
  }

  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function emptyDetection(reason: string): SheetLayoutDetection {
  return {
    frameWidth: 0,
    frameHeight: 0,
    rows: 0,
    columns: 0,
    margin: 0,
    spacing: 0,
    frames: [],
    rowRects: [],
    rowFrameCounts: [],
    rowAnimations: [],
    rowLabels: [],
    confidence: 0,
    reason,
    warnings: [reason]
  };
}

function clampRectInside(rect: Rect, imageWidth: number, imageHeight: number): Rect {
  const w = Math.max(1, Math.min(imageWidth, Math.round(rect.w)));
  const h = Math.max(1, Math.min(imageHeight, Math.round(rect.h)));
  return {
    x: Math.max(0, Math.min(Math.max(0, imageWidth - w), Math.round(rect.x))),
    y: Math.max(0, Math.min(Math.max(0, imageHeight - h), Math.round(rect.y))),
    w,
    h
  };
}

function validateSliceOptions(options: SheetSliceOptions): void {
  const positiveFields = ["frameWidth", "frameHeight", "rows", "columns"] as const;
  for (const field of positiveFields) {
    if (!Number.isInteger(options[field]) || options[field] <= 0) {
      throw new Error(`${field} must be a positive integer`);
    }
  }

  const nonNegativeFields = ["margin", "spacing", "extrude"] as const;
  for (const field of nonNegativeFields) {
    if (!Number.isInteger(options[field]) || options[field] < 0) {
      throw new Error(`${field} must be a non-negative integer`);
    }
  }
}
