import type { MorphologyCleanupSettings, MorphologyDiagnostics, RGBAImage } from "@pixelaid/shared";
import { cloneImage } from "./image";

export type MorphologyMaskOptions = {
  connectivity?: 4 | 8;
};

export type FillTinyHolesOptions = MorphologyMaskOptions & {
  maxPixels?: number;
};

export type RemoveTinyComponentsOptions = MorphologyMaskOptions & {
  maxPixels?: number;
  preserveSinglePixelDetails?: boolean;
};

export type MaskArtifactOptions = MorphologyMaskOptions & {
  maxHolePixels?: number;
  maxComponentPixels?: number;
};

export type MorphologyCleanupResult = {
  image: RGBAImage;
  diagnostics: MorphologyDiagnostics;
};

const DEFAULT_ALPHA_THRESHOLD = 1;
const DEFAULT_MAX_HOLE_PIXELS = 1;
const DEFAULT_MAX_COMPONENT_PIXELS = 1;
const MATTE_PEEL_ITERATIONS = 8;
const MAX_MATTE_HINT_COLORS = 12;
const DARK_BACKGROUND_FAMILY_MASK = 8;

export function openMask(mask: Uint8Array, width: number, height: number, options: MorphologyMaskOptions = {}): Uint8Array {
  return dilateMask(erodeMask(mask, width, height, options), width, height, options);
}

export function closeMask(mask: Uint8Array, width: number, height: number, options: MorphologyMaskOptions = {}): Uint8Array {
  return erodeMask(dilateMask(mask, width, height, options), width, height, options);
}

export function fillTinyHoles(mask: Uint8Array, width: number, height: number, options: FillTinyHolesOptions = {}): Uint8Array {
  const maxPixels = normalizePositiveInteger(options.maxPixels, DEFAULT_MAX_HOLE_PIXELS);
  if (maxPixels <= 0 || mask.length === 0) {
    return new Uint8Array(mask);
  }

  const labels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const output = new Uint8Array(mask);
  let label = 0;

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 0 || labels[index] !== 0) {
      continue;
    }

    label += 1;
    const component = floodMaskComponent(mask, width, height, index, 0, label, labels, queue, options.connectivity ?? 4);
    if (!component.touchesEdge && component.size <= maxPixels) {
      for (let i = 0; i < component.size; i += 1) {
        output[queue[i]!] = 1;
      }
    }
  }

  return output;
}

export function removeTinyComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  options: RemoveTinyComponentsOptions = {}
): Uint8Array {
  const maxPixels = normalizePositiveInteger(options.maxPixels, DEFAULT_MAX_COMPONENT_PIXELS);
  const preserveSinglePixelDetails = options.preserveSinglePixelDetails ?? true;
  if (maxPixels <= 0 || mask.length === 0) {
    return new Uint8Array(mask);
  }

  const labels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const sizes: number[] = [0];
  let label = 0;
  let largestLabel = 0;
  let largestSize = 0;

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 0 || labels[index] !== 0) {
      continue;
    }

    label += 1;
    const component = floodMaskComponent(mask, width, height, index, 1, label, labels, queue, options.connectivity ?? 4);
    sizes[label] = component.size;
    if (component.size > largestSize) {
      largestSize = component.size;
      largestLabel = label;
    }
  }

  if (label <= 1) {
    return new Uint8Array(mask);
  }

  const output = new Uint8Array(mask);
  for (let index = 0; index < output.length; index += 1) {
    const component = labels[index]!;
    const size = sizes[component] ?? 0;
    if (
      component > 0 &&
      component !== largestLabel &&
      size <= maxPixels &&
      !(preserveSinglePixelDetails && size === 1)
    ) {
      output[index] = 0;
    }
  }

  return output;
}

export function analyzeMaskArtifacts(
  mask: Uint8Array,
  width: number,
  height: number,
  options: MaskArtifactOptions = {}
): Pick<MorphologyDiagnostics, "pinholePixels" | "tinyComponentPixels" | "brokenOutlinePixels"> {
  const maxHolePixels = normalizePositiveInteger(options.maxHolePixels, DEFAULT_MAX_HOLE_PIXELS);
  const maxComponentPixels = normalizePositiveInteger(options.maxComponentPixels, DEFAULT_MAX_COMPONENT_PIXELS);
  const fillOptions: FillTinyHolesOptions = { maxPixels: maxHolePixels };
  const removeOptions: RemoveTinyComponentsOptions = { maxPixels: maxComponentPixels, preserveSinglePixelDetails: false };
  if (options.connectivity !== undefined) {
    fillOptions.connectivity = options.connectivity;
    removeOptions.connectivity = options.connectivity;
  }
  const filled = fillTinyHoles(mask, width, height, fillOptions);
  const removed = removeTinyComponents(mask, width, height, removeOptions);
  const closed = closeMask(mask, width, height, { connectivity: options.connectivity ?? 8 });

  return {
    pinholePixels: countAddedPixels(mask, filled),
    tinyComponentPixels: countRemovedPixels(mask, removed),
    brokenOutlinePixels: countAddedPixels(mask, closed)
  };
}

export function applyMorphologyCleanup(
  image: RGBAImage,
  settings: MorphologyCleanupSettings | undefined
): MorphologyCleanupResult {
  const diagnostics = createMorphologyDiagnostics(settings);
  if (!settings?.enabled) {
    return { image: cloneImage(image), diagnostics };
  }

  const alphaThreshold = normalizeAlphaThreshold(settings.alphaThreshold);
  const connectivity = settings.connectivity ?? 8;
  const sourceMask = buildAlphaMask(image, alphaThreshold);
  let currentMask = sourceMask;

  if (settings.open) {
    const nextMask = openMask(currentMask, image.width, image.height, { connectivity });
    diagnostics.openedPixels += countRemovedPixels(currentMask, nextMask);
    currentMask = nextMask;
    diagnostics.operationCount += 1;
  }

  if (settings.close) {
    const nextMask = closeMask(currentMask, image.width, image.height, { connectivity });
    diagnostics.closedPixels += countAddedPixels(currentMask, nextMask);
    currentMask = nextMask;
    diagnostics.operationCount += 1;
  }

  if (settings.fillTinyHoles) {
    const fillOptions: FillTinyHolesOptions = { connectivity: settings.connectivity ?? 4 };
    if (settings.maxHolePixels !== undefined) {
      fillOptions.maxPixels = settings.maxHolePixels;
    }
    const nextMask = fillTinyHoles(currentMask, image.width, image.height, fillOptions);
    diagnostics.filledHolePixels += countAddedPixels(currentMask, nextMask);
    currentMask = nextMask;
    diagnostics.operationCount += 1;
  }

  if (settings.removeTinyComponents) {
    const removeOptions: RemoveTinyComponentsOptions = {
      preserveSinglePixelDetails: settings.preserveSinglePixelDetails ?? true,
      connectivity: settings.connectivity ?? 4
    };
    if (settings.maxComponentPixels !== undefined) {
      removeOptions.maxPixels = settings.maxComponentPixels;
    }
    const nextMask = removeTinyComponents(currentMask, image.width, image.height, removeOptions);
    diagnostics.removedComponentPixels += countRemovedPixels(currentMask, nextMask);
    currentMask = nextMask;
    diagnostics.operationCount += 1;
  }

  const artifactOptions: MaskArtifactOptions = { connectivity };
  if (settings.maxHolePixels !== undefined) {
    artifactOptions.maxHolePixels = settings.maxHolePixels;
  }
  if (settings.maxComponentPixels !== undefined) {
    artifactOptions.maxComponentPixels = settings.maxComponentPixels;
  }
  const artifactDiagnostics = analyzeMaskArtifacts(currentMask, image.width, image.height, artifactOptions);
  diagnostics.pinholePixels = artifactDiagnostics.pinholePixels;
  diagnostics.tinyComponentPixels = artifactDiagnostics.tinyComponentPixels;
  diagnostics.brokenOutlinePixels = artifactDiagnostics.brokenOutlinePixels;

  let output = applyMaskToAlphaImage(image, sourceMask, currentMask, alphaThreshold);
  if (settings.matteCleanup) {
    const matteResult = applyMatteCleanup(output, alphaThreshold);
    output = matteResult.image;
    diagnostics.mattePixels = matteResult.clearedPixels;
    diagnostics.matteColorCount = matteResult.hintColorCount;
    if (matteResult.clearedPixels > 0) {
      diagnostics.operationCount += 1;
    }
  }

  addMorphologyWarnings(diagnostics, settings);

  return {
    image: output,
    diagnostics
  };
}

function addMorphologyWarnings(diagnostics: MorphologyDiagnostics, settings: MorphologyCleanupSettings): void {
  if (diagnostics.filledHolePixels > 0) {
    diagnostics.warnings.push(
      `Filled ${diagnostics.filledHolePixels} alpha pinhole pixel${diagnostics.filledHolePixels === 1 ? "" : "s"} during morphology cleanup.`
    );
  }
  if (diagnostics.removedComponentPixels > 0) {
    diagnostics.warnings.push(
      `Removed ${diagnostics.removedComponentPixels} tiny component pixel${diagnostics.removedComponentPixels === 1 ? "" : "s"} during morphology cleanup.`
    );
  }
  if (diagnostics.mattePixels > 0) {
    diagnostics.warnings.push(
      `Cleared ${diagnostics.mattePixels} matte fringe pixel${diagnostics.mattePixels === 1 ? "" : "s"} during morphology cleanup.`
    );
  }
  if (settings.removeTinyComponents && (settings.preserveSinglePixelDetails ?? true) && diagnostics.tinyComponentPixels > 0) {
    diagnostics.warnings.push(
      `Preserved ${diagnostics.tinyComponentPixels} tiny component pixel${diagnostics.tinyComponentPixels === 1 ? "" : "s"} because preserveSinglePixelDetails is enabled.`
    );
  }
  if (!settings.close && diagnostics.brokenOutlinePixels > 0) {
    diagnostics.warnings.push(
      `Detected ${diagnostics.brokenOutlinePixels} possible broken outline gap pixel${diagnostics.brokenOutlinePixels === 1 ? "" : "s"}; enable close to repair them.`
    );
  }
}

function erodeMask(mask: Uint8Array, width: number, height: number, options: MorphologyMaskOptions): Uint8Array {
  const output = new Uint8Array(mask.length);
  const connectivity = options.connectivity ?? 4;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (mask[index] === 0 || !allKernelPixelsSet(mask, width, height, x, y, connectivity)) {
        continue;
      }
      output[index] = 1;
    }
  }

  return output;
}

function dilateMask(mask: Uint8Array, width: number, height: number, options: MorphologyMaskOptions): Uint8Array {
  const output = new Uint8Array(mask.length);
  const connectivity = options.connectivity ?? 4;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (mask[index] === 1 || anyKernelPixelSet(mask, width, height, x, y, connectivity)) {
        output[index] = 1;
      }
    }
  }

  return output;
}

function allKernelPixelsSet(mask: Uint8Array, width: number, height: number, x: number, y: number, connectivity: 4 | 8): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!isKernelOffset(dx, dy, connectivity)) {
        continue;
      }

      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || mask[ny * width + nx] === 0) {
        return false;
      }
    }
  }

  return true;
}

function anyKernelPixelSet(mask: Uint8Array, width: number, height: number, x: number, y: number, connectivity: 4 | 8): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!isKernelOffset(dx, dy, connectivity)) {
        continue;
      }

      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx] === 1) {
        return true;
      }
    }
  }

  return false;
}

function isKernelOffset(dx: number, dy: number, connectivity: 4 | 8): boolean {
  if (dx === 0 && dy === 0) {
    return true;
  }
  return connectivity === 8 ? Math.max(Math.abs(dx), Math.abs(dy)) === 1 : Math.abs(dx) + Math.abs(dy) === 1;
}

function floodMaskComponent(
  mask: Uint8Array,
  width: number,
  height: number,
  start: number,
  value: 0 | 1,
  label: number,
  labels: Int32Array,
  queue: Int32Array,
  connectivity: 4 | 8
): { size: number; touchesEdge: boolean } {
  let read = 0;
  let write = 0;
  let touchesEdge = false;
  labels[start] = label;
  queue[write] = start;
  write += 1;

  while (read < write) {
    const current = queue[read]!;
    read += 1;
    const x = current % width;
    const y = Math.floor(current / width);
    touchesEdge = touchesEdge || x === 0 || y === 0 || x === width - 1 || y === height - 1;

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        if (connectivity === 4 && Math.abs(dx) + Math.abs(dy) !== 1) {
          continue;
        }

        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }

        const neighbor = ny * width + nx;
        if (mask[neighbor] !== value || labels[neighbor] !== 0) {
          continue;
        }

        labels[neighbor] = label;
        queue[write] = neighbor;
        write += 1;
      }
    }
  }

  return { size: write, touchesEdge };
}

function buildAlphaMask(image: RGBAImage, alphaThreshold: number): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = image.data[index * 4 + 3]! >= alphaThreshold ? 1 : 0;
  }
  return mask;
}

function applyMaskToAlphaImage(image: RGBAImage, sourceMask: Uint8Array, cleanMask: Uint8Array, alphaThreshold: number): RGBAImage {
  const output = cloneImage(image);
  for (let index = 0; index < cleanMask.length; index += 1) {
    if (sourceMask[index] === cleanMask[index]) {
      continue;
    }

    const offset = index * 4;
    if (cleanMask[index] === 0) {
      output.data[offset] = 0;
      output.data[offset + 1] = 0;
      output.data[offset + 2] = 0;
      output.data[offset + 3] = 0;
      continue;
    }

    fillAddedSubjectPixel(output, image, cleanMask, index, alphaThreshold);
  }
  return output;
}

function fillAddedSubjectPixel(
  output: RGBAImage,
  source: RGBAImage,
  mask: Uint8Array,
  index: number,
  alphaThreshold: number
): void {
  const x = index % source.width;
  const y = Math.floor(index / source.width);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) {
        continue;
      }

      const neighbor = ny * source.width + nx;
      const sourceOffset = neighbor * 4;
      if (mask[neighbor] === 0 || source.data[sourceOffset + 3]! < alphaThreshold) {
        continue;
      }

      r += source.data[sourceOffset]!;
      g += source.data[sourceOffset + 1]!;
      b += source.data[sourceOffset + 2]!;
      count += 1;
    }
  }

  const offset = index * 4;
  if (count > 0) {
    output.data[offset] = Math.round(r / count);
    output.data[offset + 1] = Math.round(g / count);
    output.data[offset + 2] = Math.round(b / count);
  }
  output.data[offset + 3] = 255;
}

type MatteCleanupResult = {
  image: RGBAImage;
  clearedPixels: number;
  hintColorCount: number;
};

type MatteHints = {
  colors: Uint8Array;
  masks: Uint8Array;
  count: number;
};

type MatteCandidateKind = "none" | "hint" | "protectedHint" | "fallback";

function applyMatteCleanup(image: RGBAImage, alphaThreshold: number): MatteCleanupResult {
  const output = cloneImage(image);
  const outsideMask = buildOutsideMask(output, alphaThreshold);
  const hints = collectMatteHints(image, alphaThreshold);
  let clearedPixels = clearExteriorConnectedMatte(output, outsideMask, hints, alphaThreshold);

  for (let pass = 0; pass < MATTE_PEEL_ITERATIONS; pass += 1) {
    const toClear = new Uint8Array(image.width * image.height);
    let passCleared = 0;

    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const index = y * image.width + x;
        if (outsideMask[index] === 1) {
          continue;
        }

        const offset = index * 4;
        if (output.data[offset + 3]! < alphaThreshold) {
          continue;
        }

        const candidate = classifyMatteCandidate(output.data, offset, hints);
        if (candidate === "none") {
          continue;
        }

        if (!hasOutsideNeighbor(outsideMask, image.width, image.height, x, y)) {
          continue;
        }

        if (
          (candidate === "fallback" &&
            (hasStrongLocalColorSupport(output, outsideMask, x, y, alphaThreshold) ||
              hasSubjectColorSupport(output, outsideMask, x, y, alphaThreshold, hints, 2))) ||
          (candidate === "protectedHint" && hasSubjectColorNeighbor(output, outsideMask, x, y, alphaThreshold, hints))
        ) {
          continue;
        }

        toClear[index] = 1;
        passCleared += 1;
      }
    }

    if (passCleared === 0) {
      break;
    }

    for (let index = 0; index < toClear.length; index += 1) {
      if (toClear[index] === 0) {
        continue;
      }
      const offset = index * 4;
      output.data[offset] = 0;
      output.data[offset + 1] = 0;
      output.data[offset + 2] = 0;
      output.data[offset + 3] = 0;
      outsideMask[index] = 1;
    }

    clearedPixels += passCleared;
  }

  clearedPixels += clearResidualDarkDominantMatte(output, outsideMask, hints, alphaThreshold);

  return { image: output, clearedPixels, hintColorCount: hints.count };
}

function clearResidualDarkDominantMatte(
  image: RGBAImage,
  outsideMask: Uint8Array,
  hints: MatteHints,
  alphaThreshold: number
): number {
  let clearedPixels = 0;
  for (let index = 0; index < outsideMask.length; index += 1) {
    if (outsideMask[index] === 1) {
      continue;
    }

    const offset = index * 4;
    if (image.data[offset + 3]! < alphaThreshold) {
      continue;
    }

    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    if (isProtectedSubjectColor(r, g, b)) {
      continue;
    }
    if (!isDarkDominantMatteColor(r, g, b) || !matchesMatteHint(r, g, b, hints)) {
      continue;
    }

    const x = index % image.width;
    const y = Math.floor(index / image.width);
    if (hasSubjectColorNeighbor(image, outsideMask, x, y, alphaThreshold, hints)) {
      continue;
    }

    image.data[offset] = 0;
    image.data[offset + 1] = 0;
    image.data[offset + 2] = 0;
    image.data[offset + 3] = 0;
    outsideMask[index] = 1;
    clearedPixels += 1;
  }
  return clearedPixels;
}

function clearExteriorConnectedMatte(
  image: RGBAImage,
  outsideMask: Uint8Array,
  hints: MatteHints,
  alphaThreshold: number
): number {
  const queue = new Int32Array(image.width * image.height);
  let read = 0;
  let write = 0;
  let clearedPixels = 0;

  for (let index = 0; index < outsideMask.length; index += 1) {
    if (outsideMask[index] === 1) {
      queue[write] = index;
      write += 1;
    }
  }

  while (read < write) {
    const current = queue[read]!;
    read += 1;
    const x = current % image.width;
    const y = Math.floor(current / image.width);

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
        if (outsideMask[neighbor] === 1) {
          continue;
        }

        const offset = neighbor * 4;
        if (image.data[offset + 3]! < alphaThreshold) {
          outsideMask[neighbor] = 1;
          queue[write] = neighbor;
          write += 1;
          continue;
        }

        const candidate = classifyMatteCandidate(image.data, offset, hints);
        if (candidate === "none") {
          continue;
        }

        if (
          (candidate === "fallback" &&
            (hasStrongLocalColorSupport(image, outsideMask, nx, ny, alphaThreshold) ||
              hasSubjectColorSupport(image, outsideMask, nx, ny, alphaThreshold, hints, 2))) ||
          (candidate === "protectedHint" && hasSubjectColorNeighbor(image, outsideMask, nx, ny, alphaThreshold, hints))
        ) {
          continue;
        }

        image.data[offset] = 0;
        image.data[offset + 1] = 0;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = 0;
        outsideMask[neighbor] = 1;
        queue[write] = neighbor;
        write += 1;
        clearedPixels += 1;
      }
    }
  }

  return clearedPixels;
}

function buildOutsideMask(image: RGBAImage, alphaThreshold: number): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = image.data[index * 4 + 3]! < alphaThreshold ? 1 : 0;
  }
  return mask;
}

function collectMatteHints(image: RGBAImage, alphaThreshold: number): MatteHints {
  const bucketCounts = new Uint32Array(4096);
  const bucketR = new Uint32Array(4096);
  const bucketG = new Uint32Array(4096);
  const bucketB = new Uint32Array(4096);
  const allowDarkNeutralHints = hasCoolLowAlphaMatteEvidence(image, alphaThreshold);

  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! >= alphaThreshold) {
      continue;
    }

    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    if (!isMatteHintColor(r, g, b) && !isLowAlphaBackgroundHintColor(r, g, b, allowDarkNeutralHints)) {
      continue;
    }

    const bucket = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    bucketCounts[bucket] = bucketCounts[bucket]! + 1;
    bucketR[bucket] = bucketR[bucket]! + r;
    bucketG[bucket] = bucketG[bucket]! + g;
    bucketB[bucket] = bucketB[bucket]! + b;
  }

  const colors = new Uint8Array(MAX_MATTE_HINT_COLORS * 3);
  const masks = new Uint8Array(MAX_MATTE_HINT_COLORS);
  let count = 0;

  while (count < MAX_MATTE_HINT_COLORS) {
    let bestBucket = -1;
    let bestCount = 0;
    for (let bucket = 0; bucket < bucketCounts.length; bucket += 1) {
      if (bucketCounts[bucket]! > bestCount) {
        bestBucket = bucket;
        bestCount = bucketCounts[bucket]!;
      }
    }

    if (bestBucket < 0 || bestCount === 0) {
      break;
    }

    const colorOffset = count * 3;
    const r = Math.round(bucketR[bestBucket]! / bestCount);
    const g = Math.round(bucketG[bestBucket]! / bestCount);
    const b = Math.round(bucketB[bestBucket]! / bestCount);
    const mask = matteFamilyMask(r, g, b);
    if (mask !== 0 && !containsMatteFamily(masks, count, mask)) {
      colors[colorOffset] = r;
      colors[colorOffset + 1] = g;
      colors[colorOffset + 2] = b;
      masks[count] = mask;
      count += 1;
    }
    bucketCounts[bestBucket] = 0;
  }

  return { colors, masks, count };
}

function containsMatteFamily(masks: Uint8Array, count: number, mask: number): boolean {
  for (let index = 0; index < count; index += 1) {
    if (masks[index] === mask) {
      return true;
    }
  }
  return false;
}

function classifyMatteCandidate(data: Uint8ClampedArray, offset: number, hints: MatteHints): MatteCandidateKind {
  const r = data[offset]!;
  const g = data[offset + 1]!;
  const b = data[offset + 2]!;

  if (isProtectedSubjectColor(r, g, b)) {
    return "none";
  }

  if (hints.count > 0 && matchesMatteHint(r, g, b, hints)) {
    if (isDarkDominantMatteColor(r, g, b)) {
      return "hint";
    }
    return "hint";
  }

  if (isMutedArtificialMatteColor(r, g, b)) {
    return "hint";
  }

  return isArtificialChromaMatteColor(r, g, b) ? "fallback" : "none";
}

function matchesMatteHint(r: number, g: number, b: number, hints: MatteHints): boolean {
  const family = matteFamilyMask(r, g, b);
  if (family === 0) {
    return false;
  }

  for (let index = 0; index < hints.count; index += 1) {
    if (hints.masks[index] !== family) {
      continue;
    }

    const colorOffset = index * 3;
    const hr = hints.colors[colorOffset]!;
    const hg = hints.colors[colorOffset + 1]!;
    const hb = hints.colors[colorOffset + 2]!;
    const dr = r - hr;
    const dg = g - hg;
    const db = b - hb;
    if (dr * dr + dg * dg + db * db <= 150 * 150 * 3) {
      return true;
    }

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const hintMax = Math.max(hr, hg, hb);
    const hintMin = Math.min(hr, hg, hb);
    if (max >= 64 && hintMax >= 48 && min <= 96 && hintMin <= 96) {
      return true;
    }

    if (isDarkDominantMatteColor(r, g, b) && hintMax >= 48) {
      return true;
    }
  }

  return false;
}

function isMatteHintColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  return max >= 48 && spread >= 32 && colorfulness(r, g, b) >= 64 && !isProtectedSubjectColor(r, g, b);
}

function hasCoolLowAlphaMatteEvidence(image: RGBAImage, alphaThreshold: number): boolean {
  let coolCount = 0;
  let magentaCount = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! >= alphaThreshold) {
      continue;
    }

    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    if (isCoolDarkMatteEvidenceColor(r, g, b)) {
      coolCount += 1;
    } else if (darkDominantMatteFamilyMask(r, g, b) === (1 | 4)) {
      magentaCount += 1;
    }
  }

  return coolCount >= 500 && coolCount > magentaCount * 1.5;
}

function isLowAlphaBackgroundHintColor(r: number, g: number, b: number, allowDarkNeutralHints: boolean): boolean {
  return isDarkDominantMatteColor(r, g, b) || (allowDarkNeutralHints && isDarkNeutralBackgroundColor(r, g, b));
}

function isCoolDarkMatteEvidenceColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  if (max > 120) {
    return false;
  }

  const greenOrCyan = g >= 24 && g - r >= 16;
  const blueCyan = b >= 24 && b - r >= 18 && b - g <= 40;
  return greenOrCyan || blueCyan;
}

function isArtificialChromaMatteColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const artificialChroma = max >= 150 && spread >= 96 && colorfulness(r, g, b) >= 180;
  return artificialChroma || isMutedArtificialMatteColor(r, g, b);
}

function isMutedArtificialMatteColor(r: number, g: number, b: number): boolean {
  const mutedGreenMatte = g >= 64 && g - r >= 24 && g - b >= 24;
  const mutedMagentaMatte = r >= 90 && b >= 64 && g <= Math.min(r, b) - 24;
  return mutedGreenMatte || mutedMagentaMatte || isDarkDominantMatteColor(r, g, b);
}

function isProtectedSubjectColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const brightness = r + g + b;
  const darkNeutral = max <= 72 && spread <= 56;
  const brightNeutral = brightness >= 620 && spread <= 56;
  const mutedDarkSubject = max <= 128 && min >= 24 && brightness <= 300 && spread <= 96;
  return darkNeutral || brightNeutral || mutedDarkSubject;
}

function chromaFamilyMask(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  if (max < 48 || spread < 32) {
    return 0;
  }

  const threshold = max - Math.max(24, Math.round(spread * 0.35));
  let mask = 0;
  if (r >= threshold) {
    mask |= 1;
  }
  if (g >= threshold) {
    mask |= 2;
  }
  if (b >= threshold) {
    mask |= 4;
  }
  return mask;
}

function matteFamilyMask(r: number, g: number, b: number): number {
  return chromaFamilyMask(r, g, b) || darkDominantMatteFamilyMask(r, g, b) || (isDarkNeutralBackgroundColor(r, g, b) ? DARK_BACKGROUND_FAMILY_MASK : 0);
}

function darkDominantMatteFamilyMask(r: number, g: number, b: number): number {
  const green = g >= 24 && g - r >= 18 && g - b >= 18;
  const magenta = r >= 32 && b >= 24 && Math.min(r, b) - g >= 18;
  if (green) {
    return 2;
  }
  if (magenta) {
    return 1 | 4;
  }
  return 0;
}

function isDarkDominantMatteColor(r: number, g: number, b: number): boolean {
  return darkDominantMatteFamilyMask(r, g, b) !== 0;
}

function isDarkNeutralBackgroundColor(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max <= 72 && max - min <= 44;
}

function colorfulness(r: number, g: number, b: number): number {
  return Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
}

function hasSubjectColorNeighbor(
  image: RGBAImage,
  outsideMask: Uint8Array,
  x: number,
  y: number,
  alphaThreshold: number,
  hints: MatteHints
): boolean {
  return hasSubjectColorSupport(image, outsideMask, x, y, alphaThreshold, hints, 1);
}

function hasSubjectColorSupport(
  image: RGBAImage,
  outsideMask: Uint8Array,
  x: number,
  y: number,
  alphaThreshold: number,
  hints: MatteHints,
  minNeighbors: number
): boolean {
  let subjectNeighbors = 0;
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
      if (outsideMask[neighbor] === 1) {
        continue;
      }

      const offset = neighbor * 4;
      if (image.data[offset + 3]! < alphaThreshold) {
        continue;
      }

      const r = image.data[offset]!;
      const g = image.data[offset + 1]!;
      const b = image.data[offset + 2]!;
      if (!matchesMatteHint(r, g, b, hints) && !isArtificialChromaMatteColor(r, g, b)) {
        subjectNeighbors += 1;
        if (subjectNeighbors >= minNeighbors) {
          return true;
        }
      }
    }
  }

  return false;
}

function hasOutsideNeighbor(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || mask[ny * width + nx] === 1) {
        return true;
      }
    }
  }

  return false;
}

function hasStrongLocalColorSupport(image: RGBAImage, outsideMask: Uint8Array, x: number, y: number, alphaThreshold: number): boolean {
  const offset = (y * image.width + x) * 4;
  const r = image.data[offset]!;
  const g = image.data[offset + 1]!;
  const b = image.data[offset + 2]!;
  const family = chromaFamilyMask(r, g, b);
  let similar = 0;

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
      if (outsideMask[neighbor] === 1) {
        continue;
      }
      const neighborOffset = neighbor * 4;
      if (image.data[neighborOffset + 3]! < alphaThreshold) {
        continue;
      }
      if (chromaFamilyMask(image.data[neighborOffset]!, image.data[neighborOffset + 1]!, image.data[neighborOffset + 2]!) !== family) {
        continue;
      }

      const dr = r - image.data[neighborOffset]!;
      const dg = g - image.data[neighborOffset + 1]!;
      const db = b - image.data[neighborOffset + 2]!;
      if (dr * dr + dg * dg + db * db <= 72 * 72 * 3) {
        similar += 1;
      }
    }
  }

  return similar >= 3;
}

function createMorphologyDiagnostics(settings: MorphologyCleanupSettings | undefined): MorphologyDiagnostics {
  return {
    enabled: settings?.enabled ?? false,
    target: settings?.matteCleanup ? "alpha+matte" : "alpha",
    operationCount: 0,
    openedPixels: 0,
    closedPixels: 0,
    filledHolePixels: 0,
    mattePixels: 0,
    matteColorCount: 0,
    removedComponentPixels: 0,
    pinholePixels: 0,
    tinyComponentPixels: 0,
    brokenOutlinePixels: 0,
    warnings: []
  };
}

function countAddedPixels(before: Uint8Array, after: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < before.length; index += 1) {
    if (before[index] === 0 && after[index] === 1) {
      count += 1;
    }
  }
  return count;
}

function countRemovedPixels(before: Uint8Array, after: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < before.length; index += 1) {
    if (before[index] === 1 && after[index] === 0) {
      count += 1;
    }
  }
  return count;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.round(value!));
}

function normalizeAlphaThreshold(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ALPHA_THRESHOLD;
  }
  return Math.max(1, Math.min(255, Math.round(value!)));
}
