import type { Rect, RGBAImage, SemanticFringeCleanupDiagnostics } from "@pixelaid/shared";
import { parseHexColor } from "./color";
import { cloneImage } from "./image";

const DEFAULT_ALPHA_THRESHOLD = 8;
const DEFAULT_BUCKET_DISTANCE = 36;
const SOURCE_COORDINATE_SEMANTIC_DISTANCE = 50;
const SOURCE_COORDINATE_GREEN_OVER_RED = 1.15;
const SOURCE_COORDINATE_GREEN_OVER_BLUE = 1.1;
const SOURCE_BACKGROUND_DISTANCE = 30;

export type SemanticFringeCleanupOptions = {
  colors?: readonly string[];
  replacementColor?: string;
  alphaThreshold?: number;
  bucketDistance?: number;
};

export type SemanticFringeCleanupResult = {
  image: RGBAImage;
  diagnostics: SemanticFringeCleanupDiagnostics;
};

export type SourceCoordinateSemanticFringeReplacementOptions = {
  source: RGBAImage;
  sourceRect?: Rect;
  finalOffsetX?: number;
  finalOffsetY?: number;
  colors?: readonly string[];
  replacementColor: string;
  alphaThreshold?: number;
};

export type SourceCoordinateSemanticFringeReplacementResult = {
  image: RGBAImage;
  changedPixels: number;
};

export function applySourceCoordinateSemanticFringeReplacement(
  image: RGBAImage,
  options: SourceCoordinateSemanticFringeReplacementOptions
): SourceCoordinateSemanticFringeReplacementResult {
  const colors = normalizeColors(options.colors);
  if (colors.length === 0) {
    return { image, changedPixels: 0 };
  }

  const alphaThreshold = Math.max(0, Math.min(255, Math.round(options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD)));
  const semanticThresholdSq = SOURCE_COORDINATE_SEMANTIC_DISTANCE * SOURCE_COORDINATE_SEMANTIC_DISTANCE;
  const sourceRect = normalizeSourceRect(options.sourceRect, options.source);
  const sourceExteriorSemantic = buildSourceExteriorSemanticMask(options.source, sourceRect, colors, semanticThresholdSq, alphaThreshold);
  const replacementColor = parseHexColor(options.replacementColor);
  const replacementR = (replacementColor >> 16) & 0xff;
  const replacementG = (replacementColor >> 8) & 0xff;
  const replacementB = replacementColor & 0xff;
  const finalOffsetX = Math.max(0, Math.round(options.finalOffsetX ?? 0));
  const finalOffsetY = Math.max(0, Math.round(options.finalOffsetY ?? 0));
  const contentWidth = Math.max(1, image.width - finalOffsetX * 2);
  const contentHeight = Math.max(1, image.height - finalOffsetY * 2);
  const output = cloneImage(image);
  let changedPixels = 0;

  for (let y = 0; y < image.height; y += 1) {
    const localY = y - finalOffsetY;
    if (localY < 0 || localY >= contentHeight) {
      continue;
    }
    const sourceY = sourceRect.y + Math.min(sourceRect.h - 1, Math.floor(((localY + 0.5) * sourceRect.h) / contentHeight));
    for (let x = 0; x < image.width; x += 1) {
      const localX = x - finalOffsetX;
      if (localX < 0 || localX >= contentWidth) {
        continue;
      }
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3]! < alphaThreshold || !matchesExactSemanticColor(image.data, offset, colors, semanticThresholdSq)) {
        continue;
      }
      const sourceX = sourceRect.x + Math.min(sourceRect.w - 1, Math.floor(((localX + 0.5) * sourceRect.w) / contentWidth));
      if (sourceExteriorSemantic[sourceY * options.source.width + sourceX] !== 1) {
        continue;
      }
      if (image.data[offset] === replacementR && image.data[offset + 1] === replacementG && image.data[offset + 2] === replacementB) {
        continue;
      }
      output.data[offset] = replacementR;
      output.data[offset + 1] = replacementG;
      output.data[offset + 2] = replacementB;
      changedPixels += 1;
    }
  }

  return { image: changedPixels > 0 ? output : image, changedPixels };
}

export function applySemanticFringeCleanup(
  image: RGBAImage,
  options: SemanticFringeCleanupOptions = {}
): SemanticFringeCleanupResult {
  const colors = normalizeColors(options.colors);
  const diagnostics: SemanticFringeCleanupDiagnostics = {
    enabled: colors.length > 0,
    colorCount: colors.length,
    clearedPixels: 0
  };
  if (colors.length === 0) {
    return { image: cloneImage(image), diagnostics };
  }

  const output = cloneImage(image);
  const matcher = createBucketMatcher(colors, options.bucketDistance ?? DEFAULT_BUCKET_DISTANCE);
  const replacementColor = options.replacementColor !== undefined ? parseHexColor(options.replacementColor) : undefined;
  diagnostics.clearedPixels = clearExteriorConnectedFringe(
    output,
    matcher,
    Math.max(0, Math.min(255, Math.round(options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD))),
    replacementColor
  );
  return { image: output, diagnostics };
}

function normalizeColors(colors: readonly string[] | undefined): number[] {
  if (!colors || colors.length === 0) {
    return [];
  }
  const normalized: number[] = [];
  const seen = new Set<number>();
  for (const color of colors) {
    const parsed = parseHexColor(color);
    if (seen.has(parsed)) {
      continue;
    }
    seen.add(parsed);
    normalized.push(parsed);
  }
  return normalized;
}

function createBucketMatcher(colors: readonly number[], distance: number): Uint8Array {
  const lut = new Uint8Array(4096);
  const thresholdSq = distance * distance;
  for (let bucket = 0; bucket < lut.length; bucket += 1) {
    const r = ((bucket >> 8) & 0xf) * 16 + 8;
    const g = ((bucket >> 4) & 0xf) * 16 + 8;
    const b = (bucket & 0xf) * 16 + 8;
    for (let index = 0; index < colors.length; index += 1) {
      const color = colors[index]!;
      const dr = r - ((color >> 16) & 0xff);
      const dg = g - ((color >> 8) & 0xff);
      const db = b - (color & 0xff);
      if (dr * dr + dg * dg + db * db <= thresholdSq) {
        lut[bucket] = 1;
        break;
      }
    }
  }
  return lut;
}

function normalizeSourceRect(rect: Rect | undefined, image: RGBAImage): Rect {
  if (!rect) {
    return { x: 0, y: 0, w: image.width, h: image.height };
  }
  const x = Math.max(0, Math.min(image.width - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(rect.y)));
  const maxW = Math.max(1, image.width - x);
  const maxH = Math.max(1, image.height - y);
  return {
    x,
    y,
    w: Math.max(1, Math.min(maxW, Math.round(rect.w))),
    h: Math.max(1, Math.min(maxH, Math.round(rect.h)))
  };
}

function buildSourceExteriorSemanticMask(
  image: RGBAImage,
  rect: Rect,
  colors: readonly number[],
  semanticThresholdSq: number,
  alphaThreshold: number
): Uint8Array {
  const exterior = new Uint8Array(image.width * image.height);
  const semantic = new Uint8Array(image.width * image.height);
  const queue = new Int32Array(rect.w * rect.h);
  const background = dominantBorderColor(image, alphaThreshold);
  let read = 0;
  let write = 0;

  const enqueue = (x: number, y: number): void => {
    if (x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h) {
      return;
    }
    const index = y * image.width + x;
    if (exterior[index] === 1) {
      return;
    }
    const offset = index * 4;
    if (!isSourceExteriorPassable(image.data, offset, colors, semanticThresholdSq, background, alphaThreshold)) {
      return;
    }
    exterior[index] = 1;
    if (image.data[offset + 3]! >= alphaThreshold && matchesExactSemanticColor(image.data, offset, colors, semanticThresholdSq)) {
      semantic[index] = 1;
    }
    queue[write] = index;
    write += 1;
  };

  for (let x = rect.x; x < rect.x + rect.w; x += 1) {
    enqueue(x, rect.y);
    enqueue(x, rect.y + rect.h - 1);
  }
  for (let y = rect.y + 1; y < rect.y + rect.h - 1; y += 1) {
    enqueue(rect.x, y);
    enqueue(rect.x + rect.w - 1, y);
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
        enqueue(x + dx, y + dy);
      }
    }
  }

  return semantic;
}

function dominantBorderColor(image: RGBAImage, alphaThreshold: number): number | undefined {
  const counts = new Uint32Array(4096);
  const sumR = new Uint32Array(4096);
  const sumG = new Uint32Array(4096);
  const sumB = new Uint32Array(4096);
  const add = (x: number, y: number): void => {
    const offset = (y * image.width + x) * 4;
    if (image.data[offset + 3]! < alphaThreshold) {
      return;
    }
    const bucket = bucketForOffset(image.data, offset);
    counts[bucket] = counts[bucket]! + 1;
    sumR[bucket] = sumR[bucket]! + image.data[offset]!;
    sumG[bucket] = sumG[bucket]! + image.data[offset + 1]!;
    sumB[bucket] = sumB[bucket]! + image.data[offset + 2]!;
  };

  for (let x = 0; x < image.width; x += 1) {
    add(x, 0);
    add(x, image.height - 1);
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    add(0, y);
    add(image.width - 1, y);
  }

  let bestBucket = -1;
  let bestCount = 0;
  for (let bucket = 0; bucket < counts.length; bucket += 1) {
    const count = counts[bucket]!;
    if (count > bestCount) {
      bestCount = count;
      bestBucket = bucket;
    }
  }
  if (bestBucket < 0 || bestCount === 0) {
    return undefined;
  }
  const r = Math.round(sumR[bestBucket]! / bestCount);
  const g = Math.round(sumG[bestBucket]! / bestCount);
  const b = Math.round(sumB[bestBucket]! / bestCount);
  return (r << 16) | (g << 8) | b;
}

function isSourceExteriorPassable(
  data: Uint8ClampedArray,
  offset: number,
  colors: readonly number[],
  semanticThresholdSq: number,
  background: number | undefined,
  alphaThreshold: number
): boolean {
  const alpha = data[offset + 3]!;
  if (alpha < alphaThreshold) {
    return true;
  }
  if (matchesExactSemanticColor(data, offset, colors, semanticThresholdSq)) {
    return true;
  }
  if (background === undefined) {
    return false;
  }
  return rgbDistanceSq(data[offset]!, data[offset + 1]!, data[offset + 2]!, (background >> 16) & 0xff, (background >> 8) & 0xff, background & 0xff) <= SOURCE_BACKGROUND_DISTANCE * SOURCE_BACKGROUND_DISTANCE;
}

function matchesExactSemanticColor(data: Uint8ClampedArray, offset: number, colors: readonly number[], thresholdSq: number): boolean {
  const r = data[offset]!;
  const g = data[offset + 1]!;
  const b = data[offset + 2]!;
  for (let index = 0; index < colors.length; index += 1) {
    const color = colors[index]!;
    if (
      matchesSourceCoordinateColorFamily(r, g, b, color) &&
      rgbDistanceSq(r, g, b, (color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff) <= thresholdSq
    ) {
      return true;
    }
  }
  return false;
}

function matchesSourceCoordinateColorFamily(r: number, g: number, b: number, color: number): boolean {
  const semanticR = (color >> 16) & 0xff;
  const semanticG = (color >> 8) & 0xff;
  const semanticB = color & 0xff;
  if (semanticG > semanticR * SOURCE_COORDINATE_GREEN_OVER_RED && semanticG > semanticB * SOURCE_COORDINATE_GREEN_OVER_BLUE) {
    return g > r * SOURCE_COORDINATE_GREEN_OVER_RED && g > b * SOURCE_COORDINATE_GREEN_OVER_BLUE;
  }
  return true;
}

function bucketForOffset(data: Uint8ClampedArray, offset: number): number {
  return ((data[offset]! >> 4) << 8) | ((data[offset + 1]! >> 4) << 4) | (data[offset + 2]! >> 4);
}

function rgbDistanceSq(r: number, g: number, b: number, rr: number, gg: number, bb: number): number {
  const dr = r - rr;
  const dg = g - gg;
  const db = b - bb;
  return dr * dr + dg * dg + db * db;
}

function clearExteriorConnectedFringe(image: RGBAImage, matcher: Uint8Array, alphaThreshold: number, replacementColor: number | undefined): number {
  const { width, height, data } = image;
  const pixelCount = width * height;
  const exterior = new Uint8Array(pixelCount);
  const fringeState = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const component = new Int32Array(pixelCount);
  let read = 0;
  let write = 0;
  let clearedPixels = 0;

  const enqueueTransparentExterior = (index: number): void => {
    if (exterior[index] === 1) {
      return;
    }
    const offset = index * 4;
    if (data[offset + 3]! >= alphaThreshold) {
      return;
    }
    exterior[index] = 1;
    queue[write] = index;
    write += 1;
  };

  const bucketForOffset = (offset: number): number =>
    ((data[offset]! >> 4) << 8) | ((data[offset + 1]! >> 4) << 4) | (data[offset + 2]! >> 4);

  const processFringeComponent = (start: number): void => {
    if (fringeState[start] !== 0) {
      return;
    }

    let componentRead = 0;
    let componentWrite = 0;
    let touchesRetainedOpaque = false;
    fringeState[start] = 1;
    component[componentWrite] = start;
    componentWrite += 1;

    while (componentRead < componentWrite) {
      const current = component[componentRead]!;
      componentRead += 1;
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
          const offset = neighbor * 4;
          if (data[offset + 3]! < alphaThreshold) {
            continue;
          }
          const bucket = bucketForOffset(offset);
          if (matcher[bucket] === 1) {
            if (fringeState[neighbor] === 0) {
              fringeState[neighbor] = 1;
              component[componentWrite] = neighbor;
              componentWrite += 1;
            }
            continue;
          }
          touchesRetainedOpaque = true;
        }
      }
    }

    if (replacementColor !== undefined) {
      const r = (replacementColor >> 16) & 0xff;
      const g = (replacementColor >> 8) & 0xff;
      const b = replacementColor & 0xff;
      for (let index = 0; index < componentWrite; index += 1) {
        const offset = component[index]! * 4;
        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        fringeState[component[index]!] = 2;
      }
      return;
    }

    if (touchesRetainedOpaque) {
      return;
    }

    for (let index = 0; index < componentWrite; index += 1) {
      const pixel = component[index]!;
      const offset = pixel * 4;
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
      exterior[pixel] = 1;
      fringeState[pixel] = 2;
      queue[write] = pixel;
      write += 1;
    }
    clearedPixels += componentWrite;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueTransparentExterior(x);
    enqueueTransparentExterior((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueTransparentExterior(y * width);
    enqueueTransparentExterior(y * width + width - 1);
  }

  // Connectivity invariant: the queue contains only pixels proven connected to the exterior transparent
  // region. Matching fringe components are cleared only after confirming that the whole component is
  // detached from retained opaque subject pixels, so semantic cleanup cannot open subject-boundary gaps.
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
        if (exterior[neighbor] === 1) {
          continue;
        }
        const offset = neighbor * 4;
        if (data[offset + 3]! < alphaThreshold) {
          exterior[neighbor] = 1;
          queue[write] = neighbor;
          write += 1;
          continue;
        }
        const bucket = bucketForOffset(offset);
        if (matcher[bucket] !== 1) {
          continue;
        }
        processFringeComponent(neighbor);
      }
    }
  }

  return clearedPixels;
}
