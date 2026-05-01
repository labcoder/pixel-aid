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

  return {
    image: applyMaskToAlphaImage(image, sourceMask, currentMask, alphaThreshold),
    diagnostics
  };
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

function createMorphologyDiagnostics(settings: MorphologyCleanupSettings | undefined): MorphologyDiagnostics {
  return {
    enabled: settings?.enabled ?? false,
    target: "alpha",
    operationCount: 0,
    openedPixels: 0,
    closedPixels: 0,
    filledHolePixels: 0,
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
