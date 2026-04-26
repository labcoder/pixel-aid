import type { Rect, RGBAImage, SheetLayoutDetection, SheetSliceOptions, SpriteFrame } from "@pixelaid/shared";

type Band = {
  start: number;
  end: number;
};

type Segment = {
  x: number;
  w: number;
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
  const rawRows = rowBands
    .map((band) => ({
      band,
      segments: chooseFrameSegments(segmentsForBand(image, band, background))
    }))
    .filter((row) => row.segments.length > 0);

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
  if (rows < 2 || columns < 2) {
    warnings.push("Detected layout has too few repeated frames for high confidence.");
  }

  const repeatedConfidence = Math.min(0.96, 0.52 + Math.min(0.24, rows * 0.06) + Math.min(0.2, columns * 0.04));
  const confidence = rows >= 2 && columns >= 2 ? repeatedConfidence : Math.min(0.4, repeatedConfidence);

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

function chooseFrameSegments(segments: Segment[]): Segment[] {
  if (segments.length <= 2) {
    return segments;
  }

  const gaps = gapsBetween(segments);
  if (gaps.length === 0) {
    return segments;
  }

  const typicalGap = Math.max(1, medianInteger(gaps));
  const largeGap = Math.max(20, typicalGap * 2.5);
  const cutIndex = gaps.findIndex((gap, index) => gap >= largeGap && segments.length - index - 1 >= 2);
  const trimmed = cutIndex >= 0 ? segments.slice(cutIndex + 1) : segments;
  const widths = trimmed.map((segment) => segment.w);
  const typicalWidth = medianInteger(widths);

  return trimmed.filter((segment) => segment.w >= typicalWidth * 0.65 && segment.w <= typicalWidth * 1.45);
}

function gapsBetween(segments: Segment[]): number[] {
  const gaps: number[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    gaps.push(Math.max(0, segments[index]!.x - (segments[index - 1]!.x + segments[index - 1]!.w)));
  }
  return gaps;
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
