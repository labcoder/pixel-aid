import type { RGBAImage } from "@pixelaid/shared";
import {
  applyBicubicLikeRinging,
  applyBoundaryWarp,
  applyBoxBlur,
  applyCellArtifact,
  applyChromaNoise,
  applyLowFrequencyColorField,
  upscaleNativeImage,
  type NativeSizeCellArtifact,
  type NativeSizeResample
} from "./nativeSizeDegradations";
import {
  createImage,
  fillEllipse,
  fillRect,
  type Color
} from "./imagePrimitives";

export type Step1OFailureMechanism =
  | "harmonic-sparse-undersegmentation"
  | "aspect-ratio-collapse"
  | "one-cell-boundary-bias"
  | "general-undersegmentation"
  | "protected-control";

export type Step1OAcceptance =
  | "native-exact"
  | "stable-incumbent";

export type Step1ONativeSizeFixture = {
  id: string;
  failureMechanism: Step1OFailureMechanism;
  acceptance: Step1OAcceptance;
  description: string;
  nativeWidth: number;
  nativeHeight: number;
  expectedScaleX: number;
  expectedScaleY: number;
  provenance: "first-party-synthetic";
  derivedFromBenchmarkIdentity: false;
  protects: readonly string[];
  createNativeImage: () => RGBAImage;
  createInputImage: () => RGBAImage;
};

type Step1OFixtureDefinition = {
  id: string;
  failureMechanism: Step1OFailureMechanism;
  acceptance?: Step1OAcceptance;
  description: string;
  nativeWidth: number;
  nativeHeight: number;
  scaleX: number;
  scaleY: number;
  resample: NativeSizeResample;
  motifVariant: number;
  blurPasses?: number;
  chromaNoise?: number;
  colorField?: number;
  ringing?: number;
  cellArtifact?: {
    kind: NativeSizeCellArtifact;
    amplitude: number;
  };
  boundaryWarp?: {
    amplitude: number;
    period: number;
  };
  protects: readonly string[];
};

const definitions: readonly Step1OFixtureDefinition[] = [
  {
    id: "step1o-harmonic-sparse-orbit-24x24",
    failureMechanism: "harmonic-sparse-undersegmentation",
    description:
      "Sparse orbital marker whose meaningful transitions repeat every third native cell.",
    nativeWidth: 24,
    nativeHeight: 24,
    scaleX: 5.84,
    scaleY: 5.79,
    resample: "bilinear",
    motifVariant: 0,
    blurPasses: 1,
    chromaNoise: 3,
    protects: [
      "sparse transparent art",
      "third-harmonic rejection",
      "fractional-scale recovery"
    ]
  },
  {
    id: "step1o-harmonic-soft-rune-16x16",
    failureMechanism: "harmonic-sparse-undersegmentation",
    description:
      "Softened rune with large flat blocks and deliberately divisor-friendly four-cell spacing.",
    nativeWidth: 16,
    nativeHeight: 16,
    scaleX: 6.18,
    scaleY: 6.24,
    resample: "nearest",
    motifVariant: 1,
    blurPasses: 2,
    protects: [
      "broad transition bands",
      "four-cell harmonic rejection",
      "square-grid recovery"
    ]
  },
  {
    id: "step1o-harmonic-signal-18x18",
    failureMechanism: "harmonic-sparse-undersegmentation",
    description:
      "Compact signal glyph with repeated six-cell lobes over a low-frequency color field.",
    nativeWidth: 18,
    nativeHeight: 18,
    scaleX: 5.47,
    scaleY: 5.53,
    resample: "bilinear",
    motifVariant: 2,
    colorField: 5,
    cellArtifact: {
      kind: "gradient",
      amplitude: 3
    },
    protects: [
      "six-cell harmonic rejection",
      "cell-internal gradients",
      "low-frequency drift"
    ]
  },
  {
    id: "step1o-harmonic-wide-probe-44x15",
    failureMechanism: "harmonic-sparse-undersegmentation",
    description:
      "Very wide sparse probe whose short source period can disappear before pair construction.",
    nativeWidth: 44,
    nativeHeight: 15,
    scaleX: 3.73,
    scaleY: 6.11,
    resample: "bilinear",
    motifVariant: 3,
    blurPasses: 1,
    boundaryWarp: {
      amplitude: 1,
      period: 31
    },
    protects: [
      "missing-axis proposal coverage",
      "very wide sparse evidence",
      "small horizontal source period"
    ]
  },
  {
    id: "step1o-aspect-wide-console-32x20",
    failureMechanism: "aspect-ratio-collapse",
    description:
      "Wide console with strong column evidence and intentionally weak row transitions.",
    nativeWidth: 32,
    nativeHeight: 20,
    scaleX: 4.21,
    scaleY: 6.76,
    resample: "bilinear",
    motifVariant: 0,
    blurPasses: 1,
    protects: [
      "wide aspect ratio",
      "weak horizontal evidence",
      "anisotropic source periods"
    ]
  },
  {
    id: "step1o-aspect-tall-console-20x32",
    failureMechanism: "aspect-ratio-collapse",
    description:
      "Tall console transposing the weak-axis stress without sharing image identity.",
    nativeWidth: 20,
    nativeHeight: 32,
    scaleX: 6.72,
    scaleY: 4.18,
    resample: "bilinear",
    motifVariant: 1,
    blurPasses: 1,
    protects: [
      "tall aspect ratio",
      "weak vertical evidence",
      "anisotropic source periods"
    ]
  },
  {
    id: "step1o-aspect-square-lattice-16x16",
    failureMechanism: "aspect-ratio-collapse",
    description:
      "Square lattice where chroma noise obscures one axis more strongly than the other.",
    nativeWidth: 16,
    nativeHeight: 16,
    scaleX: 5.06,
    scaleY: 7.44,
    resample: "nearest",
    motifVariant: 2,
    chromaNoise: 4,
    cellArtifact: {
      kind: "noise",
      amplitude: 2
    },
    protects: [
      "square native aspect",
      "axis-independent evidence",
      "chroma-noise robustness"
    ]
  },
  {
    id: "step1o-aspect-thin-ribbon-28x14",
    failureMechanism: "aspect-ratio-collapse",
    description:
      "Thin ribbon with a strong long axis and only two broad cross-axis bands.",
    nativeWidth: 28,
    nativeHeight: 14,
    scaleX: 4.48,
    scaleY: 8.07,
    resample: "nearest",
    motifVariant: 3,
    blurPasses: 2,
    protects: [
      "thin native canvases",
      "two-to-one aspect ratio",
      "weak short-axis evidence"
    ]
  },
  {
    id: "step1o-boundary-pin-13x9",
    failureMechanism: "one-cell-boundary-bias",
    description:
      "Small pin icon whose one-cell border competes with fractional chroma-noisy boundaries.",
    nativeWidth: 13,
    nativeHeight: 9,
    scaleX: 4.46,
    scaleY: 4.51,
    resample: "bilinear",
    motifVariant: 0,
    chromaNoise: 3,
    protects: [
      "one-cell terminal boundaries",
      "small non-square output",
      "fractional-scale rounding"
    ]
  },
  {
    id: "step1o-boundary-soft-frame-17x18",
    failureMechanism: "one-cell-boundary-bias",
    description:
      "Soft framed badge with unequal native dimensions and broad outer transition ramps.",
    nativeWidth: 17,
    nativeHeight: 18,
    scaleX: 4.83,
    scaleY: 4.76,
    resample: "nearest",
    motifVariant: 1,
    blurPasses: 2,
    protects: [
      "adjacent dimension arbitration",
      "broad outer boundary ramps",
      "unequal native dimensions"
    ]
  },
  {
    id: "step1o-boundary-ringed-chip-16x16",
    failureMechanism: "one-cell-boundary-bias",
    description:
      "Dense chip with resampling halos that create plausible adjacent boundary counts.",
    nativeWidth: 16,
    nativeHeight: 16,
    scaleX: 5.31,
    scaleY: 5.28,
    resample: "bilinear",
    motifVariant: 2,
    ringing: 0.72,
    protects: [
      "adjacent-count rejection",
      "ringing halos",
      "dense interior evidence"
    ]
  },
  {
    id: "step1o-boundary-warped-panel-31x20",
    failureMechanism: "one-cell-boundary-bias",
    description:
      "Wide panel whose final row and column boundaries drift by one source pixel.",
    nativeWidth: 31,
    nativeHeight: 20,
    scaleX: 4.17,
    scaleY: 5.38,
    resample: "nearest",
    motifVariant: 3,
    boundaryWarp: {
      amplitude: 1,
      period: 27
    },
    blurPasses: 1,
    protects: [
      "one-cell count stability",
      "local boundary drift",
      "wide non-common dimension"
    ]
  },
  {
    id: "step1o-underseg-soft-medallion-18x18",
    failureMechanism: "general-undersegmentation",
    description:
      "Soft medallion whose detailed center competes with a simpler lower-resolution explanation.",
    nativeWidth: 18,
    nativeHeight: 18,
    scaleX: 6.34,
    scaleY: 6.29,
    resample: "bilinear",
    motifVariant: 0,
    blurPasses: 1,
    protects: [
      "non-power-of-two dimensions",
      "detail-versus-complexity balance",
      "soft bilinear recovery"
    ]
  },
  {
    id: "step1o-underseg-fractional-gem-16x16",
    failureMechanism: "general-undersegmentation",
    description:
      "Layered gem under strongly fractional scaling and mild within-cell texture.",
    nativeWidth: 16,
    nativeHeight: 16,
    scaleX: 5.57,
    scaleY: 5.43,
    resample: "nearest",
    motifVariant: 1,
    cellArtifact: {
      kind: "texture",
      amplitude: 3
    },
    protects: [
      "fractional nearest scaling",
      "cell-internal texture",
      "layered native details"
    ]
  },
  {
    id: "step1o-underseg-noisy-insignia-22x14",
    failureMechanism: "general-undersegmentation",
    description:
      "Low-contrast insignia with blur and chroma variation across a rectangular grid.",
    nativeWidth: 22,
    nativeHeight: 14,
    scaleX: 5.11,
    scaleY: 6.37,
    resample: "bilinear",
    motifVariant: 2,
    blurPasses: 1,
    chromaNoise: 3,
    protects: [
      "low-contrast transitions",
      "rectangular native grid",
      "blur-plus-chroma degradation"
    ]
  },
  {
    id: "step1o-underseg-field-device-30x18",
    failureMechanism: "general-undersegmentation",
    description:
      "Field device with nested rectangles and a softly displaced internal grid.",
    nativeWidth: 30,
    nativeHeight: 18,
    scaleX: 4.92,
    scaleY: 5.88,
    resample: "bilinear",
    motifVariant: 3,
    boundaryWarp: {
      amplitude: 1,
      period: 31
    },
    colorField: 4,
    protects: [
      "nested rectangle detail",
      "mild local grid drift",
      "low-frequency color field"
    ]
  },
  {
    id: "step1o-control-dense-grid-24x24",
    failureMechanism: "protected-control",
    description:
      "Dense exact-period grid that guards established crisp robust inference.",
    nativeWidth: 24,
    nativeHeight: 24,
    scaleX: 6,
    scaleY: 6,
    resample: "nearest",
    motifVariant: 0,
    protects: [
      "crisp-grid exactness",
      "integer source periods",
      "dense transition evidence"
    ]
  },
  {
    id: "step1o-control-rectangular-grid-21x17",
    failureMechanism: "protected-control",
    description:
      "Dense unequal-dimension control guarding independent exact axis counts.",
    nativeWidth: 21,
    nativeHeight: 17,
    scaleX: 5,
    scaleY: 5,
    resample: "nearest",
    motifVariant: 1,
    protects: [
      "rectangular-grid exactness",
      "independent axis counts",
      "non-common native dimensions"
    ]
  },
  {
    id: "step1o-control-transparent-sprite-16x24",
    failureMechanism: "protected-control",
    description:
      "Transparent sprite control guarding full-canvas robust inference without bounds cropping.",
    nativeWidth: 16,
    nativeHeight: 24,
    scaleX: 7,
    scaleY: 7,
    resample: "nearest",
    motifVariant: 2,
    protects: [
      "transparent sparse sprite",
      "full-canvas inference",
      "integer source periods"
    ]
  },
  {
    id: "step1o-control-ambiguous-cross-24x24",
    failureMechanism: "protected-control",
    acceptance: "stable-incumbent",
    description:
      "Blurred symmetric cross guarding against unsupported higher-resolution switches.",
    nativeWidth: 24,
    nativeHeight: 24,
    scaleX: 6,
    scaleY: 6,
    resample: "nearest",
    motifVariant: 3,
    blurPasses: 1,
    protects: [
      "conservative ambiguity handling",
      "harmonic switch rejection",
      "stable incumbent selection"
    ]
  }
];

export const step1oNativeSizeCorpus: readonly Step1ONativeSizeFixture[] =
  definitions.map(createFixture);

function createFixture(
  definition: Step1OFixtureDefinition
): Step1ONativeSizeFixture {
  const inputWidth = Math.round(
    definition.nativeWidth * definition.scaleX
  );
  const inputHeight = Math.round(
    definition.nativeHeight * definition.scaleY
  );
  return {
    id: definition.id,
    failureMechanism: definition.failureMechanism,
    acceptance: definition.acceptance ?? "native-exact",
    description: definition.description,
    nativeWidth: definition.nativeWidth,
    nativeHeight: definition.nativeHeight,
    expectedScaleX: inputWidth / definition.nativeWidth,
    expectedScaleY: inputHeight / definition.nativeHeight,
    provenance: "first-party-synthetic",
    derivedFromBenchmarkIdentity: false,
    protects: definition.protects,
    createNativeImage: () => createNativeImage(definition),
    createInputImage: () => createDistortedImage(definition)
  };
}

function createDistortedImage(
  definition: Step1OFixtureDefinition
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
  if (definition.ringing) {
    image = applyBicubicLikeRinging(
      image,
      definition.ringing
    );
  }
  if (definition.cellArtifact) {
    image = applyCellArtifact(
      image,
      definition.scaleX,
      definition.scaleY,
      definition.cellArtifact.kind,
      definition.cellArtifact.amplitude
    );
  }
  if (definition.chromaNoise) {
    image = applyChromaNoise(
      image,
      definition.chromaNoise,
      2_117 + definition.motifVariant * 97
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
  definition: Step1OFixtureDefinition
): RGBAImage {
  switch (definition.failureMechanism) {
    case "harmonic-sparse-undersegmentation":
      return createHarmonicSparseMotif(
        definition.nativeWidth,
        definition.nativeHeight,
        definition.motifVariant
      );
    case "aspect-ratio-collapse":
      return createWeakAxisMotif(
        definition.nativeWidth,
        definition.nativeHeight,
        definition.motifVariant
      );
    case "one-cell-boundary-bias":
      return createBoundaryMotif(
        definition.nativeWidth,
        definition.nativeHeight,
        definition.motifVariant
      );
    case "general-undersegmentation":
      return createNestedDetailMotif(
        definition.nativeWidth,
        definition.nativeHeight,
        definition.motifVariant
      );
    case "protected-control":
      return definition.acceptance === "stable-incumbent"
        ? createAmbiguousControl(
            definition.nativeWidth,
            definition.nativeHeight
          )
        : createDenseControl(
            definition.nativeWidth,
            definition.nativeHeight,
            definition.motifVariant
          );
  }
}

const TRANSPARENT = [0, 0, 0, 0] as const;
const BACKGROUND = [31, 38, 54, 255] as const;
const INK = [18, 24, 39, 255] as const;
const SHADOW = [50, 64, 82, 255] as const;
const MID = [77, 119, 112, 255] as const;
const LIGHT = [142, 186, 132, 255] as const;
const HIGHLIGHT = [240, 219, 157, 255] as const;
const ACCENT = [199, 70, 79, 255] as const;
const COOL = [76, 126, 176, 255] as const;

function createHarmonicSparseMotif(
  width: number,
  height: number,
  variant: number
): RGBAImage {
  const image = createImage(width, height, TRANSPARENT);
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const divisor = 3 + (variant % 2);
  const bodyWidth = Math.max(4, divisor * 2);
  const bodyHeight = Math.max(4, divisor * 2);
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
  for (let offset = divisor; offset < Math.min(width, height) / 2; offset += divisor) {
    setPixel(image, centerX - offset, centerY, LIGHT);
    setPixel(image, centerX + offset - 1, centerY, LIGHT);
    setPixel(image, centerX, centerY - offset, COOL);
    setPixel(image, centerX, centerY + offset - 1, COOL);
  }
  fillRect(
    image.data,
    width,
    height,
    Math.max(1, centerX - 1),
    1,
    2,
    Math.max(2, centerY - bodyHeight),
    SHADOW
  );
  setPixel(image, 1 + variant, 1, HIGHLIGHT);
  setPixel(
    image,
    width - 2,
    Math.max(1, height - 2 - variant),
    ACCENT
  );
  return image;
}

function createWeakAxisMotif(
  width: number,
  height: number,
  variant: number
): RGBAImage {
  const image = createImage(width, height, BACKGROUND);
  const emphasizeColumns =
    variant === 0 ||
    variant === 2 ||
    (variant === 3 && width > height);
  if (emphasizeColumns) {
    for (let x = 2; x < width - 2; x += 2 + (variant & 1)) {
      fillRect(
        image.data,
        width,
        height,
        x,
        Math.max(1, Math.floor(height * 0.22)),
        1,
        Math.max(2, Math.floor(height * 0.56)),
        x % 4 === 0 ? LIGHT : MID
      );
    }
    fillRect(
      image.data,
      width,
      height,
      1,
      Math.floor(height * 0.47),
      width - 2,
      Math.max(1, Math.floor(height * 0.12)),
      INK
    );
  } else {
    for (let y = 2; y < height - 2; y += 2 + (variant & 1)) {
      fillRect(
        image.data,
        width,
        height,
        Math.max(1, Math.floor(width * 0.22)),
        y,
        Math.max(2, Math.floor(width * 0.56)),
        1,
        y % 4 === 0 ? LIGHT : MID
      );
    }
    fillRect(
      image.data,
      width,
      height,
      Math.floor(width * 0.47),
      1,
      Math.max(1, Math.floor(width * 0.12)),
      height - 2,
      INK
    );
  }
  fillEllipse(
    image.data,
    width,
    height,
    (width - 1) / 2,
    (height - 1) / 2,
    Math.max(1, Math.floor(width * 0.1)),
    Math.max(1, Math.floor(height * 0.1)),
    ACCENT
  );
  setPixel(image, 1, height - 2, HIGHLIGHT);
  setPixel(image, width - 2, 1, COOL);
  return image;
}

function createBoundaryMotif(
  width: number,
  height: number,
  variant: number
): RGBAImage {
  const image = createImage(width, height, BACKGROUND);
  fillRect(
    image.data,
    width,
    height,
    1,
    1,
    width - 2,
    height - 2,
    INK
  );
  fillRect(
    image.data,
    width,
    height,
    2,
    2,
    Math.max(1, width - 4),
    Math.max(1, height - 4),
    MID
  );
  const terminalX = variant % 2 === 0 ? width - 1 : 0;
  const terminalY = variant < 2 ? height - 1 : 0;
  for (let y = 0; y < height; y += 2) {
    setPixel(
      image,
      terminalX,
      y,
      y % 4 === 0 ? HIGHLIGHT : ACCENT
    );
  }
  for (let x = 0; x < width; x += 2) {
    setPixel(
      image,
      x,
      terminalY,
      x % 4 === 0 ? COOL : LIGHT
    );
  }
  fillRect(
    image.data,
    width,
    height,
    Math.floor(width * 0.35),
    Math.floor(height * 0.35),
    Math.max(2, Math.floor(width * 0.3)),
    Math.max(2, Math.floor(height * 0.3)),
    SHADOW
  );
  setPixel(
    image,
    Math.floor(width / 2),
    Math.floor(height / 2),
    HIGHLIGHT
  );
  return image;
}

function createNestedDetailMotif(
  width: number,
  height: number,
  variant: number
): RGBAImage {
  const image = createImage(width, height, BACKGROUND);
  const layers = Math.max(2, Math.min(4, Math.floor(Math.min(width, height) / 5)));
  const colors = [INK, COOL, MID, SHADOW] as const;
  for (let layer = 0; layer < layers; layer += 1) {
    const inset = 1 + layer * 2;
    fillRect(
      image.data,
      width,
      height,
      inset,
      inset,
      Math.max(1, width - inset * 2),
      Math.max(1, height - inset * 2),
      colors[(layer + variant) % colors.length]!
    );
  }
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  for (let offset = -3; offset <= 3; offset += 2) {
    fillRect(
      image.data,
      width,
      height,
      centerX + offset,
      Math.max(1, centerY - 3),
      1,
      Math.min(7, height - 2),
      offset === 1 ? ACCENT : LIGHT
    );
  }
  setPixel(image, centerX, centerY, HIGHLIGHT);
  setPixel(image, 1, height - 2, ACCENT);
  return image;
}

function createDenseControl(
  width: number,
  height: number,
  variant: number
): RGBAImage {
  const image = createImage(
    width,
    height,
    variant === 2 ? TRANSPARENT : BACKGROUND
  );
  const palette = [INK, SHADOW, MID, LIGHT, COOL] as const;
  const inset = variant === 2 ? 2 : 0;
  for (let y = inset; y < height - inset; y += 1) {
    for (let x = inset; x < width - inset; x += 1) {
      const mixed =
        Math.imul(x + 5 + variant, 73_856_093) ^
        Math.imul(y + 11, 19_349_663);
      setPixel(
        image,
        x,
        y,
        palette[(mixed >>> 0) % palette.length]!
      );
    }
  }
  setPixel(image, inset, inset, HIGHLIGHT);
  setPixel(
    image,
    width - inset - 1,
    height - inset - 1,
    ACCENT
  );
  return image;
}

function createAmbiguousControl(
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
    COOL
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
