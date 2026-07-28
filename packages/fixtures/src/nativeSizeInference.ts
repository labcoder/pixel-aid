import type { RGBAImage } from "@pixelaid/shared";
import { clampByte, createImage, fillRect } from "./imagePrimitives";

export type NativeSizeFailureClass =
  | "harmonic"
  | "fractional"
  | "non-square"
  | "softened"
  | "local-drift"
  | "combined";

export type NativeSizeInferenceFixture = {
  id: string;
  failureClass: NativeSizeFailureClass;
  description: string;
  nativeWidth: number;
  nativeHeight: number;
  expectedScaleX: number;
  expectedScaleY: number;
  createImage: () => RGBAImage;
};

export type NativeSizeDistortionOptions = {
  scaleX: number;
  scaleY: number;
  resample: "nearest" | "bilinear";
  blurPasses?: number;
  noiseAmplitude?: number;
  driftAmplitude?: number;
};

export type NativeSizeInferenceFixtureInput = {
  id: string;
  failureClass: NativeSizeFailureClass;
  description: string;
  nativeWidth: number;
  nativeHeight: number;
  distortion: NativeSizeDistortionOptions;
};

const BACKGROUND = [222, 184, 232, 255] as const;
const OUTLINE = [24, 32, 56, 255] as const;
const DARK = [38, 90, 65, 255] as const;
const MID = [67, 148, 83, 255] as const;
const LIGHT = [116, 199, 91, 255] as const;
const HIGHLIGHT = [237, 239, 211, 255] as const;

export const nativeSizeInferenceFixtures: readonly NativeSizeInferenceFixture[] = [
  createNativeSizeInferenceFixture({
    id: "harmonic-clean-nearest",
    failureClass: "harmonic",
    description: "Clean 8x nearest-neighbor blocks with broad same-color runs that expose divisor harmonics.",
    nativeWidth: 16,
    nativeHeight: 16,
    distortion: { scaleX: 8, scaleY: 8, resample: "nearest" }
  }),
  createNativeSizeInferenceFixture({
    id: "fractional-nearest",
    failureClass: "fractional",
    description: "Nearest-neighbor reconstruction with alternating three/four-pixel source blocks.",
    nativeWidth: 24,
    nativeHeight: 20,
    distortion: { scaleX: 3.92, scaleY: 3.9, resample: "nearest" }
  }),
  createNativeSizeInferenceFixture({
    id: "non-square-nearest",
    failureClass: "non-square",
    description: "Independent horizontal and vertical pseudo-pixel scales.",
    nativeWidth: 20,
    nativeHeight: 24,
    distortion: { scaleX: 3.75, scaleY: 6.625, resample: "nearest" }
  }),
  createNativeSizeInferenceFixture({
    id: "soft-bilinear",
    failureClass: "softened",
    description: "Fractional bilinear upscale followed by one deterministic box-blur pass.",
    nativeWidth: 16,
    nativeHeight: 16,
    distortion: { scaleX: 6.8125, scaleY: 6.8125, resample: "bilinear", blurPasses: 1 }
  }),
  createNativeSizeInferenceFixture({
    id: "row-local-drift",
    failureClass: "local-drift",
    description: "Nominal six-pixel blocks whose horizontal boundaries drift by row.",
    nativeWidth: 24,
    nativeHeight: 24,
    distortion: { scaleX: 6.04, scaleY: 6.04, resample: "nearest", driftAmplitude: 2 }
  }),
  createNativeSizeInferenceFixture({
    id: "combined-soft-drift-noise",
    failureClass: "combined",
    description: "Fractional non-square upscale with bilinear softening, drift, blur, and deterministic color noise.",
    nativeWidth: 24,
    nativeHeight: 16,
    distortion: {
      scaleX: 7.58,
      scaleY: 7.625,
      resample: "bilinear",
      blurPasses: 1,
      noiseAmplitude: 3,
      driftAmplitude: 2
    }
  })
];

export function createNativeSizeInferenceFixture(
  input: NativeSizeInferenceFixtureInput
): NativeSizeInferenceFixture {
  const outputWidth = Math.round(input.nativeWidth * input.distortion.scaleX);
  const outputHeight = Math.round(input.nativeHeight * input.distortion.scaleY);
  return {
    id: input.id,
    failureClass: input.failureClass,
    description: input.description,
    nativeWidth: input.nativeWidth,
    nativeHeight: input.nativeHeight,
    expectedScaleX: outputWidth / input.nativeWidth,
    expectedScaleY: outputHeight / input.nativeHeight,
    createImage: () => distortNativeSprite(createNativeSprite(input.nativeWidth, input.nativeHeight), input.distortion)
  };
}

function createNativeSprite(width: number, height: number): RGBAImage {
  const image = createImage(width, height, BACKGROUND);
  const centerX = Math.floor(width / 2);
  const bodyLeft = Math.max(2, Math.floor(width * 0.2));
  const bodyTop = Math.max(2, Math.floor(height * 0.25));
  const bodyWidth = Math.max(5, width - bodyLeft * 2);
  const bodyHeight = Math.max(5, Math.floor(height * 0.55));

  fillRect(image.data, width, height, bodyLeft - 1, bodyTop - 1, bodyWidth + 2, bodyHeight + 2, OUTLINE);
  fillRect(image.data, width, height, bodyLeft, bodyTop, bodyWidth, bodyHeight, MID);
  fillRect(image.data, width, height, bodyLeft + 1, bodyTop + 1, Math.max(2, bodyWidth - 2), 2, LIGHT);
  fillRect(image.data, width, height, bodyLeft + 1, bodyTop + Math.floor(bodyHeight / 2), bodyWidth - 2, Math.max(2, bodyHeight / 3), DARK);
  fillRect(image.data, width, height, bodyLeft + 2, bodyTop + 3, 2, 2, HIGHLIGHT);
  fillRect(image.data, width, height, bodyLeft + bodyWidth - 4, bodyTop + 3, 2, 2, HIGHLIGHT);
  fillRect(image.data, width, height, centerX - 1, bodyTop + bodyHeight - 1, 3, 2, OUTLINE);

  // Deliberate one-cell edge accents keep the source recognizably authored
  // while the broad body regions retain realistic harmonic ambiguity.
  setPixel(image, 1, 1, OUTLINE);
  setPixel(image, width - 2, 1, LIGHT);
  setPixel(image, 1, height - 2, DARK);
  setPixel(image, width - 2, height - 2, HIGHLIGHT);
  return image;
}

function distortNativeSprite(native: RGBAImage, options: NativeSizeDistortionOptions): RGBAImage {
  const width = Math.round(native.width * options.scaleX);
  const height = Math.round(native.height * options.scaleY);
  let output = createImage(width, height, BACKGROUND);

  for (let y = 0; y < height; y += 1) {
    const driftX = deterministicDrift(y, options.driftAmplitude ?? 0);
    for (let x = 0; x < width; x += 1) {
      const driftY = deterministicDrift(x + 11, options.driftAmplitude ?? 0);
      const sourceX = (x + 0.5 + driftX) / options.scaleX - 0.5;
      const sourceY = (y + 0.5 + driftY) / options.scaleY - 0.5;
      const targetOffset = (y * width + x) * 4;
      if (options.resample === "nearest") {
        sampleNearest(native, sourceX, sourceY, output.data, targetOffset);
      } else {
        sampleBilinear(native, sourceX, sourceY, output.data, targetOffset);
      }
    }
  }

  for (let pass = 0; pass < (options.blurPasses ?? 0); pass += 1) {
    output = boxBlur(output);
  }
  if ((options.noiseAmplitude ?? 0) > 0) {
    addNoise(output, options.noiseAmplitude!);
  }
  return output;
}

function sampleNearest(native: RGBAImage, x: number, y: number, target: Uint8ClampedArray, targetOffset: number): void {
  const sourceX = clampIndex(Math.round(x), native.width);
  const sourceY = clampIndex(Math.round(y), native.height);
  copyPixel(native.data, (sourceY * native.width + sourceX) * 4, target, targetOffset);
}

function sampleBilinear(native: RGBAImage, x: number, y: number, target: Uint8ClampedArray, targetOffset: number): void {
  const x0Raw = Math.floor(x);
  const y0Raw = Math.floor(y);
  const tx = x - x0Raw;
  const ty = y - y0Raw;
  const x0 = clampIndex(x0Raw, native.width);
  const y0 = clampIndex(y0Raw, native.height);
  const x1 = clampIndex(x0Raw + 1, native.width);
  const y1 = clampIndex(y0Raw + 1, native.height);
  const offsets = [
    (y0 * native.width + x0) * 4,
    (y0 * native.width + x1) * 4,
    (y1 * native.width + x0) * 4,
    (y1 * native.width + x1) * 4
  ];
  const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];

  for (let channel = 0; channel < 4; channel += 1) {
    let value = 0;
    for (let sample = 0; sample < offsets.length; sample += 1) {
      value += native.data[offsets[sample]! + channel]! * weights[sample]!;
    }
    target[targetOffset + channel] = clampByte(Math.round(value));
  }
}

function boxBlur(image: RGBAImage): RGBAImage {
  const output = createImage(image.width, image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const targetOffset = (y * image.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const sampleX = clampIndex(x + dx, image.width);
            const sampleY = clampIndex(y + dy, image.height);
            sum += image.data[(sampleY * image.width + sampleX) * 4 + channel]!;
            count += 1;
          }
        }
        output.data[targetOffset + channel] = Math.round(sum / count);
      }
      output.data[targetOffset + 3] = 255;
    }
  }
  return output;
}

function addNoise(image: RGBAImage, amplitude: number): void {
  const range = amplitude * 2 + 1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const noise = ((x * 17 + y * 31 + x * y * 3) % range) - amplitude;
      image.data[offset] = clampByte(image.data[offset]! + noise);
      image.data[offset + 1] = clampByte(image.data[offset + 1]! + noise);
      image.data[offset + 2] = clampByte(image.data[offset + 2]! + noise);
    }
  }
}

function deterministicDrift(position: number, amplitude: number): number {
  if (amplitude <= 0) {
    return 0;
  }
  const period = amplitude * 4 + 3;
  const saw = position % period;
  return saw <= period / 2 ? Math.min(amplitude, saw) : Math.max(-amplitude, period - saw - amplitude);
}

function clampIndex(value: number, size: number): number {
  return Math.max(0, Math.min(size - 1, value));
}

function copyPixel(source: Uint8ClampedArray, sourceOffset: number, target: Uint8ClampedArray, targetOffset: number): void {
  target[targetOffset] = source[sourceOffset]!;
  target[targetOffset + 1] = source[sourceOffset + 1]!;
  target[targetOffset + 2] = source[sourceOffset + 2]!;
  target[targetOffset + 3] = source[sourceOffset + 3]!;
}

function setPixel(image: RGBAImage, x: number, y: number, color: readonly [number, number, number, number]): void {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = color[3];
}
