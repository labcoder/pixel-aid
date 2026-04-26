import type { Rect, RGBAImage, SheetLayoutDetection, SheetLayoutDiagnostics, SheetSliceOptions, SpriteFrame } from "@pixelaid/shared";

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
  const rawRows = alignDetectedRowsToSharedColumns(
    rowBands
    .map((band) => {
      const resolved = resolveFrameSegments(image, band, background);
      return {
        band,
        segments: resolved.segments,
        usedOutlinedCells: resolved.usedOutlinedCells,
        usedContentCentering: resolved.usedContentCentering,
        usedComponentMerging: resolved.usedComponentMerging,
        usedDriftFitting: resolved.usedDriftFitting,
        mergedComponentCount: resolved.mergedComponentCount,
        maxCenterDriftPx: resolved.maxCenterDriftPx
      };
    })
    .filter((row) => row.segments.length > 0)
  );

  if (rawRows.length === 0) {
    return emptyDetection("No repeated sheet rows detected");
  }

  const frameWidths = rawRows.flatMap((row) => row.segments.map((segment) => segment.w));
  const frameHeights = rawRows.map((row) => row.band.end - row.band.start + 1);
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

  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
    const row = rawRows[rowIndex]!;
    const rowName = `row_${rowIndex + 1}`;
    const minX = Math.min(...row.segments.map((segment) => segment.x));
    const maxX = Math.max(...row.segments.map((segment) => segment.x + segment.w));
    rowRects.push({ x: minX, y: row.band.start, w: maxX - minX, h: row.band.end - row.band.start + 1 });

    for (let column = 0; column < row.segments.length; column += 1) {
      const segment = row.segments[column]!;
      frames.push({
        name: `${rowName}_${column.toString().padStart(3, "0")}`,
        rect: { x: segment.x, y: row.band.start, w: frameWidth, h: frameHeight },
        pivot: { x: Math.floor(frameWidth / 2), y: frameHeight },
        durationMs: 120,
        tags: [rowName]
      });
    }
  }

  const rowAnimations = rowFrameCounts.map((frameCount, index) => {
    const rowName = `row_${index + 1}`;
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
    usedContentCentering: rawRows.some((row) => row.usedContentCentering)
  });

  return {
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
    confidence,
    diagnostics,
    reason: `Detected ${rows} sprite-sheet row${rows === 1 ? "" : "s"} with up to ${columns} frame${columns === 1 ? "" : "s"} per row`,
    warnings
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

function resolveFrameSegments(image: RGBAImage, band: Band, background: [number, number, number, number]): ResolvedSegments {
  const sourceSegments = segmentsForBand(image, band, background);
  const contentSegments = chooseFrameSegments(sourceSegments);
  const outlinedSegments = outlinedCellSegmentsForBand(image, band, background, sourceSegments);

  if (outlinedSegments.length >= 2 && outlinedSegments.length > contentSegments.length) {
    return {
      segments: outlinedSegments,
      usedOutlinedCells: true,
      usedContentCentering: false,
      usedComponentMerging: false,
      usedDriftFitting: false,
      mergedComponentCount: 0,
      maxCenterDriftPx: 0
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
      maxCenterDriftPx: drifted.maxCenterDriftPx
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
    maxCenterDriftPx: 0
  };
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

  const typicalGap = Math.max(1, medianInteger(gaps));
  const largeGap = Math.max(20, typicalGap * 1.6);
  const cutIndex = gaps.findIndex((gap, index) => gap >= largeGap && segments.length - index - 1 >= 2);
  const trimmed = cutIndex >= 0 ? segments.slice(cutIndex + 1) : segments;
  const widths = trimmed.map((segment) => segment.w);
  const typicalWidth = medianInteger(widths);

  return trimmed.filter((segment) => segment.w >= typicalWidth * 0.65 && segment.w <= typicalWidth * 1.45);
}

function mergeDisconnectedComponents(segments: Segment[]): ComponentMergeResult {
  if (segments.length < 4) {
    return { segments, usedComponentMerging: false, mergedComponentCount: 0 };
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

  if (contentOccupancy >= 0.78 || (centerGapSpread < 0.12 && widthSpread < 0.18)) {
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
  usedContentCentering
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
}): SheetLayoutDiagnostics {
  const averageBandHeight =
    frameHeights.length > 0 ? Math.round(frameHeights.reduce((total, height) => total + height, 0) / frameHeights.length) : 0;
  const minHeight = frameHeights.length > 0 ? Math.min(...frameHeights) : 0;
  const maxHeight = frameHeights.length > 0 ? Math.max(...frameHeights) : 0;
  const heightSpreadRatio = averageBandHeight > 0 ? (maxHeight - minHeight) / averageBandHeight : 0;
  const rowLabel = rows >= 3 && heightSpreadRatio <= 0.2 ? "high" : rows >= 2 && heightSpreadRatio <= 0.35 ? "medium" : "low";
  const columnLabel =
    columns >= 2 && maxCenterDriftPx <= 1 && !usedComponentMerging
      ? "high"
      : columns >= 2 && maxCenterDriftPx <= Math.max(4, pitchPx * 0.12)
        ? "medium"
        : "low";
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
    notes
  };
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
    confidence: 0,
    reason,
    warnings: [reason]
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
