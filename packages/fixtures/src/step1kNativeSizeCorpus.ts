import type { RGBAImage } from "@pixelaid/shared";
import {
  applyBoundaryWarp,
  applyBoxBlur,
  applyChromaNoise,
  applyLowFrequencyColorField,
  upscaleNativeImage,
  type NativeSizeResample
} from "./nativeSizeDegradations";
import {
  createImage,
  fillEllipse,
  fillRect,
  type Color
} from "./imagePrimitives";

export type Step1KFailureClass =
  | "adjacent-count"
  | "sparse-harmonic"
  | "anisotropic-collapse";

export type Step1KNativeSizeFixture = {
  id: string;
  failureClass: Step1KFailureClass;
  description: string;
  nativeWidth: number;
  nativeHeight: number;
  expectedScaleX: number;
  expectedScaleY: number;
  provenance: "first-party-synthetic";
  protects: readonly string[];
  createNativeImage: () => RGBAImage;
  createInputImage: () => RGBAImage;
};

type Step1KFixtureDefinition = {
  id: string;
  failureClass: Step1KFailureClass;
  description: string;
  nativeWidth: number;
  nativeHeight: number;
  scaleX: number;
  scaleY: number;
  resample: NativeSizeResample;
  blurPasses?: number;
  boundaryWarp?: {
    amplitude: number;
    period: number;
  };
  chromaNoise?: number;
  colorField?: number;
  protects: readonly string[];
};

const definitions: readonly Step1KFixtureDefinition[] = [
  {
    id: "step1k-adjacent-wide-31x23",
    failureClass: "adjacent-count",
    description:
      "Dense asymmetric art at fractional scales where a neighboring column or row count can reconstruct nearly as well.",
    nativeWidth: 31,
    nativeHeight: 23,
    scaleX: 5.18,
    scaleY: 5.31,
    resample: "bilinear",
    blurPasses: 1,
    protects: ["adjacent count arbitration", "fractional scale", "dense boundaries"]
  },
  {
    id: "step1k-adjacent-wide-47x31",
    failureClass: "adjacent-count",
    description:
      "Wide nonstandard native dimensions with fractional softening and weak one-cell alternatives.",
    nativeWidth: 47,
    nativeHeight: 31,
    scaleX: 3.72,
    scaleY: 4.17,
    resample: "bilinear",
    chromaNoise: 2,
    protects: ["off-by-one columns", "wide aspect ratio", "soft boundary evidence"]
  },
  {
    id: "step1k-adjacent-tall-19x29",
    failureClass: "adjacent-count",
    description:
      "Tall nonstandard art with mild local boundary displacement around fractional block sizes.",
    nativeWidth: 19,
    nativeHeight: 29,
    scaleX: 6.34,
    scaleY: 5.66,
    resample: "nearest",
    boundaryWarp: { amplitude: 1, period: 23 },
    protects: ["off-by-one rows", "local boundary displacement", "tall aspect ratio"]
  },
  {
    id: "step1k-sparse-harmonic-32x48",
    failureClass: "sparse-harmonic",
    description:
      "Sparse transparent character whose broad empty interior supports divisor harmonics.",
    nativeWidth: 32,
    nativeHeight: 48,
    scaleX: 5,
    scaleY: 5,
    resample: "nearest",
    colorField: 7,
    protects: ["transparent sparse art", "harmonic rejection", "weak flat interiors"]
  },
  {
    id: "step1k-sparse-harmonic-36x28",
    failureClass: "sparse-harmonic",
    description:
      "Sparse horizontal prop with isolated one-cell marks and fractionally softened blocks.",
    nativeWidth: 36,
    nativeHeight: 28,
    scaleX: 4.48,
    scaleY: 4.54,
    resample: "bilinear",
    protects: ["isolated one-cell evidence", "sparse horizontal silhouettes", "fractional blocks"]
  },
  {
    id: "step1k-sparse-harmonic-40x64",
    failureClass: "sparse-harmonic",
    description:
      "Large sparse silhouette under mild blur, retaining long transparent and same-color runs.",
    nativeWidth: 40,
    nativeHeight: 64,
    scaleX: 3.76,
    scaleY: 3.81,
    resample: "nearest",
    blurPasses: 1,
    protects: ["large sparse canvases", "blurred silhouettes", "divisor harmonics"]
  },
  {
    id: "step1k-anisotropic-landscape-30x18",
    failureClass: "anisotropic-collapse",
    description:
      "Landscape art with strongly different horizontal and vertical source-cell scales.",
    nativeWidth: 30,
    nativeHeight: 18,
    scaleX: 7.17,
    scaleY: 4.39,
    resample: "bilinear",
    protects: [
      "independent axis scales",
      "landscape aspect preservation",
      "soft axis evidence"
    ]
  },
  {
    id: "step1k-anisotropic-portrait-22x38",
    failureClass: "anisotropic-collapse",
    description:
      "Portrait art whose independently scaled axes must not collapse toward a square hypothesis.",
    nativeWidth: 22,
    nativeHeight: 38,
    scaleX: 4.63,
    scaleY: 7.08,
    resample: "nearest",
    chromaNoise: 3,
    protects: [
      "portrait aspect preservation",
      "independent axis proposals",
      "chroma-noise tolerance"
    ]
  },
  {
    id: "step1k-anisotropic-banner-48x20",
    failureClass: "anisotropic-collapse",
    description:
      "Very wide art with soft nonuniform scaling and a deliberately weak vertical axis.",
    nativeWidth: 48,
    nativeHeight: 20,
    scaleX: 3.31,
    scaleY: 6.19,
    resample: "bilinear",
    blurPasses: 1,
    protects: ["extreme aspect preservation", "weak-axis support", "non-square scaling"]
  }
];

export const step1kNativeSizeCorpus: readonly Step1KNativeSizeFixture[] =
  definitions.map(createFixture);

function createFixture(
  definition: Step1KFixtureDefinition
): Step1KNativeSizeFixture {
  const outputWidth = Math.round(
    definition.nativeWidth * definition.scaleX
  );
  const outputHeight = Math.round(
    definition.nativeHeight * definition.scaleY
  );
  return {
    id: definition.id,
    failureClass: definition.failureClass,
    description: definition.description,
    nativeWidth: definition.nativeWidth,
    nativeHeight: definition.nativeHeight,
    expectedScaleX: outputWidth / definition.nativeWidth,
    expectedScaleY: outputHeight / definition.nativeHeight,
    provenance: "first-party-synthetic",
    protects: definition.protects,
    createNativeImage: () => createNativeImage(definition),
    createInputImage: () => createDistortedImage(definition)
  };
}

function createDistortedImage(
  definition: Step1KFixtureDefinition
): RGBAImage {
  let image = upscaleNativeImage(
    createNativeImage(definition),
    definition.scaleX,
    definition.scaleY,
    definition.resample
  );
  if (definition.boundaryWarp) {
    image = applyBoundaryWarp(
      image,
      definition.boundaryWarp.amplitude,
      definition.boundaryWarp.period
    );
  }
  if (definition.blurPasses) {
    image = applyBoxBlur(image, definition.blurPasses);
  }
  if (definition.chromaNoise) {
    image = applyChromaNoise(image, definition.chromaNoise, 113);
  }
  if (definition.colorField) {
    image = applyLowFrequencyColorField(
      image,
      definition.colorField
    );
  }
  return image;
}

function createNativeImage(
  definition: Step1KFixtureDefinition
): RGBAImage {
  switch (definition.failureClass) {
    case "adjacent-count":
      return createDenseNativeImage(
        definition.nativeWidth,
        definition.nativeHeight
      );
    case "sparse-harmonic":
      return createSparseNativeImage(
        definition.nativeWidth,
        definition.nativeHeight
      );
    case "anisotropic-collapse":
      return createAnisotropicNativeImage(
        definition.nativeWidth,
        definition.nativeHeight
      );
  }
}

const TRANSPARENT = [0, 0, 0, 0] as const;
const INK = [24, 29, 45, 255] as const;
const DARK = [47, 72, 82, 255] as const;
const MID = [75, 132, 110, 255] as const;
const LIGHT = [139, 190, 132, 255] as const;
const HIGHLIGHT = [236, 226, 173, 255] as const;
const ACCENT = [205, 79, 76, 255] as const;
const BACKGROUND = [42, 47, 65, 255] as const;

function createDenseNativeImage(
  width: number,
  height: number
): RGBAImage {
  const image = createImage(width, height, BACKGROUND);
  for (let y = 1; y < height - 1; y += 3) {
    const offset = (y * 5) % 7;
    for (let x = 1 - offset; x < width - 1; x += 7) {
      const color = ((x + y) & 1) === 0 ? MID : DARK;
      fillRect(image.data, width, height, x, y, 5, 2, color);
      fillRect(image.data, width, height, x + 1, y, 2, 1, LIGHT);
    }
  }
  fillRect(image.data, width, height, 0, 0, width, 1, INK);
  fillRect(image.data, width, height, 0, height - 1, width, 1, INK);
  setPixel(image, 1, 1, HIGHLIGHT);
  setPixel(image, width - 2, height - 2, ACCENT);
  return image;
}

function createSparseNativeImage(
  width: number,
  height: number
): RGBAImage {
  const image = createImage(width, height, TRANSPARENT);
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const bodyWidth = Math.max(6, Math.floor(width * 0.22));
  const bodyHeight = Math.max(8, Math.floor(height * 0.36));
  fillRect(
    image.data,
    width,
    height,
    centerX - Math.floor(bodyWidth / 2) - 1,
    centerY - Math.floor(bodyHeight / 2) - 1,
    bodyWidth + 2,
    bodyHeight + 2,
    INK
  );
  fillRect(
    image.data,
    width,
    height,
    centerX - Math.floor(bodyWidth / 2),
    centerY - Math.floor(bodyHeight / 2),
    bodyWidth,
    bodyHeight,
    MID
  );
  fillRect(
    image.data,
    width,
    height,
    centerX - 1,
    Math.max(1, centerY - Math.floor(height * 0.3)),
    2,
    Math.max(2, Math.floor(height * 0.16)),
    LIGHT
  );
  fillRect(
    image.data,
    width,
    height,
    Math.max(1, centerX - Math.floor(width * 0.3)),
    centerY,
    Math.max(2, Math.floor(width * 0.18)),
    2,
    DARK
  );
  fillRect(
    image.data,
    width,
    height,
    centerX + Math.max(2, Math.floor(width * 0.12)),
    centerY - 2,
    Math.max(2, Math.floor(width * 0.17)),
    2,
    ACCENT
  );
  setPixel(image, 2, 3, HIGHLIGHT);
  setPixel(image, width - 3, height - 4, ACCENT);
  setPixel(image, centerX - 2, centerY - 2, HIGHLIGHT);
  return image;
}

function createAnisotropicNativeImage(
  width: number,
  height: number
): RGBAImage {
  const image = createImage(width, height, BACKGROUND);
  const radiusX = Math.max(3, Math.floor(width * 0.34));
  const radiusY = Math.max(3, Math.floor(height * 0.27));
  fillEllipse(
    image.data,
    width,
    height,
    (width - 1) / 2,
    (height - 1) / 2,
    radiusX,
    radiusY,
    INK
  );
  fillEllipse(
    image.data,
    width,
    height,
    (width - 1) / 2,
    (height - 1) / 2,
    Math.max(2, radiusX - 2),
    Math.max(2, radiusY - 2),
    MID
  );
  fillRect(
    image.data,
    width,
    height,
    Math.floor(width * 0.12),
    Math.floor(height * 0.2),
    Math.max(2, Math.floor(width * 0.18)),
    2,
    LIGHT
  );
  fillRect(
    image.data,
    width,
    height,
    Math.floor(width * 0.63),
    Math.floor(height * 0.66),
    Math.max(2, Math.floor(width * 0.2)),
    2,
    DARK
  );
  setPixel(image, 1, height - 2, HIGHLIGHT);
  setPixel(image, width - 2, 1, ACCENT);
  return image;
}

function setPixel(
  image: RGBAImage,
  x: number,
  y: number,
  color: Color
): void {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = color[0];
  image.data[offset + 1] = color[1];
  image.data[offset + 2] = color[2];
  image.data[offset + 3] = color[3];
}
