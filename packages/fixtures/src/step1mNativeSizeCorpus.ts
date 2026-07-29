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

export type Step1MFailureClass =
  | "grid-soften"
  | "sparse-low-evidence"
  | "weak-axis"
  | "ambiguity-control";

export type Step1MAcceptance =
  | "native-exact"
  | "stable-incumbent";

export type Step1MNativeSizeFixture = {
  id: string;
  failureClass: Step1MFailureClass;
  acceptance: Step1MAcceptance;
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

type Step1MFixtureDefinition = {
  id: string;
  failureClass: Step1MFailureClass;
  acceptance?: Step1MAcceptance;
  description: string;
  nativeWidth: number;
  nativeHeight: number;
  scaleX: number;
  scaleY: number;
  resample: NativeSizeResample;
  blurPasses?: number;
  chromaNoise?: number;
  colorField?: number;
  boundaryWarp?: {
    amplitude: number;
    period: number;
  };
  protects: readonly string[];
};

const definitions: readonly Step1MFixtureDefinition[] = [
  {
    id: "step1m-grid-soften-emblem-24x24",
    failureClass: "grid-soften",
    description:
      "Compact emblem with broad two-pass boundary ramps and sparse internal highlights.",
    nativeWidth: 24,
    nativeHeight: 24,
    scaleX: 6,
    scaleY: 6,
    resample: "nearest",
    blurPasses: 2,
    protects: [
      "broad transition bands",
      "square native grid",
      "sparse internal boundaries"
    ]
  },
  {
    id: "step1m-grid-soften-panel-32x20",
    failureClass: "grid-soften",
    description:
      "Wide low-contrast panel under fractional bilinear scaling and a softened boundary pass.",
    nativeWidth: 32,
    nativeHeight: 20,
    scaleX: 5.42,
    scaleY: 5.65,
    resample: "bilinear",
    blurPasses: 1,
    colorField: 4,
    protects: [
      "fractional softened boundaries",
      "wide aspect ratio",
      "low-frequency color drift"
    ]
  },
  {
    id: "step1m-grid-soften-totem-18x30",
    failureClass: "grid-soften",
    description:
      "Tall totem with repeated narrow details whose boundaries become overlapping blur ramps.",
    nativeWidth: 18,
    nativeHeight: 30,
    scaleX: 7.1,
    scaleY: 6.83,
    resample: "nearest",
    blurPasses: 2,
    chromaNoise: 1,
    protects: [
      "overlapping blur ramps",
      "tall aspect ratio",
      "weak repeated details"
    ]
  },
  {
    id: "step1m-grid-soften-banner-48x16",
    failureClass: "grid-soften",
    description:
      "Very wide banner whose small horizontal source period is obscured by fractional softening.",
    nativeWidth: 48,
    nativeHeight: 16,
    scaleX: 3.78,
    scaleY: 6.12,
    resample: "bilinear",
    blurPasses: 1,
    boundaryWarp: { amplitude: 1, period: 29 },
    protects: [
      "small horizontal source period",
      "extreme aspect ratio",
      "soft locally displaced boundaries"
    ]
  },
  {
    id: "step1m-sparse-beacon-28x40",
    failureClass: "sparse-low-evidence",
    description:
      "Sparse beacon silhouette with long transparent runs and only a few grid-revealing accents.",
    nativeWidth: 28,
    nativeHeight: 40,
    scaleX: 5.2,
    scaleY: 5.15,
    resample: "bilinear",
    blurPasses: 1,
    protects: [
      "transparent sparse art",
      "harmonic undersegmentation",
      "isolated one-cell accents"
    ]
  },
  {
    id: "step1m-sparse-drone-36x24",
    failureClass: "sparse-low-evidence",
    description:
      "Horizontal drone with large same-color regions and asymmetric single-cell extremities.",
    nativeWidth: 36,
    nativeHeight: 24,
    scaleX: 4.36,
    scaleY: 4.58,
    resample: "nearest",
    blurPasses: 1,
    colorField: 5,
    protects: [
      "flat sparse interiors",
      "fractional native period",
      "asymmetric weak boundaries"
    ]
  },
  {
    id: "step1m-sparse-marker-20x44",
    failureClass: "sparse-low-evidence",
    description:
      "Tall marker with a narrow shaft, separated cap, and divisor-friendly empty space.",
    nativeWidth: 20,
    nativeHeight: 44,
    scaleX: 6.05,
    scaleY: 4.12,
    resample: "nearest",
    chromaNoise: 2,
    protects: [
      "divisor harmonics",
      "anisotropic sparse scale",
      "separated components"
    ]
  },
  {
    id: "step1m-weak-axis-landscape-30x18",
    failureClass: "weak-axis",
    description:
      "Landscape motif with strong vertical boundaries but deliberately scarce horizontal evidence.",
    nativeWidth: 30,
    nativeHeight: 18,
    scaleX: 5.83,
    scaleY: 8.06,
    resample: "bilinear",
    blurPasses: 1,
    protects: [
      "independent axis evidence",
      "weak horizontal boundaries",
      "landscape preservation"
    ]
  },
  {
    id: "step1m-weak-axis-portrait-22x38",
    failureClass: "weak-axis",
    description:
      "Portrait motif with strong horizontal boundaries and a weak, softly scaled vertical axis.",
    nativeWidth: 22,
    nativeHeight: 38,
    scaleX: 7.27,
    scaleY: 4.31,
    resample: "bilinear",
    chromaNoise: 2,
    protects: [
      "independent axis evidence",
      "weak vertical boundaries",
      "portrait preservation"
    ]
  },
  {
    id: "step1m-weak-axis-ribbon-42x14",
    failureClass: "weak-axis",
    description:
      "Thin ribbon with repeated columns and almost no row transitions after softening.",
    nativeWidth: 42,
    nativeHeight: 14,
    scaleX: 4.24,
    scaleY: 8.43,
    resample: "nearest",
    blurPasses: 2,
    protects: [
      "thin native canvases",
      "near-empty weak axis",
      "repeated strong-axis columns"
    ]
  },
  {
    id: "step1m-control-crisp-grid-26x22",
    failureClass: "ambiguity-control",
    description:
      "Dense crisp control that should remain exactly recoverable without blur-aware arbitration.",
    nativeWidth: 26,
    nativeHeight: 22,
    scaleX: 5,
    scaleY: 5,
    resample: "nearest",
    protects: [
      "crisp-grid non-regression",
      "exact period",
      "dense boundary evidence"
    ]
  },
  {
    id: "step1m-control-ambiguous-cross-24x24",
    failureClass: "ambiguity-control",
    acceptance: "stable-incumbent",
    description:
      "Symmetric cross with intentionally divisor-friendly evidence that must not trigger a weakly supported switch.",
    nativeWidth: 24,
    nativeHeight: 24,
    scaleX: 6,
    scaleY: 6,
    resample: "nearest",
    blurPasses: 1,
    protects: [
      "unsafe-switch rejection",
      "symmetric ambiguity",
      "incumbent stability"
    ]
  }
];

export const step1mNativeSizeCorpus: readonly Step1MNativeSizeFixture[] =
  definitions.map(createFixture);

function createFixture(
  definition: Step1MFixtureDefinition
): Step1MNativeSizeFixture {
  const outputWidth = Math.round(
    definition.nativeWidth * definition.scaleX
  );
  const outputHeight = Math.round(
    definition.nativeHeight * definition.scaleY
  );
  return {
    id: definition.id,
    failureClass: definition.failureClass,
    acceptance: definition.acceptance ?? "native-exact",
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
  definition: Step1MFixtureDefinition
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
    image = applyChromaNoise(
      image,
      definition.chromaNoise,
      1_031
    );
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
  definition: Step1MFixtureDefinition
): RGBAImage {
  switch (definition.failureClass) {
    case "grid-soften":
      return createSoftenedMotif(
        definition.nativeWidth,
        definition.nativeHeight
      );
    case "sparse-low-evidence":
      return createSparseMotif(
        definition.nativeWidth,
        definition.nativeHeight
      );
    case "weak-axis":
      return createWeakAxisMotif(
        definition.nativeWidth,
        definition.nativeHeight
      );
    case "ambiguity-control":
      return definition.acceptance === "stable-incumbent"
        ? createAmbiguousCross(
            definition.nativeWidth,
            definition.nativeHeight
          )
        : createDenseControl(
            definition.nativeWidth,
            definition.nativeHeight
          );
  }
}

const TRANSPARENT = [0, 0, 0, 0] as const;
const INK = [22, 28, 43, 255] as const;
const DARK = [48, 66, 78, 255] as const;
const MID = [75, 126, 105, 255] as const;
const LIGHT = [142, 187, 126, 255] as const;
const HIGHLIGHT = [235, 222, 166, 255] as const;
const ACCENT = [201, 77, 72, 255] as const;
const BACKGROUND = [39, 45, 63, 255] as const;

function createSoftenedMotif(
  width: number,
  height: number
): RGBAImage {
  const image = createImage(width, height, BACKGROUND);
  const insetX = Math.max(2, Math.floor(width * 0.12));
  const insetY = Math.max(2, Math.floor(height * 0.14));
  fillRect(
    image.data,
    width,
    height,
    insetX,
    insetY,
    width - insetX * 2,
    height - insetY * 2,
    INK
  );
  fillRect(
    image.data,
    width,
    height,
    insetX + 2,
    insetY + 2,
    Math.max(2, width - insetX * 2 - 4),
    Math.max(2, height - insetY * 2 - 4),
    MID
  );
  const stripeY = Math.max(1, Math.floor(height * 0.31));
  for (let x = insetX + 2; x < width - insetX - 2; x += 4) {
    fillRect(
      image.data,
      width,
      height,
      x,
      stripeY,
      2,
      Math.max(2, Math.floor(height * 0.16)),
      (x / 2) % 4 === 0 ? LIGHT : DARK
    );
  }
  fillRect(
    image.data,
    width,
    height,
    Math.floor(width * 0.24),
    Math.floor(height * 0.64),
    Math.max(2, Math.floor(width * 0.34)),
    2,
    LIGHT
  );
  fillRect(
    image.data,
    width,
    height,
    Math.floor(width * 0.65),
    Math.floor(height * 0.58),
    Math.max(2, Math.floor(width * 0.15)),
    Math.max(2, Math.floor(height * 0.16)),
    ACCENT
  );
  setPixel(image, insetX + 1, insetY + 1, HIGHLIGHT);
  setPixel(image, width - insetX - 2, height - insetY - 2, ACCENT);
  return image;
}

function createSparseMotif(
  width: number,
  height: number
): RGBAImage {
  const image = createImage(width, height, TRANSPARENT);
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const bodyWidth = Math.max(4, Math.floor(width * 0.24));
  const bodyHeight = Math.max(6, Math.floor(height * 0.3));
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
    Math.max(1, Math.floor(height * 0.14)),
    2,
    Math.max(2, Math.floor(height * 0.2)),
    LIGHT
  );
  fillRect(
    image.data,
    width,
    height,
    Math.max(1, Math.floor(width * 0.12)),
    centerY,
    Math.max(2, Math.floor(width * 0.22)),
    2,
    DARK
  );
  fillRect(
    image.data,
    width,
    height,
    Math.floor(width * 0.67),
    centerY - 1,
    Math.max(2, Math.floor(width * 0.18)),
    2,
    ACCENT
  );
  setPixel(image, 2, 2, HIGHLIGHT);
  setPixel(image, width - 3, height - 3, ACCENT);
  setPixel(image, centerX - 1, centerY - 1, HIGHLIGHT);
  return image;
}

function createWeakAxisMotif(
  width: number,
  height: number
): RGBAImage {
  const image = createImage(width, height, BACKGROUND);
  if (width > height) {
    for (let x = 2; x < width - 2; x += 3) {
      fillRect(
        image.data,
        width,
        height,
        x,
        Math.floor(height * 0.24),
        1,
        Math.max(3, Math.floor(height * 0.52)),
        x % 2 === 0 ? LIGHT : MID
      );
    }
    fillRect(
      image.data,
      width,
      height,
      2,
      Math.floor(height * 0.45),
      width - 4,
      2,
      INK
    );
  } else {
    for (let y = 2; y < height - 2; y += 3) {
      fillRect(
        image.data,
        width,
        height,
        Math.floor(width * 0.24),
        y,
        Math.max(3, Math.floor(width * 0.52)),
        1,
        y % 2 === 0 ? LIGHT : MID
      );
    }
    fillRect(
      image.data,
      width,
      height,
      Math.floor(width * 0.45),
      2,
      2,
      height - 4,
      INK
    );
  }
  fillEllipse(
    image.data,
    width,
    height,
    (width - 1) / 2,
    (height - 1) / 2,
    Math.max(2, Math.floor(width * 0.13)),
    Math.max(2, Math.floor(height * 0.13)),
    ACCENT
  );
  setPixel(image, 1, height - 2, HIGHLIGHT);
  setPixel(image, width - 2, 1, DARK);
  return image;
}

function createDenseControl(
  width: number,
  height: number
): RGBAImage {
  const image = createImage(width, height, BACKGROUND);
  const palette = [INK, DARK, MID, LIGHT] as const;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mixed =
        Math.imul(x + 3, 73_856_093) ^
        Math.imul(y + 7, 19_349_663);
      setPixel(
        image,
        x,
        y,
        palette[(mixed >>> 0) % palette.length]!
      );
    }
  }
  setPixel(image, 0, 0, HIGHLIGHT);
  setPixel(image, width - 1, height - 1, ACCENT);
  return image;
}

function createAmbiguousCross(
  width: number,
  height: number
): RGBAImage {
  const image = createImage(width, height, BACKGROUND);
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  fillRect(
    image.data,
    width,
    height,
    centerX - 2,
    2,
    4,
    height - 4,
    MID
  );
  fillRect(
    image.data,
    width,
    height,
    2,
    centerY - 2,
    width - 4,
    4,
    MID
  );
  fillRect(
    image.data,
    width,
    height,
    centerX - 1,
    centerY - 1,
    2,
    2,
    HIGHLIGHT
  );
  fillRect(image.data, width, height, 2, 2, 2, 2, ACCENT);
  fillRect(
    image.data,
    width,
    height,
    width - 4,
    height - 4,
    2,
    2,
    ACCENT
  );
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
