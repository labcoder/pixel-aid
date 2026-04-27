import type { AlphaCleanupDiagnostics, AlphaCleanupSettings, AlphaMode, RGBAImage } from "@pixelaid/shared";
import { clampByte, parseHexColor } from "./color";
import { cloneImage } from "./image";

export type AlphaCleanupResult = {
  image: RGBAImage;
  diagnostics: AlphaCleanupDiagnostics;
};

export function applyAlphaMode(image: RGBAImage, mode: AlphaMode, options: AlphaCleanupSettings = {}): AlphaCleanupResult {
  const threshold = clampByte(options.threshold ?? 128);
  const tolerance = Math.max(0, Math.round(options.tolerance ?? 18));
  const decontaminateRgb = options.decontaminateRgb ?? mode !== "preserve";
  const transparentRgb = parseHexColor(options.transparentRgb ?? "#000000");

  if (mode === "preserve") {
    const output = cloneImage(image);
    const diagnostics = createDiagnostics(mode, threshold, tolerance, options.colorKey);
    if (decontaminateRgb) {
      decontaminateTransparentRgb(output, transparentRgb, diagnostics);
    } else {
      collectAlphaDiagnostics(output, diagnostics);
    }
    return { image: output, diagnostics };
  }

  if (mode === "binary") {
    return applyBinaryAlpha(image, threshold, tolerance, options.colorKey, decontaminateRgb, transparentRgb);
  }

  if (mode === "colorKey") {
    return applyColorKey(image, threshold, tolerance, options.colorKey, decontaminateRgb, transparentRgb);
  }

  return backgroundFloodFill(image, threshold, tolerance, options.colorKey, decontaminateRgb, transparentRgb);
}

function applyBinaryAlpha(
  image: RGBAImage,
  threshold: number,
  tolerance: number,
  colorKey: string | undefined,
  decontaminateRgb: boolean,
  transparentRgb: number
): AlphaCleanupResult {
  const output = cloneImage(image);
  const diagnostics = createDiagnostics("binary", threshold, tolerance, colorKey);
  for (let offset = 0; offset < output.data.length; offset += 4) {
    output.data[offset + 3] = output.data[offset + 3]! >= threshold ? 255 : 0;
  }

  if (decontaminateRgb) {
    decontaminateTransparentRgb(output, transparentRgb, diagnostics);
  } else {
    collectAlphaDiagnostics(output, diagnostics);
  }

  return { image: output, diagnostics };
}

function applyColorKey(
  image: RGBAImage,
  threshold: number,
  tolerance: number,
  colorKey: string | undefined,
  decontaminateRgb: boolean,
  transparentRgb: number
): AlphaCleanupResult {
  const output = cloneImage(image);
  const diagnostics = createDiagnostics("colorKey", threshold, tolerance, colorKey);
  const keyColor = parseHexColor(colorKey ?? "#ffffff");
  const keyR = (keyColor >> 16) & 0xff;
  const keyG = (keyColor >> 8) & 0xff;
  const keyB = keyColor & 0xff;
  const toleranceSq = tolerance * tolerance * 3;

  for (let offset = 0; offset < output.data.length; offset += 4) {
    const dr = output.data[offset]! - keyR;
    const dg = output.data[offset + 1]! - keyG;
    const db = output.data[offset + 2]! - keyB;
    if (dr * dr + dg * dg + db * db <= toleranceSq) {
      output.data[offset + 3] = 0;
    } else if (output.data[offset + 3]! > 0) {
      output.data[offset + 3] = output.data[offset + 3]! >= threshold ? 255 : 0;
    }
  }

  if (decontaminateRgb) {
    decontaminateTransparentRgb(output, transparentRgb, diagnostics);
  } else {
    collectAlphaDiagnostics(output, diagnostics);
  }

  return { image: output, diagnostics };
}

function backgroundFloodFill(
  image: RGBAImage,
  threshold: number,
  tolerance: number,
  colorKey: string | undefined,
  decontaminateRgb: boolean,
  transparentRgb: number
): AlphaCleanupResult {
  const output = cloneImage(image);
  const visited = new Uint8Array(image.width * image.height);
  const queue = new Int32Array(image.width * image.height);
  const background = 0;
  const toleranceSq = tolerance * tolerance * 3;
  const diagnostics = createDiagnostics("backgroundFloodFill", threshold, tolerance, colorKey);
  let read = 0;
  let write = 0;

  const enqueue = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
      return;
    }

    const index = y * image.width + x;
    if (visited[index] === 1) {
      return;
    }

    const offset = index * 4;
    if (!matchesBackground(image.data, background, offset, toleranceSq)) {
      return;
    }

    visited[index] = 1;
    queue[write] = index;
    write += 1;
  };

  for (let x = 0; x < image.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, image.height - 1);
  }
  for (let y = 0; y < image.height; y += 1) {
    enqueue(0, y);
    enqueue(image.width - 1, y);
  }

  while (read < write) {
    const index = queue[read]!;
    read += 1;
    output.data[index * 4 + 3] = 0;
    const x = index % image.width;
    const y = Math.floor(index / image.width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  if (decontaminateRgb) {
    decontaminateTransparentRgb(output, transparentRgb, diagnostics);
  } else {
    collectAlphaDiagnostics(output, diagnostics);
  }

  return { image: output, diagnostics };
}

function matchesBackground(data: Uint8ClampedArray, backgroundOffset: number, offset: number, toleranceSq: number): boolean {
  const dr = data[offset]! - data[backgroundOffset]!;
  const dg = data[offset + 1]! - data[backgroundOffset + 1]!;
  const db = data[offset + 2]! - data[backgroundOffset + 2]!;
  return dr * dr + dg * dg + db * db <= toleranceSq;
}

function createDiagnostics(mode: AlphaMode, threshold: number, tolerance: number, colorKey: string | undefined): AlphaCleanupDiagnostics {
  return {
    mode,
    threshold,
    tolerance,
    ...(colorKey ? { colorKey } : {}),
    decontaminatedPixels: 0,
    transparentPixels: 0,
    softAlphaPixels: 0,
    warnings: []
  };
}

function collectAlphaDiagnostics(image: RGBAImage, diagnostics: AlphaCleanupDiagnostics): void {
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3]!;
    if (alpha === 0) {
      diagnostics.transparentPixels += 1;
    } else if (alpha < 255) {
      diagnostics.softAlphaPixels += 1;
    }
  }
}

function decontaminateTransparentRgb(image: RGBAImage, transparentRgb: number, diagnostics: AlphaCleanupDiagnostics): void {
  const r = (transparentRgb >> 16) & 0xff;
  const g = (transparentRgb >> 8) & 0xff;
  const b = transparentRgb & 0xff;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3]!;
    if (alpha === 0) {
      diagnostics.transparentPixels += 1;
      if (image.data[offset] !== r || image.data[offset + 1] !== g || image.data[offset + 2] !== b) {
        image.data[offset] = r;
        image.data[offset + 1] = g;
        image.data[offset + 2] = b;
        diagnostics.decontaminatedPixels += 1;
      }
    } else if (alpha < 255) {
      diagnostics.softAlphaPixels += 1;
    }
  }
}
