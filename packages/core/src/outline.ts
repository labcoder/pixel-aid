import type { OutlineCleanupDiagnostics, OutlineMode, RGBAImage } from "@pixelaid/shared";
import { clampByte, parseHexColor, rgbToHex, unpackRgb } from "./color";
import { cloneImage } from "./image";

export type OutlineCleanupOptions = {
  color?: string | undefined;
  sourceColors?: string[] | undefined;
  alpha?: number | undefined;
  size?: number | undefined;
  removeOrphans?: boolean;
  closeGaps?: boolean;
  preserveSinglePixelDetails?: boolean;
  alphaThreshold?: number;
  backgroundTolerance?: number;
};

export type OutlineCleanupResult = {
  image: RGBAImage;
  diagnostics: OutlineCleanupDiagnostics;
};

export type OutlineColorCandidate = {
  color: string;
  count: number;
  outsideContact: number;
  luma: number;
  score: number;
};

const DARK_EDGE_LUMA = 96;
const OUTLINE_CANDIDATE_LUMA = 168;
const OUTLINE_BUCKET_DISTANCE = 28;
const SOURCE_COLOR_MATCH_DISTANCE = 18;

export function applyOutlineCleanup(image: RGBAImage, mode: OutlineMode, options: OutlineCleanupOptions = {}): RGBAImage {
  return applyOutlineCleanupDetailed(image, mode, options).image;
}

export function applyOutlineCleanupDetailed(image: RGBAImage, mode: OutlineMode, options: OutlineCleanupOptions = {}): OutlineCleanupResult {
  const candidateOptions: Pick<OutlineCleanupOptions, "alphaThreshold" | "backgroundTolerance"> = {};
  if (options.alphaThreshold !== undefined) {
    candidateOptions.alphaThreshold = options.alphaThreshold;
  }
  if (options.backgroundTolerance !== undefined) {
    candidateOptions.backgroundTolerance = options.backgroundTolerance;
  }
  const detectedCandidateCount = mode === "none" ? 0 : detectOutlineColorCandidates(image, candidateOptions).length;
  const diagnostics = createOutlineDiagnostics(mode, normalizeSourceColors(options.sourceColors).length, detectedCandidateCount);

  if (mode === "none" && !options.removeOrphans && !options.closeGaps) {
    diagnostics.summary = "outline cleanup disabled";
    return { image: cloneImage(image), diagnostics };
  }

  const alphaThreshold = options.alphaThreshold ?? 8;
  const backgroundTolerance = options.backgroundTolerance ?? 18;
  const background = estimateCornerBackground(image);
  const output = cloneImage(image);
  const rawSubjectMask = buildSubjectMask(image, alphaThreshold, background, backgroundTolerance);
  let subjectMask = rawSubjectMask;

  if (options.removeOrphans) {
    subjectMask = removeOrphanComponents(subjectMask, image.width, image.height, options.preserveSinglePixelDetails ?? true);
    clearRemovedSubjectPixels(output, rawSubjectMask, subjectMask);
  }

  if (options.closeGaps) {
    const gapClosedMask = closeOnePixelGaps(subjectMask, image.width, image.height);
    fillClosedSubjectGaps(output, image, subjectMask, gapClosedMask);
    subjectMask = gapClosedMask;
  }

  if (mode === "none") {
    diagnostics.summary = summarizeOutlineDiagnostics(diagnostics);
    return { image: output, diagnostics };
  }

  const outlineAlpha = clampByte(options.alpha ?? 255);
  const size = normalizeOutlineSize(options.size ?? 1);
  const selectedSourceColors = normalizeSourceColors(options.sourceColors);
  diagnostics.explicitSourceColorCount = selectedSourceColors.length;
  const detectedOutlineColor = selectedSourceColors[0] ?? detectExistingOutlineColor(image, alphaThreshold, background, backgroundTolerance);
  const outlineColor =
    options.color !== undefined
      ? parseHexColor(options.color)
      : mode === "repairExisting"
        ? detectedOutlineColor
        : detectedOutlineColor ??
          detectDarkestSubjectColor(image, alphaThreshold, background, backgroundTolerance) ??
          0;

  if (outlineColor === null) {
    diagnostics.warnings.push("No outline candidate found for repairExisting; outline cleanup was skipped.");
    diagnostics.summary = summarizeOutlineDiagnostics(diagnostics);
    return { image: output, diagnostics };
  }
  diagnostics.selectedColor = rgbToHex(outlineColor);

  const [r, g, b] = unpackRgb(outlineColor, 255);
  const outlineSourceMask =
    mode === "repairExisting" ? buildOutlineSourceMask(image, subjectMask, selectedSourceColors.length > 0 ? selectedSourceColors : detectedOutlineColor !== null ? [detectedOutlineColor] : []) : undefined;
  const outlineNeighborMask =
    outlineSourceMask && outlineSourceMask.some((value) => value === 1) ? subtractMask(subjectMask, outlineSourceMask) : subjectMask;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const index = y * image.width + x;
      if (subjectMask[index] === 1 || !hasMaskedSubjectNeighbor(outlineNeighborMask, image.width, image.height, x, y, size)) {
        continue;
      }

      output.data[offset] = r;
      output.data[offset + 1] = g;
      output.data[offset + 2] = b;
      output.data[offset + 3] = outlineAlpha;
      diagnostics.appliedPixels += 1;
    }
  }

  if (mode === "repairExisting" && diagnostics.appliedPixels === 0 && selectedSourceColors.length === 0 && options.color === undefined) {
    diagnostics.warnings.push("No outline candidate found for repairExisting; outline cleanup was skipped.");
  }
  diagnostics.summary = summarizeOutlineDiagnostics(diagnostics);
  return { image: output, diagnostics };
}

function createOutlineDiagnostics(mode: OutlineMode, explicitSourceColorCount: number, detectedCandidateCount: number): OutlineCleanupDiagnostics {
  return {
    mode,
    explicitSourceColorCount,
    detectedCandidateCount,
    appliedPixels: 0,
    warnings: [],
    summary: "outline cleanup ready"
  };
}

function summarizeOutlineDiagnostics(diagnostics: OutlineCleanupDiagnostics): string {
  if (diagnostics.mode === "none") {
    return diagnostics.appliedPixels > 0 ? `outline cleanup adjusted ${diagnostics.appliedPixels} mask pixel${diagnostics.appliedPixels === 1 ? "" : "s"}` : "outline cleanup disabled";
  }
  if (diagnostics.appliedPixels === 0) {
    return diagnostics.selectedColor
      ? `outline cleanup selected ${diagnostics.selectedColor} but did not need to add pixels`
      : "outline cleanup skipped because no outline candidate was available";
  }
  return `outline cleanup used ${diagnostics.selectedColor ?? "auto"} and wrote ${diagnostics.appliedPixels} pixel${diagnostics.appliedPixels === 1 ? "" : "s"}`;
}

export function detectOutlineColorCandidates(
  image: RGBAImage,
  options: Pick<OutlineCleanupOptions, "alphaThreshold" | "backgroundTolerance"> & { maxCandidates?: number; bucketDistance?: number } = {}
): OutlineColorCandidate[] {
  const alphaThreshold = options.alphaThreshold ?? 8;
  const backgroundTolerance = options.backgroundTolerance ?? 18;
  const bucketDistance = options.bucketDistance ?? OUTLINE_BUCKET_DISTANCE;
  const background = estimateCornerBackground(image);
  const buckets: OutlineCandidateBucket[] = [];

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (
        isOutsidePixel(image, x, y, alphaThreshold, background, backgroundTolerance) ||
        !hasOutsideNeighbor(image, x, y, alphaThreshold, background, backgroundTolerance)
      ) {
        continue;
      }

      const offset = (y * image.width + x) * 4;
      const r = image.data[offset]!;
      const g = image.data[offset + 1]!;
      const b = image.data[offset + 2]!;
      const luma = luminance(r, g, b);
      if (luma > OUTLINE_CANDIDATE_LUMA) {
        continue;
      }

      addOutlineCandidateBucket(buckets, (r << 16) | (g << 8) | b, countOutsideNeighbors(image, x, y, alphaThreshold, background, backgroundTolerance), bucketDistance);
    }
  }

  return buckets
    .map((bucket) => {
      const representative = getBucketRepresentativeColor(bucket);
      const [r, g, b] = unpackRgb(representative, 255);
      const luma = luminance(r, g, b);
      const score = bucket.count * 10 + bucket.outsideContact * 2 + (255 - luma) / 32;
      return {
        color: rgbToHex(representative),
        count: bucket.count,
        outsideContact: bucket.outsideContact,
        luma,
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, options.maxCandidates ?? 8);
}

type OutlineCandidateBucket = {
  r: number;
  g: number;
  b: number;
  count: number;
  outsideContact: number;
  colors: Map<number, number>;
};

type BackgroundSample = {
  r: number;
  g: number;
  b: number;
  a: number;
};

function detectExistingOutlineColor(
  image: RGBAImage,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): number | null {
  let bestColor: number | null = null;
  let bestLuma = Number.POSITIVE_INFINITY;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (
        isOutsidePixel(image, x, y, alphaThreshold, background, backgroundTolerance) ||
        !hasOutsideNeighbor(image, x, y, alphaThreshold, background, backgroundTolerance)
      ) {
        continue;
      }

      const luma = luminance(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
      if (luma <= DARK_EDGE_LUMA && luma < bestLuma) {
        bestLuma = luma;
        bestColor = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
      }
    }
  }

  return bestColor;
}

function detectDarkestSubjectColor(
  image: RGBAImage,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): number | null {
  let bestColor: number | null = null;
  let bestLuma = Number.POSITIVE_INFINITY;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (isOutsidePixel(image, x, y, alphaThreshold, background, backgroundTolerance)) {
        continue;
      }

      const offset = (y * image.width + x) * 4;
      const luma = luminance(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
      if (luma < bestLuma) {
        bestLuma = luma;
        bestColor = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
      }
    }
  }

  return bestColor;
}

function normalizeSourceColors(colors: readonly string[] | undefined): number[] {
  if (!colors) {
    return [];
  }

  const parsed: number[] = [];
  for (const color of colors) {
    try {
      parsed.push(parseHexColor(color));
    } catch {
      // Ignore invalid UI-supplied colors instead of aborting the whole cleanup pass.
    }
  }

  return [...new Set(parsed)];
}

function buildOutlineSourceMask(image: RGBAImage, subjectMask: Uint8Array, sourceColors: readonly number[]): Uint8Array {
  const mask = new Uint8Array(subjectMask.length);
  if (sourceColors.length === 0) {
    return mask;
  }

  for (let index = 0; index < subjectMask.length; index += 1) {
    if (subjectMask[index] === 0) {
      continue;
    }

    const offset = index * 4;
    const color = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
    if (sourceColors.some((sourceColor) => colorDistance(color, sourceColor) <= SOURCE_COLOR_MATCH_DISTANCE)) {
      mask[index] = 1;
    }
  }

  return mask;
}

function subtractMask(subjectMask: Uint8Array, subtract: Uint8Array): Uint8Array {
  const output = new Uint8Array(subjectMask.length);
  for (let index = 0; index < subjectMask.length; index += 1) {
    output[index] = subjectMask[index] === 1 && subtract[index] === 0 ? 1 : 0;
  }
  return output;
}

function buildSubjectMask(
  image: RGBAImage,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!isOutsidePixel(image, x, y, alphaThreshold, background, backgroundTolerance)) {
        mask[y * image.width + x] = 1;
      }
    }
  }

  return mask;
}

function addOutlineCandidateBucket(buckets: OutlineCandidateBucket[], color: number, outsideContact: number, bucketDistance: number): void {
  let bestBucket: OutlineCandidateBucket | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const bucket of buckets) {
    const bucketColor = (Math.round(bucket.r / bucket.count) << 16) | (Math.round(bucket.g / bucket.count) << 8) | Math.round(bucket.b / bucket.count);
    const distance = colorDistance(color, bucketColor);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestBucket = bucket;
    }
  }

  if (!bestBucket || bestDistance > bucketDistance) {
    const [r, g, b] = unpackRgb(color, 255);
    buckets.push({
      r,
      g,
      b,
      count: 1,
      outsideContact,
      colors: new Map([[color, 1]])
    });
    return;
  }

  const [r, g, b] = unpackRgb(color, 255);
  bestBucket.r += r;
  bestBucket.g += g;
  bestBucket.b += b;
  bestBucket.count += 1;
  bestBucket.outsideContact += outsideContact;
  bestBucket.colors.set(color, (bestBucket.colors.get(color) ?? 0) + 1);
}

function getBucketRepresentativeColor(bucket: OutlineCandidateBucket): number {
  let representative = 0;
  let bestCount = -1;
  for (const [color, count] of bucket.colors) {
    if (count > bestCount) {
      representative = color;
      bestCount = count;
    }
  }
  return representative;
}

function removeOrphanComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  preserveSinglePixelDetails: boolean
): Uint8Array {
  const labels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const sizes: number[] = [0];
  let label = 0;
  let largestSize = 0;

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 0 || labels[index] !== 0) {
      continue;
    }

    label += 1;
    let read = 0;
    let write = 0;
    labels[index] = label;
    queue[write] = index;
    write += 1;

    while (read < write) {
      const current = queue[read]!;
      read += 1;
      const x = current % width;
      const y = Math.floor(current / width);

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }

          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }

          const neighbor = ny * width + nx;
          if (mask[neighbor] === 0 || labels[neighbor] !== 0) {
            continue;
          }

          labels[neighbor] = label;
          queue[write] = neighbor;
          write += 1;
        }
      }
    }

    sizes[label] = write;
    if (write > largestSize) {
      largestSize = write;
    }
  }

  if (label <= 1) {
    return mask;
  }

  const minComponentSize = preserveSinglePixelDetails ? 2 : 4;
  const output = new Uint8Array(mask);
  for (let index = 0; index < output.length; index += 1) {
    const component = labels[index]!;
    if (component > 0 && sizes[component]! < minComponentSize && sizes[component]! < largestSize) {
      output[index] = 0;
    }
  }

  return output;
}

function closeOnePixelGaps(mask: Uint8Array, width: number, height: number): Uint8Array {
  const output = new Uint8Array(mask);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (mask[index] === 1) {
        continue;
      }

      const north = mask[index - width]!;
      const south = mask[index + width]!;
      const west = mask[index - 1]!;
      const east = mask[index + 1]!;
      if (north + south + west + east === 4 || countMaskedNeighbors(mask, width, height, x, y, 1) >= 7) {
        output[index] = 1;
      }
    }
  }

  return output;
}

function clearRemovedSubjectPixels(output: RGBAImage, rawMask: Uint8Array, cleanMask: Uint8Array): void {
  for (let index = 0; index < rawMask.length; index += 1) {
    if (rawMask[index] === 1 && cleanMask[index] === 0) {
      const offset = index * 4;
      output.data[offset] = 0;
      output.data[offset + 1] = 0;
      output.data[offset + 2] = 0;
      output.data[offset + 3] = 0;
    }
  }
}

function fillClosedSubjectGaps(output: RGBAImage, image: RGBAImage, sourceMask: Uint8Array, cleanMask: Uint8Array): void {
  for (let index = 0; index < cleanMask.length; index += 1) {
    if (sourceMask[index] === 1 || cleanMask[index] === 0) {
      continue;
    }

    const x = index % image.width;
    const y = Math.floor(index / image.width);
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let count = 0;

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }

        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
          continue;
        }

        const neighbor = ny * image.width + nx;
        if (sourceMask[neighbor] === 0) {
          continue;
        }

        const offset = neighbor * 4;
        r += image.data[offset]!;
        g += image.data[offset + 1]!;
        b += image.data[offset + 2]!;
        a += image.data[offset + 3]!;
        count += 1;
      }
    }

    if (count === 0) {
      continue;
    }

    const offset = index * 4;
    output.data[offset] = Math.round(r / count);
    output.data[offset + 1] = Math.round(g / count);
    output.data[offset + 2] = Math.round(b / count);
    output.data[offset + 3] = Math.round(a / count);
  }
}

function hasMaskedSubjectNeighbor(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  size: number
): boolean {
  for (let dy = -size; dy <= size; dy += 1) {
    for (let dx = -size; dx <= size; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      if (mask[ny * width + nx] === 1) {
        return true;
      }
    }
  }

  return false;
}

function countMaskedNeighbors(mask: Uint8Array, width: number, height: number, x: number, y: number, size: number): number {
  let count = 0;
  for (let dy = -size; dy <= size; dy += 1) {
    for (let dx = -size; dx <= size; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      count += mask[ny * width + nx]!;
    }
  }

  return count;
}

function normalizeOutlineSize(size: number): number {
  if (!Number.isFinite(size)) {
    return 1;
  }

  return Math.max(1, Math.min(8, Math.round(size)));
}

function hasOutsideNeighbor(
  image: RGBAImage,
  x: number,
  y: number,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      if (isOutsidePixel(image, x + dx, y + dy, alphaThreshold, background, backgroundTolerance)) {
        return true;
      }
    }
  }

  return false;
}

function countOutsideNeighbors(
  image: RGBAImage,
  x: number,
  y: number,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      if (isOutsidePixel(image, x + dx, y + dy, alphaThreshold, background, backgroundTolerance)) {
        count += 1;
      }
    }
  }

  return count;
}

function isOutsidePixel(
  image: RGBAImage,
  x: number,
  y: number,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): boolean {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return true;
  }

  const offset = (y * image.width + x) * 4;
  const alpha = image.data[offset + 3]!;
  if (alpha <= alphaThreshold) {
    return true;
  }

  return (
    Math.abs(image.data[offset]! - background.r) +
      Math.abs(image.data[offset + 1]! - background.g) +
      Math.abs(image.data[offset + 2]! - background.b) +
      Math.abs(alpha - background.a) <=
    backgroundTolerance
  );
}

function colorDistance(left: number, right: number): number {
  const [lr, lg, lb] = unpackRgb(left, 255);
  const [rr, rg, rb] = unpackRgb(right, 255);
  return Math.abs(lr - rr) + Math.abs(lg - rg) + Math.abs(lb - rb);
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
      const topLeft = (y * image.width + x) * 4;
      const topRight = (y * image.width + image.width - sampleSize + x) * 4;
      const bottomLeft = ((image.height - sampleSize + y) * image.width + x) * 4;
      const bottomRight = ((image.height - sampleSize + y) * image.width + image.width - sampleSize + x) * 4;

      r += image.data[topLeft]! + image.data[topRight]! + image.data[bottomLeft]! + image.data[bottomRight]!;
      g += image.data[topLeft + 1]! + image.data[topRight + 1]! + image.data[bottomLeft + 1]! + image.data[bottomRight + 1]!;
      b += image.data[topLeft + 2]! + image.data[topRight + 2]! + image.data[bottomLeft + 2]! + image.data[bottomRight + 2]!;
      a += image.data[topLeft + 3]! + image.data[topRight + 3]! + image.data[bottomLeft + 3]! + image.data[bottomRight + 3]!;
      count += 4;
    }
  }

  return {
    r: r / count,
    g: g / count,
    b: b / count,
    a: a / count
  };
}

function luminance(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
