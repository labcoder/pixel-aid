import type { RGBAImage, SemanticFringeCleanupDiagnostics } from "@pixelaid/shared";
import { parseHexColor } from "./color";
import { cloneImage } from "./image";

const DEFAULT_ALPHA_THRESHOLD = 8;
const DEFAULT_BUCKET_DISTANCE = 36;

export type SemanticFringeCleanupOptions = {
  colors?: readonly string[];
  alphaThreshold?: number;
  bucketDistance?: number;
};

export type SemanticFringeCleanupResult = {
  image: RGBAImage;
  diagnostics: SemanticFringeCleanupDiagnostics;
};

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
  diagnostics.clearedPixels = clearExteriorConnectedFringe(
    output,
    matcher,
    Math.max(0, Math.min(255, Math.round(options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD)))
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

function clearExteriorConnectedFringe(image: RGBAImage, matcher: Uint8Array, alphaThreshold: number): number {
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
